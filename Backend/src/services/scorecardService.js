/**
 * Institutional Data Reliability Scorecard Service.
 * Central orchestrator for evaluating, snapshotting, and comparing institutional reliability.
 * Implements non-punitive transparency, formula versioning, and auditable snapshots.
 */
const Institution = require('../models/institution.model');
const ScoreSnapshot = require('../models/scoreSnapshot.model');
const { MANDATORY_DISCLAIMER } = require('../models/scoreSnapshot.model');
const scoringConfigService = require('./scoringConfigService');
const {
  calculateCompleteness,
  calculateDiscrepancies,
  calculateTimeliness,
  calculateCorrections,
  calculateDataCoverage
} = require('./scorecard/metricCalculators');
const { computeOverallScore } = require('./scorecard/normalisationService');
const { generateSupportSuggestions } = require('./scorecard/supportSuggestionService');
const { evaluateComparability, sanitizeForViewer } = require('./scorecard/comparabilityService');

/**
 * Calculates a complete scorecard for an institution and reporting period.
 * Does not mutate DB snapshots; pure evaluation.
 * @param {string|ObjectId} institutionId 
 * @param {string} reportingPeriod 
 * @param {Object} options 
 */
async function calculateScorecard(institutionId, reportingPeriod, options = {}) {
  const institution = await Institution.findById(institutionId);
  if (!institution) {
    const error = new Error(`Institution with ID ${institutionId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  // 1. Resolve scoring configuration
  const config = options.configVersion
    ? await scoringConfigService.getConfigByVersion(options.configVersion)
    : await scoringConfigService.getActiveConfig();

  // 2. Compute individual metric families
  const m1Completeness = await calculateCompleteness(institutionId, reportingPeriod, config, options);
  const inScopeRecordCount = m1Completeness.inScopeRecords || 0;

  const m2Discrepancies = await calculateDiscrepancies(
    institutionId,
    reportingPeriod,
    inScopeRecordCount,
    config,
    options
  );

  const m3Timeliness = await calculateTimeliness(institutionId, reportingPeriod, config, options);

  const m4Corrections = await calculateCorrections(
    institutionId,
    reportingPeriod,
    inScopeRecordCount,
    config,
    options
  );

  const dataCoverage = await calculateDataCoverage(institutionId, reportingPeriod, options);

  // 3. Assemble metrics payload
  const metrics = {
    m1Completeness: {
      ...m1Completeness,
      weightConfigured: config.weights.m1Completeness,
      weightUsed: null
    },
    m2Discrepancies: {
      ...m2Discrepancies,
      weightConfigured: config.weights.m2Discrepancies,
      weightUsed: null
    },
    m3Timeliness: {
      ...m3Timeliness,
      weightConfigured: config.weights.m3Timeliness,
      weightUsed: null
    },
    m4Corrections: {
      ...m4Corrections,
      weightConfigured: config.weights.m4Corrections,
      weightUsed: null
    }
  };

  // 4. Compute overall reliability score, band, and renormalised weights
  const scoreResult = computeOverallScore(metrics, inScopeRecordCount, config);

  // Assign calculated weights used back to metrics
  metrics.m1Completeness.weightUsed = scoreResult.weightsUsed.m1Completeness;
  metrics.m2Discrepancies.weightUsed = scoreResult.weightsUsed.m2Discrepancies;
  metrics.m3Timeliness.weightUsed = scoreResult.weightsUsed.m3Timeliness;
  metrics.m4Corrections.weightUsed = scoreResult.weightsUsed.m4Corrections;

  // 5. Generate rule-based support suggestions
  const supportSuggestions = generateSupportSuggestions(metrics, config);

  return {
    institutionId: institution._id,
    institutionName: institution.name,
    institutionCode: institution.code,
    institutionType: institution.type || 'ENGINEERING',
    reportingPeriod,
    programmeCode: options.programmeCode || null,
    overallScore: scoreResult.overallScore,
    band: scoreResult.band,
    isEligibleForScore: scoreResult.isEligibleForScore,
    ineligibleReason: scoreResult.ineligibleReason,
    inScopeRecordCount,
    unresolvedCount: m2Discrepancies.openDiscrepancies || 0,
    metrics,
    dataCoverage,
    configVersion: config.configVersion,
    scoringParameters: {
      weights: config.weights,
      m4EnabledInScore: config.m4EnabledInScore,
      thresholds: config.parameters.thresholds,
      isOfficialPolicy: config.isOfficialPolicy
    },
    calculatedAt: new Date(),
    triggerReason: options.triggerReason || 'INITIAL_CALCULATION',
    isStale: false,
    staleReason: null,
    supportSuggestions,
    disclaimer: MANDATORY_DISCLAIMER
  };
}

/**
 * Retrieves the latest snapshot or calculates and persists a fresh one.
 * @param {string|ObjectId} institutionId 
 * @param {string} reportingPeriod 
 * @param {Object} options 
 */
async function getOrCalculateScorecard(institutionId, reportingPeriod, options = {}) {
  const period = reportingPeriod || '2024-25';

  if (!options.forceRecalculate) {
    const existingSnapshot = await ScoreSnapshot.findOne({
      institutionId,
      reportingPeriod: period
    }).sort({ calculatedAt: -1 });

    if (existingSnapshot && !existingSnapshot.isStale) {
      return existingSnapshot;
    }
  }

  // Calculate fresh scorecard
  const calculated = await calculateScorecard(institutionId, period, options);

  // Check if existing snapshot is identical to avoid redundant writes
  const latestSnapshot = await ScoreSnapshot.findOne({
    institutionId,
    reportingPeriod: period
  }).sort({ calculatedAt: -1 });

  if (
    latestSnapshot &&
    latestSnapshot.configVersion === calculated.configVersion &&
    latestSnapshot.overallScore === calculated.overallScore &&
    latestSnapshot.inScopeRecordCount === calculated.inScopeRecordCount &&
    latestSnapshot.unresolvedCount === calculated.unresolvedCount &&
    !options.forceRecalculate
  ) {
    // Refresh staleness and timestamp without creating duplicate entry
    latestSnapshot.isStale = false;
    latestSnapshot.staleReason = null;
    latestSnapshot.calculatedAt = new Date();
    await latestSnapshot.save();
    return latestSnapshot;
  }

  // Persist fresh snapshot
  const snapshot = await ScoreSnapshot.create({
    institutionId: calculated.institutionId,
    reportingPeriod: calculated.reportingPeriod,
    institutionType: calculated.institutionType,
    programmeCode: calculated.programmeCode,
    overallScore: calculated.overallScore,
    band: calculated.band,
    isEligibleForScore: calculated.isEligibleForScore,
    ineligibleReason: calculated.ineligibleReason,
    inScopeRecordCount: calculated.inScopeRecordCount,
    unresolvedCount: calculated.unresolvedCount,
    metrics: calculated.metrics,
    dataCoverage: calculated.dataCoverage,
    configVersion: calculated.configVersion,
    scoringParameters: calculated.scoringParameters,
    calculatedAt: calculated.calculatedAt,
    triggerReason: calculated.triggerReason,
    isStale: false,
    staleReason: null,
    supportSuggestions: calculated.supportSuggestions,
    disclaimer: calculated.disclaimer
  });

  return snapshot;
}

/**
 * Explicitly recalculates scorecard for an institution and persists new snapshot.
 */
async function recalculateScorecard(institutionId, reportingPeriod, options = {}) {
  const period = reportingPeriod || '2024-25';
  return getOrCalculateScorecard(institutionId, period, {
    ...options,
    forceRecalculate: true,
    triggerReason: options.triggerReason || 'MANUAL_RECALCULATE'
  });
}

/**
 * Returns detailed metrics breakdown for an institution.
 */
async function getInstitutionMetrics(institutionId, reportingPeriod, options = {}) {
  const scorecard = await getOrCalculateScorecard(institutionId, reportingPeriod, options);
  return {
    institutionId: scorecard.institutionId,
    reportingPeriod: scorecard.reportingPeriod,
    configVersion: scorecard.configVersion,
    metrics: scorecard.metrics,
    dataCoverage: scorecard.dataCoverage,
    isStale: scorecard.isStale,
    disclaimer: scorecard.disclaimer
  };
}

/**
 * Returns historical score snapshots formatted for trend analysis and Recharts.
 */
async function getScorecardTrend(institutionId, options = {}) {
  const query = { institutionId };
  if (options.configVersion) {
    query.configVersion = options.configVersion;
  }

  const snapshots = await ScoreSnapshot.find(query)
    .sort({ calculatedAt: 1 })
    .limit(options.limit || 50);

  let prevConfigVersion = null;
  const trend = snapshots.map((s) => {
    const formulaChanged = prevConfigVersion !== null && s.configVersion !== prevConfigVersion;
    prevConfigVersion = s.configVersion;

    return {
      snapshotId: s._id,
      reportingPeriod: s.reportingPeriod,
      calculatedAt: s.calculatedAt,
      overallScore: s.overallScore,
      band: s.band,
      isEligible: s.isEligibleForScore,
      completenessPct:
        s.metrics && s.metrics.m1Completeness ? s.metrics.m1Completeness.completenessPct : null,
      unresolvedRatePer1000:
        s.metrics && s.metrics.m2Discrepancies
          ? s.metrics.m2Discrepancies.unresolvedRatePer1000
          : null,
      openDiscrepancies: s.unresolvedCount || 0,
      onTimePct:
        s.metrics && s.metrics.m3Timeliness ? s.metrics.m3Timeliness.onTimePct : null,
      coveragePct: s.dataCoverage ? s.dataCoverage.coveragePct : 0,
      configVersion: s.configVersion,
      formulaChanged,
      isStale: s.isStale
    };
  });

  return {
    institutionId,
    dataPoints: trend.length,
    trend,
    disclaimer: MANDATORY_DISCLAIMER
  };
}

/**
 * Compares two or more institutions side-by-side with comparability warnings and peer anonymisation.
 */
async function compareInstitutions(institutionIds = [], reportingPeriod, user, options = {}) {
  if (!institutionIds || institutionIds.length < 2) {
    const error = new Error('At least two institution IDs are required for comparison.');
    error.statusCode = 400;
    throw error;
  }

  const period = reportingPeriod || '2024-25';
  const comparisonItems = [];

  for (const instId of institutionIds) {
    const institution = await Institution.findById(instId);
    if (!institution) continue;

    const scorecard = await getOrCalculateScorecard(instId, period, options);

    comparisonItems.push({
      institutionId: institution._id,
      institutionName: institution.name,
      institutionCode: institution.code,
      institutionType: institution.type || 'ENGINEERING',
      reportingPeriod: scorecard.reportingPeriod,
      configVersion: scorecard.configVersion,
      overallScore: scorecard.overallScore,
      band: scorecard.band,
      isEligibleForScore: scorecard.isEligibleForScore,
      inScopeRecordCount: scorecard.inScopeRecordCount,
      unresolvedCount: scorecard.unresolvedCount,
      coveragePct: scorecard.dataCoverage ? scorecard.dataCoverage.coveragePct : 0,
      metrics: {
        completenessPct:
          scorecard.metrics.m1Completeness ? scorecard.metrics.m1Completeness.completenessPct : null,
        m1SubScore:
          scorecard.metrics.m1Completeness ? scorecard.metrics.m1Completeness.subScore : null,
        unresolvedRatePer1000:
          scorecard.metrics.m2Discrepancies
            ? scorecard.metrics.m2Discrepancies.unresolvedRatePer1000
            : null,
        m2SubScore:
          scorecard.metrics.m2Discrepancies ? scorecard.metrics.m2Discrepancies.subScore : null,
        onTimePct:
          scorecard.metrics.m3Timeliness ? scorecard.metrics.m3Timeliness.onTimePct : null,
        m3SubScore:
          scorecard.metrics.m3Timeliness ? scorecard.metrics.m3Timeliness.subScore : null,
        totalCorrections:
          scorecard.metrics.m4Corrections ? scorecard.metrics.m4Corrections.totalCorrections : 0
      }
    });
  }

  // 1. Evaluate comparability rules (type, period, formula version)
  const comparability = evaluateComparability(comparisonItems);

  // 2. Anonymise peer institutions if requested by institution-scoped user
  const sanitizedItems = sanitizeForViewer(comparisonItems, user);

  return {
    reportingPeriod: period,
    isDirectlyComparable: comparability.isDirectlyComparable,
    comparabilityWarnings: comparability.warnings,
    institutions: sanitizedItems,
    disclaimer: MANDATORY_DISCLAIMER
  };
}

/**
 * Marks existing snapshots as stale when underlying records change.
 */
async function markSnapshotsStale(institutionId, reportingPeriod, reason) {
  const query = { institutionId, isStale: false };
  if (reportingPeriod) {
    query.reportingPeriod = reportingPeriod;
  }
  return ScoreSnapshot.updateMany(query, {
    $set: {
      isStale: true,
      staleReason: reason || 'Underlying data records modified.'
    }
  });
}

/**
 * Retrieves paginated snapshot history for auditing.
 */
async function getSnapshotHistory(institutionId, reportingPeriod, options = {}) {
  const query = { institutionId };
  if (reportingPeriod) {
    query.reportingPeriod = reportingPeriod;
  }

  const page = parseInt(options.page, 10) || 1;
  const limit = parseInt(options.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    ScoreSnapshot.find(query)
      .sort({ calculatedAt: -1 })
      .skip(skip)
      .limit(limit),
    ScoreSnapshot.countDocuments(query)
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    },
    disclaimer: MANDATORY_DISCLAIMER
  };
}

module.exports = {
  calculateScorecard,
  getOrCalculateScorecard,
  recalculateScorecard,
  getInstitutionMetrics,
  getScorecardTrend,
  compareInstitutions,
  markSnapshotsStale,
  getSnapshotHistory
};
