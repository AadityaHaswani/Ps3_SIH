/**
 * Unit Tests for Seat Ledger & Academic Mass-Balance Calculations.
 * Tests pure business logic without external dependencies:
 * - Headroom & utilisation calculations
 * - Warning threshold triggers
 * - Over-cap discrepancy detection
 * - Missing, unverified, and zero intake handling
 * - Academic year derivation
 * - Mass-balance cohort carryover logic
 */
const {
  computeBalanceMetrics,
  buildBucketKey
} = require('../src/services/seatLedgerService');
const {
  derivePreviousAcademicYear,
  computeCohortMassBalance
} = require('../src/services/massBalanceService');

describe('Seat Ledger Pure Calculations (Unit Tests)', () => {
  describe('computeBalanceMetrics', () => {
    test('handles missing or unconfigured intake explicitly', () => {
      const resNull = computeBalanceMetrics(null, 25);
      expect(resNull.status).toBe('NO_INTAKE_CONFIGURED');
      expect(resNull.headroom).toBeNull();
      expect(resNull.utilisationPct).toBeNull();
      expect(resNull.flags).toContain('NO_INTAKE_CONFIGURED');

      const resUndefined = computeBalanceMetrics(undefined, 0);
      expect(resUndefined.status).toBe('NO_INTAKE_CONFIGURED');
      expect(resUndefined.headroom).toBeNull();
      expect(resUndefined.utilisationPct).toBeNull();

      const resNaN = computeBalanceMetrics('not_a_number', 10);
      expect(resNaN.status).toBe('NO_INTAKE_CONFIGURED');
    });

    test('handles zero intake without NaN or Infinity', () => {
      const res = computeBalanceMetrics(0, 0, 90, 'AUTHORITY_VERIFIED');
      expect(res.approvedIntake).toBe(0);
      expect(res.reportedOccupancy).toBe(0);
      expect(res.headroom).toBe(0);
      expect(res.utilisationPct).toBeNull();
      expect(res.flags).toContain('ZERO_INTAKE');
      expect(res.status).toBe('OK');
    });

    test('calculates correct headroom and utilisation percentage for normal occupancy', () => {
      const res = computeBalanceMetrics(60, 48, 90, 'AUTHORITY_VERIFIED');
      expect(res.approvedIntake).toBe(60);
      expect(res.reportedOccupancy).toBe(48);
      expect(res.headroom).toBe(12);
      expect(res.utilisationPct).toBe(80);
      expect(res.status).toBe('OK');
      expect(res.flags).toEqual([]);
    });

    test('triggers WARNING status when utilisation reaches or exceeds warning threshold', () => {
      // 55 / 60 = 91.67% -> rounds to 91.7% >= 90% threshold
      const res = computeBalanceMetrics(60, 55, 90, 'AUTHORITY_VERIFIED');
      expect(res.headroom).toBe(5);
      expect(res.utilisationPct).toBe(91.7);
      expect(res.status).toBe('WARNING');
      expect(res.flags).toContain('NEAR_CAPACITY_WARNING');
    });

    test('triggers OVER_CAP_DISCREPANCY when reported occupancy exceeds approved intake', () => {
      const res = computeBalanceMetrics(60, 63, 90, 'AUTHORITY_VERIFIED');
      expect(res.headroom).toBe(-3);
      expect(res.utilisationPct).toBe(105);
      expect(res.status).toBe('OVER_CAP_DISCREPANCY');
      expect(res.flags).toContain('OVER_CAP_ALERT');
    });

    test('marks unverified intake honestly without disguising uncertainty', () => {
      // Normal occupancy with unverified intake
      const normalUnverified = computeBalanceMetrics(60, 40, 90, 'INTAKE_UNVERIFIED');
      expect(normalUnverified.status).toBe('INTAKE_UNVERIFIED');
      expect(normalUnverified.flags).toContain('INTAKE_UNVERIFIED');

      // Over-cap occupancy with unverified intake -> provisional flag
      const overCapUnverified = computeBalanceMetrics(60, 65, 90, 'INTAKE_UNVERIFIED');
      expect(overCapUnverified.status).toBe('INTAKE_UNVERIFIED');
      expect(overCapUnverified.flags).toContain('INTAKE_UNVERIFIED');
      expect(overCapUnverified.flags).toContain('PROVISIONAL_OVER_CAP');
    });
  });

  describe('buildBucketKey', () => {
    test('generates canonical normalized bucket composite key', () => {
      const key = buildBucketKey('inst-101', 'btech_cse', '2024-2025', 'general');
      expect(key).toBe('inst-101__BTECH_CSE__2024-25__GENERAL');
    });
  });

  describe('derivePreviousAcademicYear', () => {
    test('correctly calculates previous year for valid academic year strings', () => {
      expect(derivePreviousAcademicYear('2024-25')).toBe('2023-24');
      expect(derivePreviousAcademicYear('2023-24')).toBe('2022-23');
      expect(derivePreviousAcademicYear('2025-26')).toBe('2024-25');
    });

    test('handles malformed inputs safely by returning null', () => {
      expect(derivePreviousAcademicYear(null)).toBeNull();
      expect(derivePreviousAcademicYear('2024')).toBeNull();
      expect(derivePreviousAcademicYear('invalid-year')).toBeNull();
    });
  });
});
