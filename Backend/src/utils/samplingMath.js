/**
 * Statistical Sampling & Mathematical Utilities.
 * Implements:
 * - Cochran's sample size formula with Finite Population Correction (FPC)
 * - Cryptographically secure Fisher-Yates random sample selection (crypto.randomInt)
 * - Deterministic selection commitment hashing (SHA-256)
 * - Wilson score confidence intervals for proportion estimation
 * - Sensitivity bounding for unconfirmed records (best/worst case)
 * - Comprehensive statistical limitations and diagnostics
 */
const crypto = require('crypto');

/**
 * Returns standard two-tailed z-score for common confidence levels.
 */
function getZScore(confidenceLevel = 0.95) {
  const cl = Number(confidenceLevel);
  if (cl >= 0.99) return 2.576;
  if (cl >= 0.98) return 2.326;
  if (cl >= 0.95) return 1.960;
  if (cl >= 0.90) return 1.645;
  if (cl >= 0.85) return 1.440;
  if (cl >= 0.80) return 1.282;
  return 1.960; // Default 95%
}

/**
 * Calculates statistically recommended sample size using Cochran's formula + FPC.
 *
 * Formula:
 *   n0 = (z^2 * p * (1 - p)) / e^2
 *   n  = n0 / (1 + (n0 - 1) / N)
 *
 * @param {Object} options
 * @param {number} options.populationSize - Total eligible records N
 * @param {number} [options.confidenceLevel=0.95] - e.g. 0.95
 * @param {number} [options.marginOfError=0.05] - e.g. 0.05 (5%)
 * @param {number} [options.expectedProportion=0.50] - p, default 0.5 for maximum variance
 * @param {number} [options.minSampleSize=10]
 * @param {number} [options.maxSampleSize=500]
 */
function computeSampleSize({
  populationSize,
  confidenceLevel = 0.95,
  marginOfError = 0.05,
  expectedProportion = 0.50,
  minSampleSize = 10,
  maxSampleSize = 500
}) {
  const N = parseInt(populationSize, 10);
  if (isNaN(N) || N <= 0) {
    return {
      populationSize: 0,
      sampleSize: 0,
      uncorrectedSampleSize: 0,
      isCensus: false,
      finitePopulationCorrectionApplied: false,
      parameters: {
        confidenceLevel,
        marginOfError,
        expectedProportion,
        minSampleSize,
        maxSampleSize
      },
      explanation: 'Population size is zero or invalid. No sample can be drawn.'
    };
  }

  const minSample = Math.max(1, parseInt(minSampleSize, 10) || 10);
  const maxSample = Math.max(minSample, parseInt(maxSampleSize, 10) || 500);

  // Small population handling: if population is smaller than minSampleSize, recommend census
  if (N <= minSample) {
    return {
      populationSize: N,
      sampleSize: N,
      uncorrectedSampleSize: N,
      isCensus: true,
      finitePopulationCorrectionApplied: true,
      parameters: {
        confidenceLevel,
        zScore: getZScore(confidenceLevel),
        marginOfError,
        expectedProportion,
        minSampleSize: minSample,
        maxSampleSize: maxSample
      },
      explanation: `Population size (${N}) is small (<= minSampleSize ${minSample}). A complete 100% census of all eligible records is recommended.`
    };
  }

  const z = getZScore(confidenceLevel);
  const p = Math.min(0.99, Math.max(0.01, Number(expectedProportion) || 0.50));
  const e = Math.min(0.50, Math.max(0.001, Number(marginOfError) || 0.05));

  // Cochran's uncorrected sample size for infinite population
  const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);

  // Finite population correction (FPC)
  const nFpc = n0 / (1 + (n0 - 1) / N);

  // Round up to nearest whole record and clamp within bounds
  const rawClamped = Math.ceil(nFpc);
  const sampleSize = Math.min(N, Math.max(minSample, Math.min(maxSample, rawClamped)));

  return {
    populationSize: N,
    sampleSize,
    uncorrectedSampleSize: Math.ceil(n0),
    isCensus: sampleSize === N,
    finitePopulationCorrectionApplied: true,
    parameters: {
      confidenceLevel,
      zScore: z,
      marginOfError: e,
      expectedProportion: p,
      minSampleSize: minSample,
      maxSampleSize: maxSample
    },
    explanation: `Calculated sample size ${sampleSize} for population ${N} at ${(confidenceLevel * 100).toFixed(0)}% confidence and ±${(e * 100).toFixed(1)}% margin of error.`
  };
}

