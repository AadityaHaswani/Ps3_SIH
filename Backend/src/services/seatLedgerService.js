/**
 * Seat Ledger Service.
 * Implements the Academic Mass-Balance Ledger Engine.
 * Manages bucket balances, append-only transactions, idempotent roster sync,
 * intake governance, and ledger integrity verification.
 */
const SeatBalance = require('../models/seatBalance.model');
const SeatLedgerEntry = require('../models/seatLedgerEntry.model');
const SeatBalanceSnapshot = require('../models/seatBalanceSnapshot.model');
const Programme = require('../models/programme.model');
const RosterRow = require('../models/rosterRow.model');
const { getActiveOccupancyRule } = require('./occupancyRuleService');
const {
  normaliseProgrammeCode,
  normaliseAcademicYear,
  normaliseCategory
} = require('../utils/normalisation');

/**
 * Builds canonical unique bucket key.
 */
function buildBucketKey(institutionId, programmeCode, academicYear, seatCategory) {
  const normProg = normaliseProgrammeCode(programmeCode);
  const normYear = normaliseAcademicYear(academicYear);
  const normCat = normaliseCategory(seatCategory);
  return `${institutionId}__${normProg}__${normYear}__${normCat}`;
}

/**
 * Pure calculation of headroom, utilisation, status, and diagnostic flags.
 */
function computeBalanceMetrics(approvedIntake, reportedOccupancy, warningThresholdPct = 90, intakeVerificationStatus = 'NO_INTAKE_CONFIGURED') {
  const occ = Math.max(0, parseInt(reportedOccupancy, 10) || 0);
  const threshold = Number(warningThresholdPct) || 90;

  // Case 1: No intake configured
  if (approvedIntake === null || approvedIntake === undefined || isNaN(approvedIntake)) {
    return {
      approvedIntake: null,
      reportedOccupancy: occ,
      headroom: null,
      utilisationPct: null,
      warningThresholdPct: threshold,
      status: 'NO_INTAKE_CONFIGURED',
      flags: ['NO_INTAKE_CONFIGURED']
    };
  }

  const intake = parseInt(approvedIntake, 10);
  const headroom = intake - occ;
  const utilisationPct = intake > 0 ? Math.round((occ / intake) * 1000) / 10 : null;

  const flags = [];
  let status = 'OK';

  if (intakeVerificationStatus === 'INTAKE_UNVERIFIED') {
    flags.push('INTAKE_UNVERIFIED');
    if (occ > intake) {
      flags.push('PROVISIONAL_OVER_CAP');
    } else if (utilisationPct !== null && utilisationPct >= threshold) {
      flags.push('PROVISIONAL_WARNING');
    }
    status = 'INTAKE_UNVERIFIED';
  } else if (occ > intake) {
    status = 'OVER_CAP_DISCREPANCY';
    flags.push('OVER_CAP_ALERT');
  } else if (utilisationPct !== null && utilisationPct >= threshold) {
    status = 'WARNING';
    flags.push('NEAR_CAPACITY_WARNING');
  } else {
    status = 'OK';
  }

  if (intake === 0) {
    flags.push('ZERO_INTAKE');
  }

  return {
    approvedIntake: intake,
    reportedOccupancy: occ,
    headroom,
    utilisationPct,
    warningThresholdPct: threshold,
    status,
    flags
  };
}

/**
 * Finds or initializes a SeatBalance bucket document.
 */
