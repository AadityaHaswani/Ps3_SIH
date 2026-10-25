/**
 * Impact Service.
 * Implements change blast-radius calculation and derived output freshness management.
 * Identifies affected reconciliation runs, seat balances, scorecards, sampling runs,
 * and verification records when a roster version is committed or corrected.
 */
const { v4: uuidv4 } = require('uuid');
const ImpactRecord = require('../models/impactRecord.model');
const ReconciliationRun = require('../models/reconciliationRun.model');
const SeatBalance = require('../models/seatBalance.model');
const ScoreSnapshot = require('../models/scoreSnapshot.model');
const SamplingRun = require('../models/samplingRun.model');
const VerificationRecord = require('../models/verificationRecord.model');
const { compareRosterVersions } = require('./versionDiffService');
const { logAuditEvent } = require('./auditService');

/**
 * Calculates and records the blast radius of a committed roster version.
 * Marks affected derived outputs as STALE with explicit staleReason and version reference.
 *
 * @param {Object} params
 * @param {Object} params.newVersion - Newly committed RosterVersion document
 * @param {Object} [params.previousVersion] - Preceding RosterVersion document
 * @param {Object} [params.user] - Authenticated user context
 * @param {string} [params.idempotencyKey] - Optional idempotency key
 * @returns {Promise<Object>} Created or existing ImpactRecord
 */
