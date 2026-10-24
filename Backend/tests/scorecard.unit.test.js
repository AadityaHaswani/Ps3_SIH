/**
 * Scorecard Pure Logic & Statistical Calculations Unit Test Suite.
 * Validates M1 completeness, M2 discrepancies, M3 timeliness, M4 corrections,
 * normalisation, weight renormalisation, eligibility, bands, and support suggestions.
 */
const {
  calculateMedian,
  calculateP90
} = require('../src/services/scorecard/metricCalculators');
const {
  evaluateEligibility,
  computeOverallScore,
  determineBand
} = require('../src/services/scorecard/normalisationService');
const {
  generateSupportSuggestions
} = require('../src/services/scorecard/supportSuggestionService');
const {
  evaluateComparability,
  sanitizeForViewer
} = require('../src/services/scorecard/comparabilityService');

describe('Institutional Reliability Scorecard Pure Unit Suite', () => {
  const defaultConfig = {
    configVersion: 'v1.0',
    weights: {
      m1Completeness: 0.40,
      m2Discrepancies: 0.30,
      m3Timeliness: 0.30,
      m4Corrections: 0.00
    },
    m4EnabledInScore: false,
    parameters: {
      m1: { minRecords: 30 },
      m2: { rateCeilingPer1000: 50.0, minRecords: 30 },
      m3: { lagCeilingDays: 30, onTimeWindowDays: 15, minDatedEvents: 20 },
      m4: { turnaroundCeilingDays: 14, repeatCorrectionThresholdPct: 15 },
      thresholds: {
        minRecordsForInstitutionScore: 50,
        minMetricsRequired: 2
      }
    },
    bands: {
      strongMin: 85.0,
      adequateMin: 70.0,
      needsSupportMin: 50.0
    }
  };

  describe('1. Math & Percentile Helpers', () => {
    test('calculateMedian handles odd and even sized sorted arrays', () => {
      expect(calculateMedian([1, 3, 5])).toBe(3);
      expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
      expect(calculateMedian([7])).toBe(7);
      expect(calculateMedian([])).toBeNull();
      expect(calculateMedian(null)).toBeNull();
    });

    test('calculateP90 calculates 90th percentile accurately', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(calculateP90(data)).toBe(9);
      expect(calculateP90([42])).toBe(42);
      expect(calculateP90([])).toBeNull();
    });
  });

  describe('2. Eligibility Evaluation (Minimum Data Safeguards)', () => {
    test('rejects score calculation when in-scope population is below threshold (50)', () => {
      const metrics = {
        m1Completeness: { status: 'AVAILABLE', subScore: 95 },
        m2Discrepancies: { status: 'AVAILABLE', subScore: 90 },
        m3Timeliness: { status: 'AVAILABLE', subScore: 85 }
      };

      const result = evaluateEligibility(metrics, 45, defaultConfig);
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('below the minimum required threshold of 50 records');
    });

    test('rejects score calculation when fewer than 2 scored metrics are available', () => {
      const metrics = {
        m1Completeness: { status: 'AVAILABLE', subScore: 95 },
        m2Discrepancies: { status: 'INSUFFICIENT_DATA', subScore: null },
        m3Timeliness: { status: 'UNAVAILABLE', subScore: null }
      };

      const result = evaluateEligibility(metrics, 100, defaultConfig);
      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('Only 1 scored metric(s) available; minimum required is 2');
    });

    test('approves eligibility when records >= 50 and at least 2 metrics available', () => {
      const metrics = {
        m1Completeness: { status: 'AVAILABLE', subScore: 90 },
        m2Discrepancies: { status: 'AVAILABLE', subScore: 85 },
        m3Timeliness: { status: 'UNAVAILABLE', subScore: null }
      };

      const result = evaluateEligibility(metrics, 60, defaultConfig);
      expect(result.isEligible).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe('3. Score Normalisation & Weight Renormalisation', () => {
    test('computes weighted score across all 3 active metrics (M1=0.4, M2=0.3, M3=0.3)', () => {
      const metrics = {
        m1Completeness: { status: 'AVAILABLE', subScore: 90.0 },
        m2Discrepancies: { status: 'AVAILABLE', subScore: 80.0 },
        m3Timeliness: { status: 'AVAILABLE', subScore: 70.0 },
        m4Corrections: { status: 'AVAILABLE', subScore: null }
      };

      // Expected: 0.4*90 + 0.3*80 + 0.3*70 = 36 + 24 + 21 = 81.0
      const res = computeOverallScore(metrics, 100, defaultConfig);
      expect(res.isEligibleForScore).toBe(true);
      expect(res.overallScore).toBe(81.0);
      expect(res.band).toBe('ADEQUATE');
      expect(res.weightsUsed.m1Completeness).toBe(0.4);
      expect(res.weightsUsed.m2Discrepancies).toBe(0.3);
      expect(res.weightsUsed.m3Timeliness).toBe(0.3);
      expect(res.weightsUsed.m4Corrections).toBeNull();
    });

    test('renormalises weights when M3 is UNAVAILABLE (M1 weight 0.4/(0.4+0.3) = 0.571, M2 weight 0.3/0.7 = 0.429)', () => {
      const metrics = {
        m1Completeness: { status: 'AVAILABLE', subScore: 100.0 },
        m2Discrepancies: { status: 'AVAILABLE', subScore: 80.0 },
        m3Timeliness: { status: 'UNAVAILABLE', subScore: null },
        m4Corrections: { status: 'UNAVAILABLE', subScore: null }
      };

      // Expected: (0.4*100 + 0.3*80) / 0.7 = 64 / 0.7 = 91.4
      const res = computeOverallScore(metrics, 80, defaultConfig);
      expect(res.isEligibleForScore).toBe(true);
      expect(res.overallScore).toBe(91.4);
      expect(res.band).toBe('STRONG');
      expect(res.weightsUsed.m1Completeness).toBe(0.571);
      expect(res.weightsUsed.m2Discrepancies).toBe(0.429);
      expect(res.weightsUsed.m3Timeliness).toBeNull();
    });

    test('NEVER produces a score of 0 for insufficient data; returns overallScore: null', () => {
      const metrics = {
        m1Completeness: { status: 'INSUFFICIENT_DATA', subScore: null },
        m2Discrepancies: { status: 'INSUFFICIENT_DATA', subScore: null },
        m3Timeliness: { status: 'UNAVAILABLE', subScore: null }
      };

      const res = computeOverallScore(metrics, 15, defaultConfig);
      expect(res.isEligibleForScore).toBe(false);
      expect(res.overallScore).toBeNull();
      expect(res.band).toBe('INSUFFICIENT_DATA');
      expect(res.overallScore).not.toBe(0);
    });

    test('correction volume alone does NOT change score when M4 is disabled (weight 0.00)', () => {
      const baseMetrics = {
        m1Completeness: { status: 'AVAILABLE', subScore: 85.0 },
        m2Discrepancies: { status: 'AVAILABLE', subScore: 85.0 },
        m3Timeliness: { status: 'AVAILABLE', subScore: 85.0 },
        m4Corrections: { status: 'AVAILABLE', subScore: null, totalCorrections: 0 }
      };

      const res1 = computeOverallScore(baseMetrics, 100, defaultConfig);

      // Now add 50 corrections to M4
      const highCorrectionMetrics = {
        ...baseMetrics,
        m4Corrections: { status: 'AVAILABLE', subScore: null, totalCorrections: 50 }
      };

      const res2 = computeOverallScore(highCorrectionMetrics, 100, defaultConfig);

      expect(res1.overallScore).toBe(85.0);
      expect(res2.overallScore).toBe(85.0);
      expect(res1.overallScore).toBe(res2.overallScore);
    });
  });

  describe('4. Support-Oriented Band Classification', () => {
    test('maps score ranges into non-punitive, support-oriented bands', () => {
      expect(determineBand(92.0, defaultConfig)).toBe('STRONG');
      expect(determineBand(85.0, defaultConfig)).toBe('STRONG');
      expect(determineBand(84.9, defaultConfig)).toBe('ADEQUATE');
      expect(determineBand(70.0, defaultConfig)).toBe('ADEQUATE');
      expect(determineBand(69.9, defaultConfig)).toBe('NEEDS_SUPPORT');
      expect(determineBand(50.0, defaultConfig)).toBe('NEEDS_SUPPORT');
      expect(determineBand(49.9, defaultConfig)).toBe('PRIORITY_SUPPORT');
      expect(determineBand(20.0, defaultConfig)).toBe('PRIORITY_SUPPORT');
      expect(determineBand(null, defaultConfig)).toBe('INSUFFICIENT_DATA');
    });
  });

  describe('5. Rule-Based Support Suggestions', () => {
    test('generates targeted data-entry refresher suggestion when required fields are missing', () => {
      const metrics = {
        m1Completeness: {
          completenessPct: 88.5,
          missingFieldsCount: { apaarToken: 14, dob: 2 }
        },
        m2Discrepancies: { ageingBuckets: { '31_plus_days': 0, '8_to_30_days': 1 } },
        m3Timeliness: { status: 'AVAILABLE', medianLagDays: 8 }
      };

      const suggestions = generateSupportSuggestions(metrics, defaultConfig);
      expect(suggestions.length).toBeGreaterThan(0);
      const m1Sugg = suggestions.find((s) => s.triggerMetric === 'M1_COMPLETENESS');
      expect(m1Sugg).toBeDefined();
      expect(m1Sugg.title).toContain('APAAR / Student ID');
      expect(m1Sugg.triggerValue).toContain('14 missing records');
      expect(m1Sugg.recommendedAction).toContain('staff refresher');
    });

    test('generates priority case review suggestion when open discrepancies exceed 30 days', () => {
      const metrics = {
        m1Completeness: { missingFieldsCount: {} },
        m2Discrepancies: { ageingBuckets: { '31_plus_days': 4, '8_to_30_days': 2 } },
        m3Timeliness: { status: 'AVAILABLE', medianLagDays: 10 }
      };

      const suggestions = generateSupportSuggestions(metrics, defaultConfig);
      const m2Sugg = suggestions.find((s) => s.id === 'SUGG-M2-AGED-DISCREPANCIES');
      expect(m2Sugg).toBeDefined();
      expect(m2Sugg.triggerValue).toContain('4 findings aged >30 days');
    });

    test('generates timeliness schedule suggestion when median lag exceeds configured window', () => {
      const metrics = {
        m1Completeness: { missingFieldsCount: {} },
        m2Discrepancies: { ageingBuckets: { '31_plus_days': 0, '8_to_30_days': 0 } },
        m3Timeliness: { status: 'AVAILABLE', medianLagDays: 24 } // window is 15
      };

      const suggestions = generateSupportSuggestions(metrics, defaultConfig);
      const m3Sugg = suggestions.find((s) => s.triggerMetric === 'M3_TIMELINESS');
      expect(m3Sugg).toBeDefined();
      expect(m3Sugg.triggerValue).toContain('24 days');
    });

    test('generates routine maintenance note when all metrics are strong', () => {
      const metrics = {
        m1Completeness: { missingFieldsCount: {} },
        m2Discrepancies: { ageingBuckets: { '31_plus_days': 0, '8_to_30_days': 0 } },
        m3Timeliness: { status: 'AVAILABLE', medianLagDays: 5 }
      };

      const suggestions = generateSupportSuggestions(metrics, defaultConfig);
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].id).toBe('SUGG-GENERAL-MAINTENANCE');
    });
  });

  describe('6. Comparability & Privacy Anonymisation', () => {
    test('identifies comparability warnings across different institution types or formula versions', () => {
      const items = [
        {
          institutionId: 'inst-1',
          institutionType: 'ENGINEERING',
          reportingPeriod: '2024-25',
          configVersion: 'v1.0'
        },
        {
          institutionId: 'inst-2',
          institutionType: 'MANAGEMENT',
          reportingPeriod: '2024-25',
          configVersion: 'v1.0'
        }
      ];

      const comp = evaluateComparability(items);
      expect(comp.isDirectlyComparable).toBe(false);
      expect(comp.warnings.some((w) => w.includes('Mismatched institution types'))).toBe(true);
    });

    test('identifies formula version discrepancy warning', () => {
      const items = [
        {
          institutionId: 'inst-1',
          institutionType: 'ENGINEERING',
          reportingPeriod: '2024-25',
          configVersion: 'v1.0'
        },
        {
          institutionId: 'inst-2',
          institutionType: 'ENGINEERING',
          reportingPeriod: '2024-25',
          configVersion: 'v2.0'
        }
      ];

      const comp = evaluateComparability(items);
      expect(comp.isDirectlyComparable).toBe(false);
      expect(comp.warnings.some((w) => w.includes('Incompatible formula versions'))).toBe(true);
    });

    test('anonymises peer institution identity for institution-level users', () => {
      const user = {
        role: 'INSTITUTION_ADMIN',
        institutionId: 'inst-1'
      };

      const items = [
        {
          institutionId: 'inst-1',
          institutionName: 'Apex Institute of Technology',
          institutionCode: 'AIT-101',
          institutionType: 'ENGINEERING'
        },
        {
          institutionId: 'inst-2',
          institutionName: 'State Polytechnic College',
          institutionCode: 'SPC-202',
          institutionType: 'ENGINEERING'
        }
      ];

      const sanitized = sanitizeForViewer(items, user);
      expect(sanitized[0].institutionName).toBe('Apex Institute of Technology');
      expect(sanitized[0].isOwnInstitution).toBe(true);

      // Peer must be anonymised
      expect(sanitized[1].institutionName).toBe('Peer Institution B (ENGINEERING)');
      expect(sanitized[1].institutionCode).toBe('PEER-2');
      expect(sanitized[1].isOwnInstitution).toBe(false);
    });

    test('does NOT anonymise peer institutions for Authority users', () => {
      const user = { role: 'AUTHORITY_ADMIN' };
      const items = [
        { institutionId: 'inst-1', institutionName: 'Apex Institute', institutionCode: 'AIT-101' },
        { institutionId: 'inst-2', institutionName: 'State Polytechnic', institutionCode: 'SPC-202' }
      ];

      const result = sanitizeForViewer(items, user);
      expect(result[0].institutionName).toBe('Apex Institute');
      expect(result[1].institutionName).toBe('State Polytechnic');
    });
  });
});