async function getOrCreateBucket({
  institutionId,
  programmeId,
  programmeCode,
  academicYear,
  seatCategory,
  user = {}
}) {
  const bucketKey = buildBucketKey(institutionId, programmeCode, academicYear, seatCategory);

  let bucket = await SeatBalance.findOne({ bucketKey });
  if (bucket) return bucket;

  // Resolve programmeId if not provided
  let progId = programmeId;
  let defaultApprovedIntake = null;
  let defaultSourceMode = 'SIMULATED';
  let defaultVerificationStatus = 'NO_INTAKE_CONFIGURED';
  let defaultSourceRef = null;

  const progDoc = await Programme.findOne({
    institutionId,
    code: normaliseProgrammeCode(programmeCode)
  }).lean();

  if (progDoc) {
    progId = progDoc._id;
    if (Array.isArray(progDoc.intakeByYear)) {
      const matchIntake = progDoc.intakeByYear.find(
        (iy) =>
          iy.academicYear === normaliseAcademicYear(academicYear) &&
          (iy.seatCategory === normaliseCategory(seatCategory) || iy.seatCategory === 'ALL')
      );

      if (matchIntake && matchIntake.approvedIntake !== undefined) {
        defaultApprovedIntake = matchIntake.approvedIntake;
        defaultSourceMode = matchIntake.sourceMode || 'SIMULATED';
        defaultVerificationStatus =
          matchIntake.label === 'AICTE_APPROVED'
            ? 'AUTHORITY_VERIFIED'
            : matchIntake.label === 'INSTITUTION_DECLARED'
            ? 'INTAKE_UNVERIFIED'
            : 'INTAKE_UNVERIFIED';
        defaultSourceRef = matchIntake.sourceRef || null;
      }
    }
  }

  const rule = await getActiveOccupancyRule({
    institutionId,
    programmeCode,
    academicYear
  });

  const metrics = computeBalanceMetrics(
    defaultApprovedIntake,
    0,
    rule.warningThresholdPct,
    defaultVerificationStatus
  );

  bucket = await SeatBalance.create({
    bucketKey,
    institutionId,
    programmeId: progId || institutionId, // Fallback safe ID if programme master not yet seeded
    programmeCode: normaliseProgrammeCode(programmeCode),
    academicYear: normaliseAcademicYear(academicYear),
    seatCategory: normaliseCategory(seatCategory),
    approvedIntake: metrics.approvedIntake,
    intakeSourceMode: defaultSourceMode,
    intakeVerificationStatus: defaultVerificationStatus,
    intakeSourceRef: defaultSourceRef,
    reportedOccupancy: 0,
    headroom: metrics.headroom,
    utilisationPct: metrics.utilisationPct,
    warningThresholdPct: metrics.warningThresholdPct,
    status: metrics.status,
    flags: metrics.flags,
    ruleVersion: rule.ruleVersion,
    lastEntryAt: new Date(),
    lastUpdatedBy: {
      userId: user.id || 'system',
      role: user.role || 'SYSTEM',
      email: user.email || 'system@apaar.gov.in'
    }
  });

  return bucket;
}

/**
 * Reconciles and synchronizes a newly committed roster version with the seat ledger.
 * Computes net delta between new roster snapshot and current occupancy,
 * creating an append-only ROSTER_SYNC_ADJUSTMENT entry without double-counting.
 */
