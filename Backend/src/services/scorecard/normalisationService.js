/**
 * Normalisation & Score Aggregation Service.
 * Implements the versioned scoring formula, weight renormalisation,
 * minimum data threshold checks, and support-oriented band classification.
 */

/**
 * Evaluates whether an evaluation meets minimum data thresholds for scoring.
 */
function evaluateEligibility(metrics, inScopeRecords, config) {
  const thresholds = (config && config.parameters && config.parameters.thresholds) || {};
  const minRecords =
    thresholds.minRecordsForInstitutionScore !== undefined
      ? thresholds.minRecordsForInstitutionScore
      : 50;
  const minMetricsRequired =
    thresholds.minMetricsRequired !== undefined ? thresholds.minMetricsRequired : 2;

  // Count available scored metrics
  let availableScoredCount = 0;
  if (metrics.m1Completeness && metrics.m1Completeness.status === 'AVAILABLE') {
    availableScoredCount += 1;
  }
  if (metrics.m2Discrepancies && metrics.m2Discrepancies.status === 'AVAILABLE') {
    availableScoredCount += 1;
  }
  if (metrics.m3Timeliness && metrics.m3Timeliness.status === 'AVAILABLE') {
    availableScoredCount += 1;
  }
  if (
    config &&
    config.m4EnabledInScore &&
    metrics.m4Corrections &&
    metrics.m4Corrections.status === 'AVAILABLE'
  ) {
    availableScoredCount += 1;
  }

  if (inScopeRecords < minRecords) {
    return {
      isEligible: false,
      reason: `In-scope record count (${inScopeRecords}) is below the minimum required threshold of ${minRecords} records.`
    };
  }

  if (availableScoredCount < minMetricsRequired) {
    return {
      isEligible: false,
      reason: `Only ${availableScoredCount} scored metric(s) available; minimum required is ${minMetricsRequired}.`
    };
  }

  return {
    isEligible: true,
    reason: null
  };
}

/**
 * Computes renormalised weights and final overall reliability score.
 * Formula: round(sum(availableMetricWeight * metricSubScore) / sum(availableMetricWeight), 1)
 */
function computeOverallScore(metrics, inScopeRecords, config) {
  const eligibility = evaluateEligibility(metrics, inScopeRecords, config);

  const configuredWeights = (config && config.weights) || {
    m1Completeness: 0.40,
    m2Discrepancies: 0.30,
    m3Timeliness: 0.30,
    m4Corrections: 0.00
  };

  const weightsUsed = {
    m1Completeness: null,
    m2Discrepancies: null,
    m3Timeliness: null,
    m4Corrections: null
  };

  if (!eligibility.isEligible) {
    return {
      overallScore: null,
      band: 'INSUFFICIENT_DATA',
      isEligibleForScore: false,
      ineligibleReason: eligibility.reason,
      weightsUsed
    };
  }

  // Identify eligible scored metrics with non-zero configured weight
  const activeEntries = [];

  if (
    metrics.m1Completeness &&
    metrics.m1Completeness.status === 'AVAILABLE' &&
    configuredWeights.m1Completeness > 0 &&
    metrics.m1Completeness.subScore !== null
  ) {
    activeEntries.push({
      key: 'm1Completeness',
      subScore: metrics.m1Completeness.subScore,
      weight: configuredWeights.m1Completeness
    });
  }

  if (
    metrics.m2Discrepancies &&
    metrics.m2Discrepancies.status === 'AVAILABLE' &&
    configuredWeights.m2Discrepancies > 0 &&
    metrics.m2Discrepancies.subScore !== null
  ) {
    activeEntries.push({
      key: 'm2Discrepancies',
      subScore: metrics.m2Discrepancies.subScore,
      weight: configuredWeights.m2Discrepancies
    });
  }

  if (
    metrics.m3Timeliness &&
    metrics.m3Timeliness.status === 'AVAILABLE' &&
    configuredWeights.m3Timeliness > 0 &&
    metrics.m3Timeliness.subScore !== null
  ) {
    activeEntries.push({
      key: 'm3Timeliness',
      subScore: metrics.m3Timeliness.subScore,
      weight: configuredWeights.m3Timeliness
    });
  }

  if (
    config &&
    config.m4EnabledInScore &&
    metrics.m4Corrections &&
    metrics.m4Corrections.status === 'AVAILABLE' &&
    configuredWeights.m4Corrections > 0 &&
    metrics.m4Corrections.subScore !== null
  ) {
    activeEntries.push({
      key: 'm4Corrections',
      subScore: metrics.m4Corrections.subScore,
      weight: configuredWeights.m4Corrections
    });
  }

  const sumAvailableWeight = activeEntries.reduce((sum, item) => sum + item.weight, 0);

  if (sumAvailableWeight === 0) {
    return {
      overallScore: null,
      band: 'INSUFFICIENT_DATA',
      isEligibleForScore: false,
      ineligibleReason: 'No scored metrics have an active configured weight.',
      weightsUsed
    };
  }

  let weightedSubScoreSum = 0;
  for (const item of activeEntries) {
    const normalisedWeight = Math.round((item.weight / sumAvailableWeight) * 1000) / 1000;
    weightsUsed[item.key] = normalisedWeight;
    weightedSubScoreSum += item.subScore * item.weight;
  }

  const overallScore = Math.round((weightedSubScoreSum / sumAvailableWeight) * 10) / 10;
  const band = determineBand(overallScore, config);

  return {
    overallScore,
    band,
    isEligibleForScore: true,
    ineligibleReason: null,
    weightsUsed
  };
}

/**
 * Assigns a support-oriented band based on overall score.
 */
function determineBand(score, config) {
  if (score === null || score === undefined) return 'INSUFFICIENT_DATA';

  const bands = (config && config.bands) || {
    strongMin: 85.0,
    adequateMin: 70.0,
    needsSupportMin: 50.0
  };

  if (score >= bands.strongMin) return 'STRONG';
  if (score >= bands.adequateMin) return 'ADEQUATE';
  if (score >= bands.needsSupportMin) return 'NEEDS_SUPPORT';
  return 'PRIORITY_SUPPORT';
}

module.exports = {
  evaluateEligibility,
  computeOverallScore,
  determineBand
};
