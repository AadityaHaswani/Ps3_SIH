/**
 * Assurance Sampling Service.
 * Implements Feature 3: Assurance Sampling and Verification Confidence.
 * Manages sample size preview, cryptographically secure random selection,
 * verification outcome tracking, immutable run closure, and Wilson score estimation.
 */
const crypto = require('crypto');
const SamplingRun = require('../models/samplingRun.model');
const SamplingItem = require('../models/samplingItem.model');
const RosterVersion = require('../models/rosterVersion.model');
const RosterRow = require('../models/rosterRow.model');
const { maskName } = require('../utils/cryptoToken');
const {
  computeSampleSize,
  cryptoRandomSample,
  computeSelectionHash,
  computeWilsonScoreInterval
} = require('../utils/samplingMath');
const {
  normaliseProgrammeCode,
  normaliseAcademicYear,
  normaliseCategory
} = require('../utils/normalisation');

/**
 * Previews recommended sample size and population breakdown without persisting anything.
 */
async function previewSamplingSize({
  institutionId,
  rosterVersionId,
  academicYear,
  programmeCode = null,
  seatCategory = null,
  confidenceLevel = 0.95,
  marginOfError = 0.05,
  expectedProportion = 0.50,
  minSampleSize = 10,
  maxSampleSize = 500,
  riskTargetedCount = 0
}) {
  const version = await RosterVersion.findById(rosterVersionId);
  if (!version) {
    throw new Error('Roster version not found.');
  }

  if (String(version.institutionId) !== String(institutionId)) {
    throw new Error('Roster version does not belong to specified institution.');
  }

  if (version.status !== 'COMMITTED') {
    throw new Error(`Cannot sample from uncommitted roster version (status: ${version.status}). Roster must be COMMITTED.`);
  }

  const query = {
    rosterVersionId,
    validationStatus: 'VALID'
  };

  if (programmeCode) {
    query.programmeCode = normaliseProgrammeCode(programmeCode);
  }
  if (seatCategory) {
    query.category = normaliseCategory(seatCategory);
  }

  const eligibleCount = await RosterRow.countDocuments(query);

  const sampleCalc = computeSampleSize({
    populationSize: eligibleCount,
    confidenceLevel,
    marginOfError,
    expectedProportion,
    minSampleSize,
    maxSampleSize
  });

  const targetedCount = Math.max(0, parseInt(riskTargetedCount, 10) || 0);
  const totalRecommended = sampleCalc.sampleSize + targetedCount;

  return {
    rosterVersion: {
      id: version._id,
      versionNumber: version.versionNumber,
      academicYear: version.academicYear,
      status: version.status,
      committedAt: version.committedAt
    },
    eligiblePopulationSize: eligibleCount,
    recommendedSampleSize: sampleCalc.sampleSize,
    riskTargetedSampleSize: targetedCount,
    totalProposedSampleSize: totalRecommended,
    isCensus: sampleCalc.isCensus,
    finitePopulationCorrectionApplied: sampleCalc.finitePopulationCorrectionApplied,
    parameters: sampleCalc.parameters,
    explanation: sampleCalc.explanation
  };
}

/**
 * Initiates an Assurance Sampling run by drawing a cryptographically secure random sample.
 */
