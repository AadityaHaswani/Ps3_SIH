/**
 * Unit Tests for Feature 3: Assurance Sampling & Statistical Methods.
 * Tests pure mathematical calculations, cryptographic random sampling,
 * commitment hashing, Wilson score confidence intervals, and sensitivity bounds.
 */
const {
  getZScore,
  computeSampleSize,
  cryptoRandomSample,
  computeSelectionHash,
  computeWilsonScoreInterval
} = require('../src/utils/samplingMath');

describe('Assurance Sampling Pure Mathematics (Unit Tests)', () => {
  describe('getZScore', () => {
    test('returns standard z-scores for common confidence levels', () => {
      expect(getZScore(0.90)).toBe(1.645);
      expect(getZScore(0.95)).toBe(1.960);
      expect(getZScore(0.98)).toBe(2.326);
      expect(getZScore(0.99)).toBe(2.576);
      expect(getZScore()).toBe(1.960); // Default 95%
    });
  });

  describe('computeSampleSize (Cochran + FPC)', () => {
    test('calculates correct sample size for standard population with FPC', () => {
      // N = 1000, 95% confidence (z = 1.96), e = 0.05, p = 0.5
      // n0 = 1.96^2 * 0.25 / 0.0025 = 384.16
      // n = 384.16 / (1 + 383.16 / 1000) = 384.16 / 1.38316 = 277.74 -> 278
      const res = computeSampleSize({
        populationSize: 1000,
        confidenceLevel: 0.95,
        marginOfError: 0.05,
        expectedProportion: 0.50
      });

      expect(res.populationSize).toBe(1000);
      expect(res.sampleSize).toBe(278);
      expect(res.uncorrectedSampleSize).toBe(385);
      expect(res.isCensus).toBe(false);
      expect(res.finitePopulationCorrectionApplied).toBe(true);
    });

    test('recommends complete census for small populations (N <= minSampleSize)', () => {
      const res = computeSampleSize({
        populationSize: 8,
        minSampleSize: 10
      });

      expect(res.sampleSize).toBe(8);
      expect(res.isCensus).toBe(true);
      expect(res.explanation).toContain('census of all eligible records is recommended');
    });

    test('clamps sample size between minSampleSize and maxSampleSize', () => {
      // Very large population clamped to maxSampleSize = 150
      const resMax = computeSampleSize({
        populationSize: 50000,
        maxSampleSize: 150
      });
      expect(resMax.sampleSize).toBe(150);

      // Population where calculated size is below minSampleSize = 50
      const resMin = computeSampleSize({
        populationSize: 100,
        marginOfError: 0.20,
        minSampleSize: 50
      });
      expect(resMin.sampleSize).toBe(50);
    });

    test('handles invalid, zero, or negative population safely', () => {
      const resZero = computeSampleSize({ populationSize: 0 });
      expect(resZero.sampleSize).toBe(0);

      const resNeg = computeSampleSize({ populationSize: -50 });
      expect(resNeg.sampleSize).toBe(0);

      const resNaN = computeSampleSize({ populationSize: 'invalid' });
      expect(resNaN.sampleSize).toBe(0);
    });
  });

  describe('cryptoRandomSample', () => {
    test('draws exact k unique elements without duplicates', () => {
      const items = Array.from({ length: 50 }, (_, i) => ({ id: `row-${i + 1}` }));
      const sample = cryptoRandomSample(items, 15);

      expect(sample.length).toBe(15);

      const ids = sample.map((item) => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(15); // Zero duplicate selections
    });

    test('returns full array if sample size exceeds population', () => {
      const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const sample = cryptoRandomSample(items, 10);
      expect(sample.length).toBe(3);
    });

    test('handles empty or zero sample size safely', () => {
      expect(cryptoRandomSample([], 5)).toEqual([]);
      expect(cryptoRandomSample([{ id: '1' }], 0)).toEqual([]);
    });
  });

  describe('computeSelectionHash', () => {
    test('produces deterministic SHA-256 hash irrespective of ID order', () => {
      const ids1 = ['row-3', 'row-1', 'row-2'];
      const ids2 = ['row-1', 'row-2', 'row-3'];

      const hash1 = computeSelectionHash(ids1, 'meta-tag-1');
      const hash2 = computeSelectionHash(ids2, 'meta-tag-1');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string
    });

    test('produces different hash when metadata or records differ', () => {
      const ids = ['row-1', 'row-2'];
      const hashA = computeSelectionHash(ids, 'meta-A');
      const hashB = computeSelectionHash(ids, 'meta-B');

      expect(hashA).not.toBe(hashB);
    });
  });

  describe('computeWilsonScoreInterval', () => {
    test('calculates correct Wilson score interval for sufficient resolved checks', () => {
      // 50 total sampled, 45 verified, 5 failed, 0 unconfirmed, 0 pending
      // pHat = 45 / 50 = 0.90
      const res = computeWilsonScoreInterval({
        verifiedCount: 45,
        failedCount: 5,
        unconfirmedCount: 0,
        pendingCount: 0,
        excludedCount: 0,
        totalRandomSampled: 50,
        populationSize: 500,
        confidenceLevel: 0.95,
        minResolvedForEstimate: 5,
        minResponseRate: 0.50
      });

      expect(res.status).toBe('ESTIMATE_AVAILABLE');
      expect(res.isEstimateAvailable).toBe(true);
      expect(res.pointEstimate).toBe(0.9);
      expect(res.verificationRatePct).toBe(90);

      // Wilson interval around 90% should be bounded between 0 and 1
      expect(res.confidenceInterval.lower).toBeGreaterThan(0.75);
      expect(res.confidenceInterval.upper).toBeLessThanOrEqual(1.0);
      expect(res.confidenceInterval.lower).toBeLessThan(res.confidenceInterval.upper);
      expect(res.limitations.length).toBeGreaterThan(0);
    });

    test('returns INSUFFICIENT_DATA_FOR_ESTIMATE when resolved count is below minimum', () => {
      // Only 3 resolved checks (below minResolvedForEstimate = 5)
      const res = computeWilsonScoreInterval({
        verifiedCount: 2,
        failedCount: 1,
        unconfirmedCount: 20,
        pendingCount: 27,
        totalRandomSampled: 50,
        minResolvedForEstimate: 5,
        minResponseRate: 0.50
      });

      expect(res.status).toBe('INSUFFICIENT_DATA_FOR_ESTIMATE');
      expect(res.isEstimateAvailable).toBe(false);
      expect(res.reason).toContain('below the required threshold of 5 completed checks');
      expect(res.counts.resolvedCount).toBe(3);
    });

    test('returns INSUFFICIENT_DATA_FOR_ESTIMATE when response rate is below threshold', () => {
      // 5 resolved, but 20 unconfirmed and 25 pending out of 50 -> response rate = 5 / 50 = 10% < 50%
      const res = computeWilsonScoreInterval({
        verifiedCount: 5,
        failedCount: 0,
        unconfirmedCount: 20,
        pendingCount: 25,
        totalRandomSampled: 50,
        minResolvedForEstimate: 5,
        minResponseRate: 0.50
      });

      expect(res.status).toBe('INSUFFICIENT_DATA_FOR_ESTIMATE');
      expect(res.isEstimateAvailable).toBe(false);
      expect(res.reason).toContain('Resolved response rate');
      expect(res.counts.responseRate).toBe(0.1);
    });

    test('does NOT treat UNCONFIRMED records as FAILED_CHECK and provides sensitivity bounds', () => {
      // 30 verified, 0 failed, 10 unconfirmed -> response rate = 30 / 40 = 75%
      const res = computeWilsonScoreInterval({
        verifiedCount: 30,
        failedCount: 0,
        unconfirmedCount: 10,
        pendingCount: 0,
        excludedCount: 0,
        totalRandomSampled: 40,
        minResolvedForEstimate: 5,
        minResponseRate: 0.50
      });

      expect(res.status).toBe('ESTIMATE_AVAILABLE');
      // Point estimate among respondents is 30/30 = 1.0 (100%), NOT 30/40 = 75%
      expect(res.pointEstimate).toBe(1.0);
      expect(res.counts.failedCount).toBe(0); // Unconfirmed was NOT counted as failure

      // Sensitivity bounds:
      // Best case: 30+10 / 40 = 100%
      // Worst case: 30 / 40 = 75%
      expect(res.sensitivityBounds.bestCaseVerificationRatePct).toBe(100);
      expect(res.sensitivityBounds.worstCaseVerificationRatePct).toBe(75);
    });
  });
});