async function syncRosterCommitToLedger(rosterVersion, user = {}) {
  const { institutionId, academicYear, _id: rosterVersionId } = rosterVersion;

  // 1. Group active rows in this committed roster by programmeCode & category
  const rows = await RosterRow.find({ rosterVersionId }).lean();

  const countsByBucket = {};
  for (const r of rows) {
    const progCode = normaliseProgrammeCode(r.programmeCode);
    const cat = normaliseCategory(r.category);
    const key = `${progCode}__${cat}`;
    countsByBucket[key] = (countsByBucket[key] || 0) + 1;
  }

  const updatedBalances = [];

  // 2. For each bucket present in the roster, reconcile against ledger
  for (const [compositeKey, newCount] of Object.entries(countsByBucket)) {
    const [progCode, cat] = compositeKey.split('__');

    const bucketKey = buildBucketKey(institutionId, progCode, academicYear, cat);
    const bucket = await getOrCreateBucket({
      institutionId,
      programmeCode: progCode,
      academicYear,
      seatCategory: cat,
      user
    });

    const currentOccupancy = bucket.reportedOccupancy || 0;
    const requiredDelta = newCount - currentOccupancy;

    const idempotencyKey = `roster_sync_${rosterVersionId}_${bucketKey}`;

    // Check if this specific sync was already recorded (idempotency guard)
    const existingEntry = await SeatLedgerEntry.findOne({ idempotencyKey });
    if (existingEntry) {
      updatedBalances.push(bucket);
      continue;
    }

    if (requiredDelta !== 0) {
      const newOccupancy = currentOccupancy + requiredDelta;
      const rule = await getActiveOccupancyRule({
        institutionId,
        programmeCode: progCode,
        academicYear
      });

      const metrics = computeBalanceMetrics(
        bucket.approvedIntake,
        newOccupancy,
        rule.warningThresholdPct,
        bucket.intakeVerificationStatus
      );

      // Append immutable ledger entry
      await SeatLedgerEntry.create({
        bucketKey,
        institutionId,
        programmeId: bucket.programmeId,
        programmeCode: progCode,
        academicYear: normaliseAcademicYear(academicYear),
        seatCategory: cat,
        type: 'ROSTER_SYNC_ADJUSTMENT',
        delta: requiredDelta,
        balanceAfter: {
          approvedIntake: metrics.approvedIntake,
          reportedOccupancy: newOccupancy,
          headroom: metrics.headroom,
          utilisationPct: metrics.utilisationPct
        },
        effectiveDate: new Date(),
        sourceReference: rosterVersionId.toString(),
        sourceMode: 'INSTITUTION_REPORTED',
        rosterVersionId,
        actor: {
          userId: user.id || 'system',
          role: user.role || 'INSTITUTION_ADMIN',
          email: user.email || 'admin@institution.edu'
        },
        reason: `Roster commitment sync (v${rosterVersion.versionNumber || 1})`,
        idempotencyKey,
        ruleVersion: rule.ruleVersion
      });

      // Update derived balance atomically
      bucket.reportedOccupancy = newOccupancy;
      bucket.headroom = metrics.headroom;
      bucket.utilisationPct = metrics.utilisationPct;
      bucket.status = metrics.status;
      bucket.flags = metrics.flags;
      bucket.lastEntryAt = new Date();
      bucket.lastRosterVersionId = rosterVersionId;
      bucket.lastUpdatedBy = {
        userId: user.id || 'system',
        role: user.role || 'INSTITUTION_ADMIN',
        email: user.email || 'admin@institution.edu'
      };
      await bucket.save();

      // Record time-series snapshot
      await SeatBalanceSnapshot.create({
        bucketKey,
        institutionId,
        programmeCode: progCode,
        academicYear: normaliseAcademicYear(academicYear),
        seatCategory: cat,
        approvedIntake: metrics.approvedIntake,
        occupancy: newOccupancy,
        headroom: metrics.headroom,
        utilisationPct: metrics.utilisationPct,
        status: metrics.status,
        snapshotDate: new Date(),
        trigger: 'ROSTER_COMMIT',
        triggerRef: rosterVersionId.toString()
      });
    }

    updatedBalances.push(bucket);
  }

  return updatedBalances;
}

/**
 * Records an institution self-declared intake.
 * Explicitly marked as INTAKE_UNVERIFIED and sourceMode = INSTITUTION_DECLARED.
 */
