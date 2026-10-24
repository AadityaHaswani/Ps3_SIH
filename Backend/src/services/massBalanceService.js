/**
 * Academic Mass-Balance Service.
 * Implements cohort reconciliation between academic year transitions.
 * Tracks expected continuing records, configured entrants/exits, and highlights carryover mismatches.
 */
const SeatBalance = require('../models/seatBalance.model');
const Programme = require('../models/programme.model');
const {
  normaliseProgrammeCode,
  normaliseAcademicYear
} = require('../utils/normalisation');

/**
 * Derives the previous academic year from a given academic year string (e.g. '2024-25' -> '2023-24').
 */
function derivePreviousAcademicYear(academicYear) {
  if (!academicYear || typeof academicYear !== 'string') return null;
  const parts = academicYear.trim().split('-');
  if (parts.length !== 2) return null;

  const startYear = parseInt(parts[0], 10);
  if (isNaN(startYear) || startYear < 1900 || startYear > 2100) return null;

  const prevStartYear = startYear - 1;
  const prevEndYearSuffix = String(startYear).slice(-2);
  return `${prevStartYear}-${prevEndYearSuffix}`;
}

/**
 * Computes cohort mass-balance carryover for an institution and programme between academic years.
 *
 * @param {Object} params
 * @param {string} params.institutionId
 * @param {string} params.programmeCode
 * @param {string} params.academicYear
 * @param {string} [params.previousAcademicYear]
 * @param {number} [params.entrants=0] - Lateral entries, transfer-ins
 * @param {number} [params.exits=0] - Withdrawals, dropouts, transfer-outs
 * @param {number} [params.retentionRate=1.0] - Configured expected progression fraction
 */