/**
 * Draws a cryptographically secure random sample of k items from an array without replacement.
 * Uses crypto.randomInt to avoid pseudo-random PRNG predictability.
 *
 * @param {Array} array - Candidate items to sample from
 * @param {number} k - Number of items to select
 * @returns {Array} Selected subset of items
 */
function cryptoRandomSample(array, k) {
  if (!Array.isArray(array) || array.length === 0 || k <= 0) {
    return [];
  }

  const sampleCount = Math.min(array.length, parseInt(k, 10));
  const pool = [...array];

  // Partial Fisher-Yates shuffle using crypto.randomInt
  for (let i = 0; i < sampleCount; i++) {
    // Pick random index in [i, pool.length - 1]
    const j = crypto.randomInt(i, pool.length);
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }

  return pool.slice(0, sampleCount);
}

/**
 * Computes a deterministic SHA-256 commitment hash over selected record IDs and run metadata.
 * Ensures the exact selected list cannot be tampered with after sampling creation.
 */
function computeSelectionHash(selectedRecordIds = [], metadata = '') {
  const sortedIds = [...selectedRecordIds].map(String).sort();
  const payload = `${sortedIds.join(',')}|meta:${metadata}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Calculates Wilson score confidence interval for the proportion of verified checks.
 *
 * @param {Object} params
 * @param {number} params.verifiedCount - Number of VERIFIED checks in random stratum
 * @param {number} params.failedCount - Number of FAILED_CHECK items in random stratum
 * @param {number} params.unconfirmedCount - Number of UNCONFIRMED items in random stratum
 * @param {number} params.pendingCount - Number of PENDING checks
 * @param {number} params.excludedCount - Number of EXCLUDED items
 * @param {number} params.totalRandomSampled - Total size of random stratum
 * @param {number} [params.populationSize] - Total eligible population size N
 * @param {number} [params.confidenceLevel=0.95]
 * @param {number} [params.minResolvedForEstimate=5]
 * @param {number} [params.minResponseRate=0.50]
 */
function computeWilsonScoreInterval({
  verifiedCount = 0,
  failedCount = 0,
  unconfirmedCount = 0,
  pendingCount = 0,
  excludedCount = 0,
  totalRandomSampled = 0,
  populationSize = null,
  confidenceLevel = 0.95,
  minResolvedForEstimate = 5,
  minResponseRate = 0.50
}) {
  const verified = Math.max(0, parseInt(verifiedCount, 10) || 0);
  const failed = Math.max(0, parseInt(failedCount, 10) || 0);
  const unconfirmed = Math.max(0, parseInt(unconfirmedCount, 10) || 0);
  const pending = Math.max(0, parseInt(pendingCount, 10) || 0);
  const excluded = Math.max(0, parseInt(excludedCount, 10) || 0);
  const total = Math.max(0, parseInt(totalRandomSampled, 10) || 0);

  const eligibleSample = Math.max(0, total - excluded);
  const resolvedCount = verified + failed;

  const responseRate = eligibleSample > 0
    ? Math.round((resolvedCount / eligibleSample) * 1000) / 1000
    : 0;

  const minResolved = Math.max(1, parseInt(minResolvedForEstimate, 10) || 5);
  const minRate = Math.min(1.0, Math.max(0.01, Number(minResponseRate) || 0.50));

  // Check statistical threshold prerequisites
  const limitations = [];

  if (pending > 0) {
    limitations.push(`${pending} sample records remain pending verification.`);
  }

  if (unconfirmed > 0) {
    limitations.push(
      `${unconfirmed} sample records are unconfirmed due to non-response or unreachable contacts. Non-response is NOT treated as a failed check.`
    );
  }

  limitations.push(
    'Estimates reflect checks among responsive records. Projection to the full population assumes unconfirmed records are missing at random (MAR), which may introduce non-response bias.'
  );
  limitations.push(
    'Failed checks indicate data discrepancies requiring administrative review, not automatic accusations of fraud or student misconduct.'
  );

  // If thresholds are not satisfied, return INSUFFICIENT_DATA_FOR_ESTIMATE
  if (resolvedCount < minResolved || responseRate < minRate) {
    const insufficientReasons = [];
    if (resolvedCount < minResolved) {
      insufficientReasons.push(
        `Resolved count (${resolvedCount}) is below the required threshold of ${minResolved} completed checks.`
      );
    }
    if (responseRate < minRate) {
      insufficientReasons.push(
        `Resolved response rate (${(responseRate * 100).toFixed(1)}%) is below the required minimum of ${(minRate * 100).toFixed(1)}%.`
      );
    }

    return {
      status: 'INSUFFICIENT_DATA_FOR_ESTIMATE',
      isEstimateAvailable: false,
      reason: insufficientReasons.join(' '),
      counts: {
        totalRandomSampled: total,
        eligibleSample,
        verifiedCount: verified,
        failedCount: failed,
        unconfirmedCount: unconfirmed,
        pendingCount: pending,
        excludedCount: excluded,
        resolvedCount,
        responseRate
      },
      thresholds: {
        minResolvedForEstimate: minResolved,
        minResponseRate: minRate
      },
      limitations
    };
  }

  // Wilson Score Interval calculation
  const z = getZScore(confidenceLevel);
  const pHat = resolvedCount > 0 ? verified / resolvedCount : 0;
  const n = resolvedCount;

  const denom = 1 + Math.pow(z, 2) / n;
  const center = (pHat + Math.pow(z, 2) / (2 * n)) / denom;
  const standardErrorTerm = Math.sqrt(
    (pHat * (1 - pHat)) / n + Math.pow(z, 2) / (4 * Math.pow(n, 2))
  );

  let halfWidth = (z * standardErrorTerm) / denom;

  // Apply finite population correction to margin if population size is known
  if (populationSize && populationSize > n) {
    const fpc = Math.sqrt((populationSize - n) / (populationSize - 1));
    halfWidth *= fpc;
  }

  const lowerBound = Math.max(0, Math.round((center - halfWidth) * 1000) / 1000);
  const upperBound = Math.min(1.0, Math.round((center + halfWidth) * 1000) / 1000);
  const pointEstimate = Math.round(pHat * 1000) / 1000;

  // Illustrative bounds for unconfirmed records (Sensitivity Analysis)
  // Best Case: all unconfirmed turn out to be verified
  // Worst Case: all unconfirmed turn out to be failed
  const denominatorWithUnconfirmed = resolvedCount + unconfirmed;
  const bestCaseProportion = denominatorWithUnconfirmed > 0
    ? Math.round(((verified + unconfirmed) / denominatorWithUnconfirmed) * 1000) / 1000
    : pointEstimate;

  const worstCaseProportion = denominatorWithUnconfirmed > 0
    ? Math.round((verified / denominatorWithUnconfirmed) * 1000) / 1000
    : pointEstimate;

  return {
    status: 'ESTIMATE_AVAILABLE',
    isEstimateAvailable: true,
    confidenceLevel,
    estimationMethod: 'Wilson score interval with finite-population correction',
    pointEstimate,
    verificationRatePct: Math.round(pointEstimate * 1000) / 10,
    confidenceInterval: {
      lower: lowerBound,
      upper: upperBound,
      lowerPct: Math.round(lowerBound * 1000) / 10,
      upperPct: Math.round(upperBound * 1000) / 10,
      confidenceLevelPct: Math.round(confidenceLevel * 100)
    },
    sensitivityBounds: {
      note: 'Illustrative bounding analysis for unconfirmed records. Not population predictions.',
      bestCaseVerificationRatePct: Math.round(bestCaseProportion * 1000) / 10,
      worstCaseVerificationRatePct: Math.round(worstCaseProportion * 1000) / 10
    },
    counts: {
      totalRandomSampled: total,
      eligibleSample,
      verifiedCount: verified,
      failedCount: failed,
      unconfirmedCount: unconfirmed,
      pendingCount: pending,
      excludedCount: excluded,
      resolvedCount,
      responseRate
    },
    limitations
  };
}

module.exports = {
  getZScore,
  computeSampleSize,
  cryptoRandomSample,
  computeSelectionHash,
  computeWilsonScoreInterval
};