async function recordIntakeDeclaration({
  institutionId,
  programmeCode,
  academicYear,
  seatCategory = 'GENERAL',
  declaredIntake,
  user = {},
  idempotencyKey = null
}) {
  const intake = parseInt(declaredIntake, 10);
  if (isNaN(intake) || intake < 0) {
    throw new Error('Declared intake must be a non-negative integer.');
  }

  const bucket = await getOrCreateBucket({
    institutionId,
    programmeCode,
    academicYear,
    seatCategory,
    user
  });

  const rule = await getActiveOccupancyRule({
    institutionId,
    programmeCode,
    academicYear
  });

  const prevIntake = bucket.approvedIntake || 0;
  const intakeDelta = intake - prevIntake;

  const metrics = computeBalanceMetrics(
    intake,
    bucket.reportedOccupancy,
    rule.warningThresholdPct,
    'INTAKE_UNVERIFIED'
  );

  const entryType = bucket.approvedIntake === null ? 'INTAKE_SET' : 'INTAKE_REVISED';

  // Check idempotency if provided
  if (idempotencyKey) {
    const existing = await SeatLedgerEntry.findOne({ idempotencyKey });
    if (existing) {
      return { bucket, isReplay: true };
    }
  }

  await SeatLedgerEntry.create({
    bucketKey: bucket.bucketKey,
    institutionId,
    programmeId: bucket.programmeId,
    programmeCode: bucket.programmeCode,
    academicYear: bucket.academicYear,
    seatCategory: bucket.seatCategory,
    type: entryType,
    delta: 0,
    intakeDelta,
    balanceAfter: {
      approvedIntake: intake,
      reportedOccupancy: bucket.reportedOccupancy,
      headroom: metrics.headroom,
      utilisationPct: metrics.utilisationPct
    },
    effectiveDate: new Date(),
    sourceReference: 'INSTITUTION_SELF_DECLARATION',
    sourceMode: 'INSTITUTION_DECLARED',
    actor: {
      userId: user.id || 'institution',
      role: user.role || 'INSTITUTION_ADMIN',
      email: user.email || 'admin@institution.edu'
    },
    reason: 'Institution self-declared intake capacity',
    ruleVersion: rule.ruleVersion,
    ...(idempotencyKey ? { idempotencyKey } : {})
  });

  bucket.approvedIntake = intake;
  bucket.intakeSourceMode = 'INSTITUTION_DECLARED';
  bucket.intakeVerificationStatus = 'INTAKE_UNVERIFIED';
  bucket.isSimulated = false;
  bucket.headroom = metrics.headroom;
  bucket.utilisationPct = metrics.utilisationPct;
  bucket.status = metrics.status;
  bucket.flags = metrics.flags;
  bucket.lastEntryAt = new Date();
  bucket.lastUpdatedBy = {
    userId: user.id || 'institution',
    role: user.role || 'INSTITUTION_ADMIN',
    email: user.email || 'admin@institution.edu'
  };
  await bucket.save();

  // Invalidate any prior verifications when new intake capacity is declared
  try {
    const { invalidateVerification } = require('./verificationService');
    await invalidateVerification({
      subjectType: 'PROGRAMME_INTAKE',
      subjectId: bucket.bucketKey,
      fieldPath: 'approvedIntake',
      newValue: intake,
      reason: 'Institution declared new intake; previous verifications superseded.',
      user
    });
  } catch (err) {
    // Non-blocking for ledger transaction
  }

  await SeatBalanceSnapshot.create({
    bucketKey: bucket.bucketKey,
    institutionId,
    programmeCode: bucket.programmeCode,
    academicYear: bucket.academicYear,
    seatCategory: bucket.seatCategory,
    approvedIntake: intake,
    occupancy: bucket.reportedOccupancy,
    headroom: metrics.headroom,
    utilisationPct: metrics.utilisationPct,
    status: metrics.status,
    snapshotDate: new Date(),
    trigger: 'INTAKE_SET',
    triggerRef: 'DECLARATION'
  });

  return { bucket, isReplay: false };
}

/**
 * Configures or revises approved intake by an authorized authority role.
 * Updates both the SeatBalance bucket and Programme embedded intake records.
 */