async function calculateAndRecordImpact({
  newVersion,
  previousVersion = null,
  user = {},
  idempotencyKey = null,
  force = false
}) {
  if (!newVersion || !newVersion._id) {
    throw new Error('Valid newVersion is required for blast radius calculation.');
  }

  // 1. Idempotency check: reuse existing impact record if already computed
  if (!force) {
    if (idempotencyKey) {
      const existing = await ImpactRecord.findOne({ idempotencyKey }).lean();
      if (existing) return existing;
    }
    const existingByVersion = await ImpactRecord.findOne({ rosterVersionId: newVersion._id }).lean();
    if (existingByVersion) return existingByVersion;
  } else {
    await ImpactRecord.deleteMany({ rosterVersionId: newVersion._id });
  }

  // 2. Compute version diff if previous version exists
  let changeSummary = {
    total: newVersion.rowCount || 0,
    added: newVersion.rowCount || 0,
    removed: 0,
    modified: 0,
    unchanged: 0,
    unkeyed: 0
  };
  let affectedBuckets = [];

  if (previousVersion) {
    const diffResult = await compareRosterVersions({
      currentVersionId: newVersion._id,
      previousVersionId: previousVersion._id,
      user
    });
    changeSummary = diffResult.summary;
    affectedBuckets = diffResult.summary.affectedBuckets || [];
  } else {
    // Genesis version: rows in this version define the affected buckets
    const RosterRow = require('../models/rosterRow.model');
    const { buildBucketKey } = require('./seatLedgerService');
    const rows = await RosterRow.find({ rosterVersionId: newVersion._id }).lean();
    const bucketSet = new Set();
    for (const r of rows) {
      bucketSet.add(
        buildBucketKey(
          newVersion.institutionId,
          r.programmeCode || 'UNKNOWN',
          newVersion.academicYear,
          r.category || 'GENERAL'
        )
      );
    }
    affectedBuckets = Array.from(bucketSet);
  }

  const affectedOutputs = [];
  const staleReason = `Roster version updated to v${newVersion.versionNumber}. Derived outputs based on prior roster snapshots are superseded.`;

  // 3. Mark affected ReconciliationRuns as STALE
  if (previousVersion) {
    const affectedReconRuns = await ReconciliationRun.find({
      institutionId: newVersion.institutionId,
      academicYear: newVersion.academicYear,
      rosterVersionId: previousVersion._id
    });

    for (const run of affectedReconRuns) {
      run.freshness = 'STALE';
      run.staleReason = staleReason;
      run.staleSinceVersionId = newVersion._id;
      run.revalidationStatus = 'NOT_STARTED';
      await run.save();

      affectedOutputs.push({
        outputType: 'RECONCILIATION_RUN',
        outputId: run.runId || String(run._id),
        name: `Reconciliation Run ${run.runId} (v${previousVersion.versionNumber})`,
        previousFreshness: 'FRESH',
        currentFreshness: 'STALE',
        staleReason,
        revalidationStatus: 'NOT_STARTED'
      });
    }
  }

  // 4. Mark affected SeatBalances as STALE
  // Only mark buckets that actually changed; unaffected programme/category buckets remain FRESH
  let affectedBalances = [];
  if (affectedBuckets.length > 0) {
    affectedBalances = await SeatBalance.find({
      institutionId: newVersion.institutionId,
      academicYear: newVersion.academicYear,
      bucketKey: { $in: affectedBuckets }
    });
  }
  for (const balance of affectedBalances) {
    balance.freshness = 'STALE';
    balance.staleReason = `Occupancy carryover modified by roster v${newVersion.versionNumber}`;
    balance.staleSinceVersionId = newVersion._id;
    await balance.save();

    affectedOutputs.push({
      outputType: 'SEAT_BALANCE',
      outputId: String(balance._id),
      name: `Seat Balance ${balance.programmeCode} (${balance.seatCategory})`,
      bucketKey: balance.bucketKey,
      previousFreshness: 'FRESH',
      currentFreshness: 'STALE',
      staleReason: balance.staleReason,
      revalidationStatus: 'NOT_APPLICABLE'
    });
  }

  // 5. Mark Scorecard snapshots as STALE
  const affectedScoreSnapshots = await ScoreSnapshot.find({
    institutionId: newVersion.institutionId,
    reportingPeriod: newVersion.academicYear
  });

  for (const snapshot of affectedScoreSnapshots) {
    snapshot.isStale = true;
    snapshot.freshness = 'STALE';
    snapshot.staleReason = staleReason;
    snapshot.staleSinceVersionId = newVersion._id;
    snapshot.revalidationStatus = 'QUEUED';
    await snapshot.save();

    affectedOutputs.push({
      outputType: 'SCORECARD_SNAPSHOT',
      outputId: String(snapshot._id),
      name: `Data Reliability Scorecard (${snapshot.reportingPeriod})`,
      previousFreshness: 'FRESH',
      currentFreshness: 'STALE',
      staleReason,
      revalidationStatus: 'QUEUED'
    });
  }

  // 6. Mark SamplingRuns as STALE
  // Closed sampling runs cannot be re-sampled, preserving historical sampling integrity
  if (previousVersion) {
    const affectedSamplingRuns = await SamplingRun.find({
      institutionId: newVersion.institutionId,
      academicYear: newVersion.academicYear,
      rosterVersionId: previousVersion._id
    });

    for (const run of affectedSamplingRuns) {
      run.freshness = 'STALE';
      run.staleReason = `Sample was drawn from superseded roster v${previousVersion.versionNumber}`;
      run.staleSinceVersionId = newVersion._id;
      run.revalidationStatus = 'BLOCKED';
      await run.save();

      affectedOutputs.push({
        outputType: 'SAMPLING_RUN',
        outputId: run.runId || String(run._id),
        name: `Assurance Sampling Run ${run.runId}`,
        previousFreshness: 'FRESH',
        currentFreshness: 'STALE',
        staleReason: run.staleReason,
        revalidationStatus: 'BLOCKED'
      });
    }
  }

  // 7. Mark affected VerificationRecords as STALE if bucket matches
  if (affectedBuckets.length > 0) {
    const affectedVerifications = await VerificationRecord.find({
      institutionId: newVersion.institutionId,
      subjectId: { $in: affectedBuckets },
      status: 'COMPLETED'
    });

    for (const record of affectedVerifications) {
      record.freshness = 'STALE';
      record.staleReason = `Intake quota context altered by roster revision v${newVersion.versionNumber}`;
      record.staleSinceVersionId = newVersion._id;
      await record.save();

      affectedOutputs.push({
        outputType: 'VERIFICATION_RECORD',
        outputId: String(record._id),
        name: `Verification Record (${record.fieldPath} on ${record.subjectId})`,
        bucketKey: record.subjectId,
        previousFreshness: 'FRESH',
        currentFreshness: 'STALE',
        staleReason: record.staleReason,
        revalidationStatus: 'NOT_STARTED'
      });
    }
  }

  // 8. Tally counts
  const counts = {
    reconciliationRuns: affectedOutputs.filter((o) => o.outputType === 'RECONCILIATION_RUN').length,
    seatBalances: affectedOutputs.filter((o) => o.outputType === 'SEAT_BALANCE').length,
    scorecardSnapshots: affectedOutputs.filter((o) => o.outputType === 'SCORECARD_SNAPSHOT').length,
    samplingRuns: affectedOutputs.filter((o) => o.outputType === 'SAMPLING_RUN').length,
    verificationRecords: affectedOutputs.filter((o) => o.outputType === 'VERIFICATION_RECORD').length,
    total: affectedOutputs.length
  };

  // 9. Create immutable ImpactRecord document
  const impactRecord = await ImpactRecord.create({
    impactId: `impact_${uuidv4()}`,
    institutionId: newVersion.institutionId,
    academicYear: newVersion.academicYear,
    rosterVersionId: newVersion._id,
    supersededVersionId: previousVersion ? previousVersion._id : null,
    changeSummary: {
      total: changeSummary.totalCurrent || changeSummary.total || 0,
      added: changeSummary.added || 0,
      removed: changeSummary.removed || 0,
      modified: changeSummary.modified || 0,
      unchanged: changeSummary.unchanged || 0,
      unkeyed: changeSummary.unkeyed || 0
    },
    affectedBuckets,
    affectedOutputsCount: counts,
    affectedOutputs,
    staleReason,
    calculatedAt: new Date(),
    calculatedBy: {
      userId: user.id || 'system',
      role: user.role || 'INSTITUTION_ADMIN',
      email: user.email || 'admin@institution.edu'
    },
    ...(idempotencyKey ? { idempotencyKey } : {})
  });

  // 10. Log canonical audit event
  await logAuditEvent({
    action: 'BLAST_RADIUS_CALCULATED',
    entityType: 'ImpactRecord',
    entityId: impactRecord._id,
    institutionId: newVersion.institutionId,
    performedBy: user,
    details: {
      rosterVersionId: newVersion._id,
      supersededVersionId: previousVersion ? previousVersion._id : null,
      affectedBucketsCount: affectedBuckets.length,
      affectedOutputsCount: counts
    }
  });

  return impactRecord;
}