async function createSamplingRun({
  institutionId,
  rosterVersionId,
  academicYear,
  programmeCode = null,
  seatCategory = null,
  samplingParameters = {},
  riskTargetedCount = 0,
  user = {},
  idempotencyKey = null
}) {
  // 1. Idempotency check
  if (idempotencyKey) {
    const existingRun = await SamplingRun.findOne({ idempotencyKey });
    if (existingRun) {
      return { run: existingRun, isReplay: true };
    }
  }

  // 2. Validate committed roster version
  const version = await RosterVersion.findById(rosterVersionId);
  if (!version) {
    throw new Error('Roster version not found.');
  }

  if (String(version.institutionId) !== String(institutionId)) {
    throw new Error('Roster version does not belong to specified institution.');
  }

  if (version.status !== 'COMMITTED') {
    throw new Error(`Cannot draw sample from an uncommitted roster (status: ${version.status}). Roster must be COMMITTED.`);
  }

  // 3. Query eligible population rows
  const query = {
    rosterVersionId,
    validationStatus: 'VALID'
  };

  if (programmeCode) {
    query.programmeCode = normaliseProgrammeCode(programmeCode);
  }
  if (seatCategory) {
    query.category = normaliseCategory(seatCategory);
  }

  const eligibleRows = await RosterRow.find(query).sort({ _id: 1 }).lean();
  const populationSize = eligibleRows.length;

  if (populationSize === 0) {
    throw new Error('No eligible valid student records found in the specified committed roster version.');
  }

  // 4. Calculate sample size
  const {
    confidenceLevel = 0.95,
    marginOfError = 0.05,
    expectedProportion = 0.50,
    minSampleSize = 10,
    maxSampleSize = 500,
    minResolvedForEstimate = 5,
    minResponseRate = 0.50
  } = samplingParameters;

  const sizeResult = computeSampleSize({
    populationSize,
    confidenceLevel,
    marginOfError,
    expectedProportion,
    minSampleSize,
    maxSampleSize
  });

  const randomSampleSize = sizeResult.sampleSize;

  // 5. Cryptographically secure random sample selection (Fisher-Yates via crypto.randomInt)
  const selectedRandomRows = cryptoRandomSample(eligibleRows, randomSampleSize);

  // 6. Optional risk-targeted sample selection from remaining rows (distinct stratum)
  const targetedCount = Math.max(0, parseInt(riskTargetedCount, 10) || 0);
  let selectedTargetedRows = [];

  if (targetedCount > 0) {
    const randomRowIdSet = new Set(selectedRandomRows.map((r) => String(r._id)));
    const remainingRows = eligibleRows.filter((r) => !randomRowIdSet.has(String(r._id)));
    selectedTargetedRows = cryptoRandomSample(remainingRows, targetedCount);
  }

  // 7. Compute cryptographic commitment hash over ordered selected record IDs
  const allSelectedIds = [
    ...selectedRandomRows.map((r) => r._id),
    ...selectedTargetedRows.map((r) => r._id)
  ];

  const runId = `SAMP-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  const metadataString = `${institutionId}|${rosterVersionId}|${academicYear}|random:${randomSampleSize}|targeted:${selectedTargetedRows.length}`;
  const selectionHash = computeSelectionHash(allSelectedIds, metadataString);

  const totalSampleSize = selectedRandomRows.length + selectedTargetedRows.length;

  // 8. Create SamplingRun record
  const run = await SamplingRun.create({
    runId,
    institutionId,
    rosterVersionId,
    academicYear: normaliseAcademicYear(academicYear || version.academicYear),
    programmeCode: programmeCode ? normaliseProgrammeCode(programmeCode) : null,
    seatCategory: seatCategory ? normaliseCategory(seatCategory) : null,
    eligiblePopulationSize: populationSize,
    samplingParameters: {
      confidenceLevel: sizeResult.parameters.confidenceLevel,
      marginOfError: sizeResult.parameters.marginOfError,
      expectedProportion: sizeResult.parameters.expectedProportion,
      minSampleSize: sizeResult.parameters.minSampleSize,
      maxSampleSize: sizeResult.parameters.maxSampleSize,
      minResolvedForEstimate,
      minResponseRate,
      riskTargetedCount: selectedTargetedRows.length,
      configVersion: 'sampling-config@1'
    },
    sampleSize: selectedRandomRows.length,
    targetedSampleSize: selectedTargetedRows.length,
    totalSampleSize,
    selectionHash,
    algorithmVersion: 'crypto-fisher-yates@1',
    status: 'ACTIVE',
    summary: {
      total: totalSampleSize,
      pending: totalSampleSize,
      verified: 0,
      failedCheck: 0,
      unconfirmed: 0,
      excluded: 0,
      responseRate: 0
    },
    idempotencyKey,
    createdBy: {
      userId: user.id || 'system',
      role: user.role || 'AUTHORITY_ADMIN',
      email: user.email || 'admin@aicte.gov.in'
    }
  });

  // 9. Bulk insert SamplingItems with masked personal data
  const itemsToInsert = [];
  let order = 1;

  for (const row of selectedRandomRows) {
    itemsToInsert.push({
      samplingRunId: run._id,
      institutionId,
      rosterRowId: row._id,
      rowKey: row.rowKey,
      stratum: 'RANDOM',
      selectionOrder: order++,
      applicationNo: row.applicationNo,
      apaarToken: row.apaarToken,
      apaarLast4: row.apaarLast4,
      studentNameMasked: maskName(row.name),
      dob: row.dob,
      gender: row.gender,
      category: row.category,
      programmeCode: row.programmeCode,
      academicYear: row.academicYear,
      verificationStatus: 'PENDING',
      verificationMethod: null,
      history: []
    });
  }

  for (const row of selectedTargetedRows) {
    itemsToInsert.push({
      samplingRunId: run._id,
      institutionId,
      rosterRowId: row._id,
      rowKey: row.rowKey,
      stratum: 'RISK_TARGETED',
      selectionOrder: order++,
      applicationNo: row.applicationNo,
      apaarToken: row.apaarToken,
      apaarLast4: row.apaarLast4,
      studentNameMasked: maskName(row.name),
      dob: row.dob,
      gender: row.gender,
      category: row.category,
      programmeCode: row.programmeCode,
      academicYear: row.academicYear,
      verificationStatus: 'PENDING',
      verificationMethod: null,
      history: []
    });
  }

  await SamplingItem.insertMany(itemsToInsert);

  return { run, isReplay: false };
}

/**
 * Retrieves a sampling run by ID.
 */
async function getSamplingRunById(runId, institutionId = null) {
  const query = { _id: runId };
  if (institutionId) query.institutionId = institutionId;
  return SamplingRun.findOne(query).lean();
}

/**
 * Lists sampling runs with pagination and filtering.
 */
async function listSamplingRuns(filter = {}, { page = 1, limit = 25 }) {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const total = await SamplingRun.countDocuments(filter);
  const items = await SamplingRun.find(filter)
    .sort({ createdAt: -1 })
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
 * Retrieves paginated sampling items for a run.
 */
async function getSamplingItems(samplingRunId, filter = {}, { page = 1, limit = 25 }) {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const query = { samplingRunId, ...filter };

  const total = await SamplingItem.countDocuments(query);
  const items = await SamplingItem.find(query)
    .sort({ selectionOrder: 1 })
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
 * Records verification outcome for a single sampling item.
 * Appends to immutable history and updates run summary.
 */
async function recordItemVerification({
  itemId,
  samplingItemId,
  verificationStatus,
  verificationMethod = null,
  evidenceRef = null,
  evidenceReference = null,
  notes = null,
  exclusionReason = null,
  user = {}
}) {
  const actualId = itemId || samplingItemId;
  const actualEvidence = evidenceRef || evidenceReference || null;

  const validStatuses = ['VERIFIED', 'FAILED_CHECK', 'UNCONFIRMED', 'EXCLUDED'];
  if (!validStatuses.includes(verificationStatus)) {
    throw new Error(`Invalid verification status: ${verificationStatus}. Must be one of: ${validStatuses.join(', ')}.`);
  }

  const item = await SamplingItem.findById(actualId);
  if (!item) {
    throw new Error('Sampling item not found.');
  }

  // Ensure parent run is ACTIVE and not CLOSED
  const run = await SamplingRun.findById(item.samplingRunId);
  if (!run) {
    throw new Error('Parent sampling run not found.');
  }

  if (run.status === 'CLOSED') {
    throw new Error('Cannot modify verification outcome for a CLOSED sampling run. Completed sampling runs are immutable.');
  }

  if (verificationStatus === 'EXCLUDED' && !exclusionReason) {
    throw new Error('An exclusion reason is required when marking a sample item as EXCLUDED.');
  }

  const prevStatus = item.verificationStatus;

  // Append immutable history entry
  item.history.push({
    previousStatus: prevStatus,
    newStatus: verificationStatus,
    verificationMethod: verificationMethod || null,
    evidenceRef: actualEvidence,
    notes: notes || null,
    updatedBy: {
      userId: user.id || 'reviewer',
      role: user.role || 'AUTHORITY_ADMIN',
      email: user.email || 'admin@aicte.gov.in'
    },
    timestamp: new Date()
  });

  item.verificationStatus = verificationStatus;
  item.verificationMethod = verificationMethod || null;
  item.evidenceRef = actualEvidence;
  item.notes = notes || null;
  item.exclusionReason = verificationStatus === 'EXCLUDED' ? exclusionReason : null;
  item.verifiedBy = {
    userId: user.id || 'reviewer',
    role: user.role || 'AUTHORITY_ADMIN',
    email: user.email || 'admin@aicte.gov.in'
  };
  item.verifiedAt = new Date();

  await item.save();

  // Recalculate summary counts for the run
  const counts = await SamplingItem.aggregate([
    { $match: { samplingRunId: run._id } },
    { $group: { _id: '$verificationStatus', count: { $sum: 1 } } }
  ]);

  const summary = {
    total: run.totalSampleSize,
    pending: 0,
    verified: 0,
    failedCheck: 0,
    unconfirmed: 0,
    excluded: 0,
    responseRate: 0
  };

  for (const c of counts) {
    if (c._id === 'PENDING') summary.pending = c.count;
    if (c._id === 'VERIFIED') summary.verified = c.count;
    if (c._id === 'FAILED_CHECK') summary.failedCheck = c.count;
    if (c._id === 'UNCONFIRMED') summary.unconfirmed = c.count;
    if (c._id === 'EXCLUDED') summary.excluded = c.count;
  }

  const eligibleSample = Math.max(0, summary.total - summary.excluded);
  const resolved = summary.verified + summary.failedCheck;
  summary.responseRate = eligibleSample > 0 ? Math.round((resolved / eligibleSample) * 1000) / 1000 : 0;

  run.summary = summary;
  await run.save();

  return item;
}

/**
 * Closes an active sampling run, rendering it immutable.
 */
async function closeSamplingRun(runId, user = {}, reason = 'Completed verification review') {
  const run = await SamplingRun.findById(runId);
  if (!run) {
    throw new Error('Sampling run not found.');
  }

  if (run.status === 'CLOSED') {
    throw new Error('Sampling run is already closed.');
  }

  run.status = 'CLOSED';
  run.closedBy = {
    userId: user.id || 'authority',
    role: user.role || 'AUTHORITY_ADMIN',
    email: user.email || 'admin@aicte.gov.in',
    closedAt: new Date(),
    reason: reason || 'Completed verification review'
  };

  await run.save();
  return run;
}

/**
 * Computes statistical verification rate estimate and Wilson score interval.
 * Strictly uses ONLY the RANDOM stratum to preserve valid probability sampling.
 */
async function computeRunEstimate(runId, institutionId = null) {
  const query = { _id: runId };
  if (institutionId) query.institutionId = institutionId;

  const run = await SamplingRun.findOne(query).lean();
  if (!run) {
    throw new Error('Sampling run not found or access restricted.');
  }

  // Aggregate counts strictly for RANDOM stratum
  const randomCounts = await SamplingItem.aggregate([
    { $match: { samplingRunId: run._id, stratum: 'RANDOM' } },
    { $group: { _id: '$verificationStatus', count: { $sum: 1 } } }
  ]);

  let verified = 0;
  let failed = 0;
  let unconfirmed = 0;
  let pending = 0;
  let excluded = 0;

  for (const c of randomCounts) {
    if (c._id === 'VERIFIED') verified = c.count;
    if (c._id === 'FAILED_CHECK') failed = c.count;
    if (c._id === 'UNCONFIRMED') unconfirmed = c.count;
    if (c._id === 'PENDING') pending = c.count;
    if (c._id === 'EXCLUDED') excluded = c.count;
  }

  const {
    confidenceLevel = 0.95,
    minResolvedForEstimate = 5,
    minResponseRate = 0.50
  } = run.samplingParameters;

  const estimateResult = computeWilsonScoreInterval({
    verifiedCount: verified,
    failedCount: failed,
    unconfirmedCount: unconfirmed,
    pendingCount: pending,
    excludedCount: excluded,
    totalRandomSampled: run.sampleSize,
    populationSize: run.eligiblePopulationSize,
    confidenceLevel,
    minResolvedForEstimate,
    minResponseRate
  });

  return {
    runId: run.runId,
    institutionId: run.institutionId,
    academicYear: run.academicYear,
    rosterVersionId: run.rosterVersionId,
    status: run.status,
    stratumEvaluated: 'RANDOM',
    riskTargetedStratumExcludedFromEstimate: run.targetedSampleSize > 0,
    targetedSampleSize: run.targetedSampleSize,
    eligiblePopulationSize: run.eligiblePopulationSize,
    ...estimateResult
  };
}

module.exports = {
  previewSamplingSize,
  createSamplingRun,
  getSamplingRunById,
  listSamplingRuns,
  getSamplingItems,
  recordItemVerification,
  closeSamplingRun,
  computeRunEstimate
};