async function setApprovedIntake({
  institutionId,
  programmeCode,
  academicYear,
  seatCategory = 'ALL',
  approvedIntake,
  sourceRef = null,
  verificationStatus = 'AUTHORITY_VERIFIED',
  sourceMode = 'SIMULATED', // Prototype default
  user = {},
  idempotencyKey = null
}) {
  const intake = parseInt(approvedIntake, 10);
  if (isNaN(intake) || intake < 0) {
    throw new Error('Approved intake must be a non-negative integer.');
  }

  const bucket = await getOrCreateBucket({
    institutionId,
    programmeCode,
    academicYear,
    seatCategory,
    user
  });

  const rule = await getActiveOccupancyRule({
    institutionId,
    programmeCode,
    academicYear
  });

  const prevIntake = bucket.approvedIntake || 0;
  const intakeDelta = intake - prevIntake;

  // Resolve verification semantics (Part A)
  let effectiveVerificationStatus = verificationStatus;
  let verificationMethod = null;
  let verificationEvidenceRef = sourceRef || null;
  let verifiedBy = null;
  let verifiedAt = null;

  if (verificationStatus === 'AUTHORITY_VERIFIED') {
    if (sourceMode === 'SIMULATED' && !sourceRef) {
      // Mock/simulated connector cannot establish genuine AUTHORITY_VERIFIED without documented order evidence
      effectiveVerificationStatus = 'INTAKE_UNVERIFIED';
      verificationMethod = 'SIMULATED_MOCK_CONNECTOR';
    } else {
      effectiveVerificationStatus = 'AUTHORITY_VERIFIED';
      verificationMethod = sourceRef ? 'OFFICIAL_REGULATORY_ORDER' : 'AUTHORITY_ADMIN_CONFIRMATION';
      verifiedBy = {
        userId: user.id || 'authority',
        role: user.role || 'AUTHORITY_ADMIN',
        email: user.email || 'admin@aicte.gov.in'
      };
      verifiedAt = new Date();
    }
  } else if (sourceMode === 'INSTITUTION_DECLARED') {
    effectiveVerificationStatus = 'INTAKE_UNVERIFIED';
    verificationMethod = 'INSTITUTION_SELF_DECLARATION';
  } else {
    verificationMethod = sourceMode === 'SIMULATED' ? 'SIMULATED_MOCK_CONNECTOR' : 'UNKNOWN';
  }

  const metrics = computeBalanceMetrics(
    intake,
    bucket.reportedOccupancy,
    rule.warningThresholdPct,
    effectiveVerificationStatus
  );

  const entryType = bucket.approvedIntake === null ? 'INTAKE_SET' : 'INTAKE_REVISED';

  // Check idempotency if provided
  if (idempotencyKey) {
    const existing = await SeatLedgerEntry.findOne({ idempotencyKey });
    if (existing) {
      return { bucket, isReplay: true };
    }
  }

  await SeatLedgerEntry.create({
    bucketKey: bucket.bucketKey,
    institutionId,
    programmeId: bucket.programmeId,
    programmeCode: bucket.programmeCode,
    academicYear: bucket.academicYear,
    seatCategory: bucket.seatCategory,
    type: entryType,
    delta: 0,
    intakeDelta,
    balanceAfter: {
      approvedIntake: intake,
      reportedOccupancy: bucket.reportedOccupancy,
      headroom: metrics.headroom,
      utilisationPct: metrics.utilisationPct
    },
    effectiveDate: new Date(),
    sourceReference: sourceRef || 'AUTHORITY_APPROVAL_ORDER',
    sourceMode,
    verificationStatus: effectiveVerificationStatus,
    verificationMethod,
    verificationEvidenceRef,
    actor: {
      userId: user.id || 'authority',
      role: user.role || 'AUTHORITY_ADMIN',
      email: user.email || 'admin@aicte.gov.in'
    },
    reason: sourceRef ? `Authority intake order: ${sourceRef}` : 'Authority approved intake revision',
    ruleVersion: rule.ruleVersion,
    ...(idempotencyKey ? { idempotencyKey } : {})
  });

  bucket.approvedIntake = intake;
  bucket.intakeSourceMode = sourceMode;
  bucket.intakeVerificationStatus = effectiveVerificationStatus;
  bucket.isSimulated = sourceMode === 'SIMULATED';
  bucket.intakeSourceRef = sourceRef;
  bucket.verificationMethod = verificationMethod;
  bucket.verificationEvidenceRef = verificationEvidenceRef;
  if (verifiedBy) {
    bucket.verifiedBy = verifiedBy;
    bucket.verifiedAt = verifiedAt;
  }
  bucket.headroom = metrics.headroom;
  bucket.utilisationPct = metrics.utilisationPct;
  bucket.status = metrics.status;
  bucket.flags = metrics.flags;
  bucket.lastEntryAt = new Date();
  bucket.lastUpdatedBy = {
    userId: user.id || 'authority',
    role: user.role || 'AUTHORITY_ADMIN',
    email: user.email || 'admin@aicte.gov.in'
  };
  await bucket.save();

  // If approved intake changed from previous value, invalidate prior verifications
  if (prevIntake !== intake) {
    try {
      const { invalidateVerification } = require('./verificationService');
      await invalidateVerification({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: bucket.bucketKey,
        fieldPath: 'approvedIntake',
        newValue: intake,
        reason: 'Authority revised approved intake; previous verifications superseded.',
        user
      });
    } catch (err) {
      // Non-blocking
    }
  }

  // Also synchronize embedded Programme.intakeByYear
  const prog = await Programme.findOne({
    institutionId,
    code: normaliseProgrammeCode(programmeCode)
  });

  if (prog) {
    const normYear = normaliseAcademicYear(academicYear);
    const existingIntakeIdx = prog.intakeByYear.findIndex(
      (iy) => iy.academicYear === normYear && (iy.seatCategory === seatCategory || iy.seatCategory === 'ALL')
    );

    const intakeRecordPayload = {
      academicYear: normYear,
      seatCategory,
      approvedIntake: intake,
      label: verificationStatus === 'AUTHORITY_VERIFIED' ? 'AICTE_APPROVED' : 'PROVISIONAL',
      sourceMode,
      sourceRef
    };

    if (existingIntakeIdx >= 0) {
      prog.intakeByYear[existingIntakeIdx] = intakeRecordPayload;
    } else {
      prog.intakeByYear.push(intakeRecordPayload);
    }
    await prog.save();
  }

  await SeatBalanceSnapshot.create({
    bucketKey: bucket.bucketKey,
    institutionId,
    programmeCode: bucket.programmeCode,
    academicYear: bucket.academicYear,
    seatCategory: bucket.seatCategory,
    approvedIntake: intake,
    occupancy: bucket.reportedOccupancy,
    headroom: metrics.headroom,
    utilisationPct: metrics.utilisationPct,
    status: metrics.status,
    snapshotDate: new Date(),
    trigger: entryType,
    triggerRef: sourceRef
  });

  return { bucket, isReplay: false };
}