async function computeCohortMassBalance({
  institutionId,
  programmeCode,
  academicYear,
  previousAcademicYear = null,
  entrants = 0,
  exits = 0,
  retentionRate = 1.0
}) {
  const normProg = normaliseProgrammeCode(programmeCode);
  const normCurrentYear = normaliseAcademicYear(academicYear);
  const normPrevYear = previousAcademicYear
    ? normaliseAcademicYear(previousAcademicYear)
    : derivePreviousAcademicYear(normCurrentYear);

  // 1. Check programme master for duration and continuation configuration
  const programme = await Programme.findOne({
    institutionId,
    code: normProg
  }).lean();

  if (!programme) {
    return {
      institutionId,
      programmeCode: normProg,
      academicYear: normCurrentYear,
      previousAcademicYear: normPrevYear,
      durationYears: null,
      baselinePreviousCohortCount: null,
      entrants: Number(entrants) || 0,
      exits: Number(exits) || 0,
      retentionRate,
      expectedContinuingCount: null,
      reportedCurrentCount: null,
      discrepancyDelta: null,
      status: 'UNKNOWN_PROGRAMME_RULES',
      isProvisional: true,
      explanation: `Programme code ${normProg} is not configured in the institutional programme master. Unknown programme rules do not trigger an invented violation.`,
      evaluatedAt: new Date()
    };
  }

  if (!normPrevYear) {
    return {
      institutionId,
      programmeCode: normProg,
      academicYear: normCurrentYear,
      previousAcademicYear: null,
      durationYears: programme.durationYears || 4,
      baselinePreviousCohortCount: null,
      entrants: Number(entrants) || 0,
      exits: Number(exits) || 0,
      retentionRate,
      expectedContinuingCount: null,
      reportedCurrentCount: null,
      discrepancyDelta: null,
      status: 'INSUFFICIENT_HISTORICAL_DATA',
      isProvisional: true,
      explanation: `Cannot determine previous academic year for ${normCurrentYear} to establish cohort baseline.`,
      evaluatedAt: new Date()
    };
  }

  // 2. Query baseline previous cohort occupancy from seat balances
  const prevBalances = await SeatBalance.find({
    institutionId,
    programmeCode: normProg,
    academicYear: normPrevYear
  }).lean();

  if (prevBalances.length === 0) {
    return {
      institutionId,
      programmeCode: normProg,
      academicYear: normCurrentYear,
      previousAcademicYear: normPrevYear,
      durationYears: programme.durationYears || 4,
      baselinePreviousCohortCount: null,
      entrants: Number(entrants) || 0,
      exits: Number(exits) || 0,
      retentionRate,
      expectedContinuingCount: null,
      reportedCurrentCount: null,
      discrepancyDelta: null,
      status: 'INSUFFICIENT_HISTORICAL_DATA',
      isProvisional: true,
      explanation: `No historical roster snapshot or seat ledger data found for baseline academic year ${normPrevYear}. Mass-balance calculation is provisional and marked unavailable.`,
      evaluatedAt: new Date()
    };
  }

  const baselinePreviousCohortCount = prevBalances.reduce(
    (acc, curr) => acc + (curr.reportedOccupancy || 0),
    0
  );

  // 3. Query current academic year occupancy from seat balances
  const currentBalances = await SeatBalance.find({
    institutionId,
    programmeCode: normProg,
    academicYear: normCurrentYear
  }).lean();

  if (currentBalances.length === 0) {
    return {
      institutionId,
      programmeCode: normProg,
      academicYear: normCurrentYear,
      previousAcademicYear: normPrevYear,
      durationYears: programme.durationYears || 4,
      baselinePreviousCohortCount,
      entrants: Number(entrants) || 0,
      exits: Number(exits) || 0,
      retentionRate,
      expectedContinuingCount: null,
      reportedCurrentCount: null,
      discrepancyDelta: null,
      status: 'INSUFFICIENT_CURRENT_DATA',
      isProvisional: true,
      explanation: `No reported roster or seat ledger records found for current academic year ${normCurrentYear}.`,
      evaluatedAt: new Date()
    };
  }

  const reportedCurrentCount = currentBalances.reduce(
    (acc, curr) => acc + (curr.reportedOccupancy || 0),
    0
  );

  const numEntrants = Math.max(0, parseInt(entrants, 10) || 0);
  const numExits = Math.max(0, parseInt(exits, 10) || 0);
  const progRate = Math.min(1.0, Math.max(0, Number(retentionRate) || 1.0));

  // 4. Calculate expected continuing count
  const expectedContinuingCount =
    Math.round(baselinePreviousCohortCount * progRate) + numEntrants - numExits;

  const discrepancyDelta = reportedCurrentCount - expectedContinuingCount;

  let status = 'RECONCILED';
  let explanation = '';

  if (discrepancyDelta !== 0) {
    status = 'COHORT_CARRYOVER_MISMATCH';
    const deltaSign = discrepancyDelta > 0 ? `+${discrepancyDelta}` : `${discrepancyDelta}`;
    explanation = `Reported current cohort count (${reportedCurrentCount}) does not match expected continuing count (${expectedContinuingCount} = baseline ${baselinePreviousCohortCount} × ${(progRate * 100).toFixed(0)}% retention + ${numEntrants} entrants - ${numExits} exits). Discrepancy delta: ${deltaSign}.`;
  } else {
    status = 'RECONCILED';
    explanation = `Reported current cohort count (${reportedCurrentCount}) exactly matches expected continuing count (${expectedContinuingCount} = baseline ${baselinePreviousCohortCount} × ${(progRate * 100).toFixed(0)}% retention + ${numEntrants} entrants - ${numExits} exits).`;
  }

  return {
    institutionId,
    programmeCode: normProg,
    academicYear: normCurrentYear,
    previousAcademicYear: normPrevYear,
    durationYears: programme.durationYears || 4,
    baselinePreviousCohortCount,
    entrants: numEntrants,
    exits: numExits,
    retentionRate: progRate,
    expectedContinuingCount,
    reportedCurrentCount,
    discrepancyDelta,
    status,
    isProvisional: false,
    explanation,
    evaluatedAt: new Date()
  };
}

module.exports = {
  derivePreviousAcademicYear,
  computeCohortMassBalance
};