/**
 * Retrieves the blast-radius impact record for a specific roster version.
 */
async function getImpactByVersionId(rosterVersionId, user = {}) {
  const impact = await ImpactRecord.findOne({ rosterVersionId }).lean();
  if (!impact) {
    const err = new Error(`ImpactRecord for roster version ${rosterVersionId} not found.`);
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Scoping check
  if (['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(user.role)) {
    if (user.institutionId && String(impact.institutionId) !== String(user.institutionId)) {
      const err = new Error('Forbidden: Cannot access impact record of another institution.');
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
  }

  return impact;
}

/**
 * Revalidates an individual stale output.
 * Invokes real domain re-calculation for supported outputs while preserving historical records.
 */
async function revalidateOutput({ outputType, outputId, user = {} }) {
  if (outputType === 'SCORECARD_SNAPSHOT') {
    const snapshot = await ScoreSnapshot.findById(outputId);
    if (!snapshot) {
      const err = new Error(`ScoreSnapshot ${outputId} not found.`);
      err.statusCode = 404;
      throw err;
    }

    const scorecardService = require('./scorecardService');
    const newSnapshot = await scorecardService.calculateScorecard(
      snapshot.institutionId,
      snapshot.reportingPeriod,
      {
        triggerReason: 'MANUAL_RECALCULATE',
        replacesSnapshotId: snapshot._id
      },
      user
    );

    // Update stale record revalidation status
    snapshot.revalidationStatus = 'REVALIDATED';
    await snapshot.save();

    return {
      success: true,
      outputType,
      revalidationStatus: 'REVALIDATED',
      revalidatedOutputId: String(newSnapshot._id),
      message: 'Scorecard re-calculated and fresh snapshot persisted successfully.'
    };
  }

  if (outputType === 'SAMPLING_RUN') {
    return {
      success: false,
      outputType,
      revalidationStatus: 'BLOCKED',
      reason:
        'Closed historical sampling runs cannot be re-sampled retrospectively to preserve statistical audit integrity.'
    };
  }

  return {
    success: false,
    outputType,
    revalidationStatus: 'NOT_APPLICABLE',
    reason: `Automated revalidation is not applicable for output type '${outputType}'.`
  };
}

module.exports = {
  calculateAndRecordImpact,
  getImpactByVersionId,
  revalidateOutput
};