/**
 * Recomputes derived balances from immutable ledger entries.
 * Detects any discrepancies or drift between cached balances and the ledger.
 */
async function verifyLedgerIntegrity({ institutionId = null, academicYear = null, programmeCode = null } = {}) {
  const query = {};
  if (institutionId) query.institutionId = institutionId;
  if (academicYear) query.academicYear = normaliseAcademicYear(academicYear);
  if (programmeCode) query.programmeCode = normaliseProgrammeCode(programmeCode);

  const balances = await SeatBalance.find(query).lean();
  const drifts = [];

  for (const b of balances) {
    const entries = await SeatLedgerEntry.find({ bucketKey: b.bucketKey }).lean();
    const computedOccupancy = entries.reduce((acc, curr) => acc + (curr.delta || 0), 0);

    if (computedOccupancy !== b.reportedOccupancy) {
      drifts.push({
        bucketKey: b.bucketKey,
        institutionId: b.institutionId,
        programmeCode: b.programmeCode,
        academicYear: b.academicYear,
        seatCategory: b.seatCategory,
        cachedOccupancy: b.reportedOccupancy,
        computedFromLedger: computedOccupancy,
        drift: b.reportedOccupancy - computedOccupancy
      });
    }
  }

  return {
    ok: drifts.length === 0,
    totalBucketsChecked: balances.length,
    driftsCount: drifts.length,
    drifts
  };
}

/**
 * Retrieves paginated seat balances with filters.
 */
async function getBalances(filter = {}, { page = 1, limit = 25 }) {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const total = await SeatBalance.countDocuments(filter);
  const items = await SeatBalance.find(filter)
    .sort({ institutionId: 1, programmeCode: 1, academicYear: 1 })
    .skip(skip)
    .limit(l)
    .lean();

  return {
    items,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l)
    }
  };
}

/**
 * Retrieves single balance bucket by ID.
 */
async function getBalanceById(id, institutionId = null) {
  const query = { _id: id };
  if (institutionId) query.institutionId = institutionId;
  return SeatBalance.findOne(query).lean();
}

/**
 * Retrieves paginated audit ledger entries for a bucket.
 */
async function getBalanceEntries(bucketKey, { page = 1, limit = 25 }) {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const total = await SeatLedgerEntry.countDocuments({ bucketKey });
  const items = await SeatLedgerEntry.find({ bucketKey })
    .sort({ effectiveDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(l)
    .lean();

  return {
    items,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l)
    }
  };
}

/**
 * Retrieves historical snapshot timeline for trend charts.
 */
async function getBalanceHistory({ bucketKey = null, institutionId = null, from = null, to = null }) {
  const query = {};
  if (bucketKey) query.bucketKey = bucketKey;
  if (institutionId) query.institutionId = institutionId;

  if (from || to) {
    query.snapshotDate = {};
    if (from) query.snapshotDate.$gte = new Date(from);
    if (to) query.snapshotDate.$lte = new Date(to);
  }

  return SeatBalanceSnapshot.find(query).sort({ snapshotDate: 1 }).lean();
}

module.exports = {
  buildBucketKey,
  computeBalanceMetrics,
  getOrCreateBucket,
  syncRosterCommitToLedger,
  recordIntakeDeclaration,
  setApprovedIntake,
  verifyLedgerIntegrity,
  getBalances,
  getBalanceById,
  getBalanceEntries,
  getBalanceHistory
};
