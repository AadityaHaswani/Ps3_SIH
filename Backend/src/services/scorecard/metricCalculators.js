/**
 * Metric Calculators for Institutional Data Reliability Scorecard.
 * Pure and database-assisted calculators for M1, M2, M3, M4 and Data Coverage.
 * Enforces neutral framing, never invents missing data, and marks unavailable metrics honestly.
 */
const RosterRow = require('../../models/rosterRow.model');
const RosterUpload = require('../../models/rosterUpload.model');
const RosterVersion = require('../../models/rosterVersion.model');
const ReconciliationFinding = require('../../models/reconciliationFinding.model');
const ReconciliationRun = require('../../models/reconciliationRun.model');
const SeatLedgerEntry = require('../../models/seatLedgerEntry.model');
const ExternalRegisterRecord = require('../../models/externalRegisterRecord.model');
const DataCorrectionEvent = require('../../models/correctionEvent.model');

/**
 * Calculates statistical median of a sorted array of numbers.
 */
function calculateMedian(sortedArray) {
  if (!sortedArray || sortedArray.length === 0) return null;
  const mid = Math.floor(sortedArray.length / 2);
  if (sortedArray.length % 2 !== 0) {
    return sortedArray[mid];
  }
  return (sortedArray[mid - 1] + sortedArray[mid]) / 2;
}

/**
 * Calculates 90th percentile of a sorted array of numbers.
 */
function calculateP90(sortedArray) {
  if (!sortedArray || sortedArray.length === 0) return null;
  const index = Math.ceil(0.9 * sortedArray.length) - 1;
  return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
}

/**
 * Helper to fetch in-scope RosterRow documents for an institution & academic year.
 */
async function getInScopeRosterRows(institutionId, reportingPeriod, options = {}) {
  const committedVersion = await RosterVersion.findOne({
    institutionId,
    academicYear: reportingPeriod,
    status: 'COMMITTED'
  }).sort({ versionNumber: -1 });

  let query = {};
  if (options.programmeCode) {
    query.programmeCode = options.programmeCode;
  }

  if (committedVersion) {
    query.rosterVersionId = committedVersion._id;
    return RosterRow.find(query);
  }

  const latestUpload = await RosterUpload.findOne({
    institutionId,
    academicYear: reportingPeriod
  }).sort({ createdAt: -1 });

  if (latestUpload) {
    query.rosterUploadId = latestUpload._id;
    return RosterRow.find(query);
  }

  return [];
}

/**
 * M1 — Record Completeness Calculator
 */
async function calculateCompleteness(institutionId, reportingPeriod, config, options = {}) {
  const m1Params = (config && config.parameters && config.parameters.m1) || {};
  const requiredFields = m1Params.requiredFields || [
    'applicationNo',
    'apaarToken',
    'name',
    'dob',
    'gender',
    'category',
    'programmeCode',
    'academicYear'
  ];
  const minRecords = m1Params.minRecords !== undefined ? m1Params.minRecords : 30;
  const ruleVersion = m1Params.ruleVersion || 'roster-req-fields@1';

  // Fetch in-scope roster rows
  const rows = await getInScopeRosterRows(institutionId, reportingPeriod, options);
  const inScopeRecords = rows.length;

  if (inScopeRecords === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      completenessPct: null,
      subScore: null,
      inScopeRecords: 0,
      totalMandatoryFieldInstances: 0,
      populatedMandatoryFieldInstances: 0,
      missingFieldsCount: {},
      ruleVersion,
      missingReason: 'No roster records found in scope for this reporting period.'
    };
  }

  const missingFieldsCount = {};
  for (const field of requiredFields) {
    missingFieldsCount[field] = 0;
  }

  let populatedInstances = 0;
  const totalMandatoryInstances = inScopeRecords * requiredFields.length;

  for (const row of rows) {
    for (const field of requiredFields) {
      const val = row[field];
      const isPopulated =
        val !== null &&
        val !== undefined &&
        String(val).trim() !== '' &&
        String(val).trim() !== 'null' &&
        String(val).trim() !== 'undefined';

      if (isPopulated) {
        populatedInstances += 1;
      } else {
        missingFieldsCount[field] = (missingFieldsCount[field] || 0) + 1;
      }
    }
  }

  const completenessPct =
    totalMandatoryInstances > 0
      ? Math.round((populatedInstances / totalMandatoryInstances) * 1000) / 10
      : 0;

  if (inScopeRecords < minRecords) {
    return {
      status: 'INSUFFICIENT_DATA',
      completenessPct,
      subScore: completenessPct,
      inScopeRecords,
      totalMandatoryFieldInstances: totalMandatoryInstances,
      populatedMandatoryFieldInstances: populatedInstances,
      missingFieldsCount,
      ruleVersion,
      missingReason: `In-scope records (${inScopeRecords}) below minimum threshold (${minRecords}) for reliable evaluation.`
    };
  }

  return {
    status: 'AVAILABLE',
    completenessPct,
    subScore: completenessPct,
    inScopeRecords,
    totalMandatoryFieldInstances: totalMandatoryInstances,
    populatedMandatoryFieldInstances: populatedInstances,
    missingFieldsCount,
    ruleVersion,
    missingReason: null
  };
}

/**
 * M2 — Unresolved Discrepancies Calculator
 */
async function calculateDiscrepancies(
  institutionId,
  reportingPeriod,
  inScopeRecordsCount,
  config,
  options = {}
) {
  const m2Params = (config && config.parameters && config.parameters.m2) || {};
  const rateCeiling = m2Params.rateCeilingPer1000 || 50.0;
  const minRecords = m2Params.minRecords !== undefined ? m2Params.minRecords : 30;
  const contributingTypes = m2Params.contributingTypes || [
    'UNMATCHED',
    'CONFLICT',
    'CANDIDATE_REVIEW',
    'DUPLICATE_CANDIDATE',
    'MISSING_FROM_ROSTER',
    'COUNT_MISMATCH'
  ];

  // 1. Find all reconciliation runs for this institution and period
  const runs = await ReconciliationRun.find({
    institutionId,
    academicYear: reportingPeriod
  }).select('_id');

  const runIds = runs.map((r) => String(r._id));

  // Also query findings directly for institutionId
  const query = {
    institutionId,
    type: { $in: contributingTypes }
  };
  if (runIds.length > 0) {
    query.$or = [{ runId: { $in: runIds } }, { institutionId }];
  }

  const findings = await ReconciliationFinding.find(query);

  const now = options.asOfDate ? new Date(options.asOfDate) : new Date();

  let openCount = 0;
  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  const byType = {};
  for (const t of contributingTypes) {
    byType[t] = 0;
  }

  const ageingBuckets = {
    '0_to_7_days': 0,
    '8_to_30_days': 0,
    '31_plus_days': 0
  };

  const resolutionDurations = [];

  for (const f of findings) {
    const isResolved = f.reviewStatus === 'RESOLVED' || f.reviewStatus === 'DISMISSED';

    if (!isResolved) {
      openCount += 1;
      const sev = f.severity || 'MEDIUM';
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
      byType[f.type] = (byType[f.type] || 0) + 1;

      // Ageing calculation
      const created = f.createdAt ? new Date(f.createdAt) : now;
      const ageDays = Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));

      if (ageDays <= 7) {
        ageingBuckets['0_to_7_days'] += 1;
      } else if (ageDays <= 30) {
        ageingBuckets['8_to_30_days'] += 1;
      } else {
        ageingBuckets['31_plus_days'] += 1;
      }
    } else {
      // Resolved: calculate time to resolution if timestamps exist
      if (f.createdAt) {
        let resolvedAt = f.updatedAt;
        if (f.reviewHistory && f.reviewHistory.length > 0) {
          const lastReview = f.reviewHistory[f.reviewHistory.length - 1];
          if (lastReview.at) resolvedAt = lastReview.at;
        }
        if (resolvedAt) {
          const durationDays = Math.max(
            0,
            (new Date(resolvedAt) - new Date(f.createdAt)) / (1000 * 60 * 60 * 24)
          );
          resolutionDurations.push(durationDays);
        }
      }
    }
  }

  // Median and P90 time to resolution
  let medianResolutionTimeDays = null;
  let p90ResolutionTimeDays = null;
  if (resolutionDurations.length >= 5) {
    resolutionDurations.sort((a, b) => a - b);
    medianResolutionTimeDays =
      Math.round(calculateMedian(resolutionDurations) * 10) / 10;
    p90ResolutionTimeDays =
      Math.round(calculateP90(resolutionDurations) * 10) / 10;
  }

  // Observed rate per 1,000 in-scope records
  const ratePer1000 =
    inScopeRecordsCount > 0
      ? Math.round((openCount / inScopeRecordsCount) * 1000 * 10) / 10
      : 0;

  // Normalised sub-score: 100 * max(0, 1 - observedRate / rateCeiling)
  const ratio = rateCeiling > 0 ? ratePer1000 / rateCeiling : 1;
  const rawSubScore = 100 * Math.max(0, 1 - ratio);
  const subScore = Math.round(rawSubScore * 10) / 10;

  if (inScopeRecordsCount < minRecords) {
    return {
      status: 'INSUFFICIENT_DATA',
      openDiscrepancies: openCount,
      unresolvedRatePer1000: ratePer1000,
      subScore,
      bySeverity,
      byType,
      ageingBuckets,
      medianResolutionTimeDays,
      p90ResolutionTimeDays,
      missingReason: `In-scope records (${inScopeRecordsCount}) below minimum threshold (${minRecords}) for discrepancy rate.`
    };
  }

  return {
    status: 'AVAILABLE',
    openDiscrepancies: openCount,
    unresolvedRatePer1000: ratePer1000,
    subScore,
    bySeverity,
    byType,
    ageingBuckets,
    medianResolutionTimeDays,
    p90ResolutionTimeDays,
    missingReason: null
  };
}

/**
 * M3 — Update Timeliness Calculator
 */
async function calculateTimeliness(institutionId, reportingPeriod, config, options = {}) {
  const m3Params = (config && config.parameters && config.parameters.m3) || {};
  const lagCeilingDays = m3Params.lagCeilingDays || 30;
  const onTimeWindowDays = m3Params.onTimeWindowDays || 15;
  const minDatedEvents = m3Params.minDatedEvents !== undefined ? m3Params.minDatedEvents : 20;

  // Fetch in-scope roster rows
  const rows = await getInScopeRosterRows(institutionId, reportingPeriod, options);

  if (!rows || rows.length === 0) {
    return {
      status: 'UNAVAILABLE',
      medianLagDays: null,
      p90LagDays: null,
      onTimePct: null,
      subScore: null,
      eligibleEventCount: 0,
      excludedEventCount: 0,
      dataFreshnessDays: null,
      lastUpdatedTimestamp: null,
      missingReason: 'No roster records found for timeliness calculation.'
    };
  }

  // Find latest upload timestamp for freshness
  const latestUpload = await RosterUpload.findOne({
    institutionId,
    academicYear: reportingPeriod
  }).sort({ createdAt: -1 });

  const lastUpdatedTimestamp = latestUpload ? latestUpload.createdAt : rows[0].createdAt;
  const now = options.asOfDate ? new Date(options.asOfDate) : new Date();
  const dataFreshnessDays = lastUpdatedTimestamp
    ? Math.max(0, Math.floor((now - new Date(lastUpdatedTimestamp)) / (1000 * 60 * 60 * 24)))
    : null;

  // Filter rows with valid, parseable admissionDate
  const lags = [];
  let onTimeCount = 0;
  let excludedCount = 0;

  for (const r of rows) {
    if (!r.admissionDate) {
      excludedCount += 1;
      continue;
    }

    const admDate = new Date(r.admissionDate);
    if (isNaN(admDate.getTime())) {
      excludedCount += 1;
      continue;
    }

    // Delay = reported date (createdAt or upload date) - effective admissionDate
    const reportedDate = r.createdAt ? new Date(r.createdAt) : now;
    const diffMs = reportedDate - admDate;
    const lagDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    lags.push(lagDays);
    if (lagDays <= onTimeWindowDays) {
      onTimeCount += 1;
    }
  }

  const eligibleCount = lags.length;

  if (eligibleCount === 0) {
    return {
      status: 'UNAVAILABLE',
      medianLagDays: null,
      p90LagDays: null,
      onTimePct: null,
      subScore: null,
      eligibleEventCount: 0,
      excludedEventCount: excludedCount,
      dataFreshnessDays,
      lastUpdatedTimestamp,
      missingReason:
        'Admission dates are unpopulated; timeliness cannot be evaluated without verifiable event dates.'
    };
  }

  if (eligibleCount < minDatedEvents) {
    lags.sort((a, b) => a - b);
    const medianLag = calculateMedian(lags);
    const p90Lag = calculateP90(lags);
    const onTimePct = Math.round((onTimeCount / eligibleCount) * 1000) / 10;

    return {
      status: 'INSUFFICIENT_DATA',
      medianLagDays: Math.round(medianLag * 10) / 10,
      p90LagDays: Math.round(p90Lag * 10) / 10,
      onTimePct,
      subScore: null,
      eligibleEventCount: eligibleCount,
      excludedEventCount: excludedCount,
      dataFreshnessDays,
      lastUpdatedTimestamp,
      missingReason: `Fewer than ${minDatedEvents} dated admission events (${eligibleCount} found); below prototype statistical threshold.`
    };
  }

  lags.sort((a, b) => a - b);
  const medianLagDays = Math.round(calculateMedian(lags) * 10) / 10;
  const p90LagDays = Math.round(calculateP90(lags) * 10) / 10;
  const onTimePct = Math.round((onTimeCount / eligibleCount) * 1000) / 10;

  // Lag score: 100 * max(0, 1 - p90LagDays / lagCeilingDays)
  const lagRatio = lagCeilingDays > 0 ? p90LagDays / lagCeilingDays : 1;
  const lagScore = 100 * Math.max(0, 1 - lagRatio);

  // Timeliness sub-score = 0.5 * onTimePct + 0.5 * lagScore
  const timelinessSubScore = Math.round((0.5 * onTimePct + 0.5 * lagScore) * 10) / 10;

  return {
    status: 'AVAILABLE',
    medianLagDays,
    p90LagDays,
    onTimePct,
    subScore: timelinessSubScore,
    eligibleEventCount: eligibleCount,
    excludedEventCount: excludedCount,
    dataFreshnessDays,
    lastUpdatedTimestamp,
    missingReason: null
  };
}

/**
 * M4 — Correction Activity & Correction Trends Calculator
 */
async function calculateCorrections(
  institutionId,
  reportingPeriod,
  inScopeRecordsCount,
  config,
  options = {}
) {
  const m4Enabled = config && config.m4EnabledInScore === true;

  // Fetch attributable DataCorrectionEvents
  const correctionEvents = await DataCorrectionEvent.find({
    institutionId,
    reportingPeriod
  }).sort({ correctedAt: 1 });

  // Also check SeatLedgerEntry for CORRECTION_REVERSAL
  const ledgerReversals = await SeatLedgerEntry.find({
    institutionId,
    academicYear: reportingPeriod,
    entryType: 'CORRECTION_REVERSAL'
  });

  const totalEvents = correctionEvents.length + ledgerReversals.length;

  if (totalEvents === 0) {
    return {
      status: 'UNAVAILABLE',
      totalCorrections: 0,
      correctionsPer100Records: null,
      repeatCorrectionRate: null,
      medianTurnaroundDays: null,
      selfInitiatedCount: 0,
      promptedCount: 0,
      trendDirection: 'NONE',
      enabledInScore: m4Enabled,
      subScore: null,
      missingReason: 'No attributable correction records logged for this reporting period.'
    };
  }

  let repeatCount = 0;
  let selfInitiatedCount = 0;
  let promptedCount = 0;
  const turnarounds = [];

  for (const c of correctionEvents) {
    if (c.isRepeatCorrection) repeatCount += 1;
    if (c.isSelfInitiated) selfInitiatedCount += 1;
    else promptedCount += 1;

    if (c.turnaroundHours !== null && c.turnaroundHours !== undefined) {
      turnarounds.push(c.turnaroundHours / 24);
    }
  }

  // Ledger reversals are institution-initiated corrections
  selfInitiatedCount += ledgerReversals.length;

  const correctionsPer100 =
    inScopeRecordsCount > 0
      ? Math.round((totalEvents / inScopeRecordsCount) * 100 * 10) / 10
      : null;

  const repeatRate =
    correctionEvents.length > 0
      ? Math.round((repeatCount / correctionEvents.length) * 100 * 10) / 10
      : 0;

  turnarounds.sort((a, b) => a - b);
  const medianTurnaround =
    turnarounds.length > 0 ? Math.round(calculateMedian(turnarounds) * 10) / 10 : null;

  // Trend direction: compare first half to second half if events >= 4
  let trendDirection = 'STABLE';
  if (correctionEvents.length >= 4) {
    const half = Math.floor(correctionEvents.length / 2);
    const firstHalfCount = half;
    const secondHalfCount = correctionEvents.length - half;
    if (secondHalfCount > firstHalfCount * 1.3) trendDirection = 'INCREASING';
    else if (secondHalfCount < firstHalfCount * 0.7) trendDirection = 'DECREASING';
  }

  // M4 is NOT penalised in score; if enabled, raw context sub-score
  const subScore = m4Enabled ? 100 : null;

  return {
    status: 'AVAILABLE',
    totalCorrections: totalEvents,
    correctionsPer100Records: correctionsPer100,
    repeatCorrectionRate: repeatRate,
    medianTurnaroundDays: medianTurnaround,
    selfInitiatedCount,
    promptedCount,
    trendDirection,
    enabledInScore: m4Enabled,
    subScore,
    missingReason: null
  };
}

/**
 * Data Coverage Calculator
 */
async function calculateDataCoverage(institutionId, reportingPeriod, options = {}) {
  const expectedSources = [
    'INSTITUTION_ROSTER',
    'NATIONAL_APAAR_REGISTRY',
    'BOARD_RESULTS_REGISTER'
  ];

  const availableSources = [];
  const missingSources = [];
  const sourceModes = {};
  const sourceFreshness = {};

  // 1. Institution Roster
  const rosterUpload = await RosterUpload.findOne({
    institutionId,
    academicYear: reportingPeriod
  }).sort({ createdAt: -1 });

  if (rosterUpload) {
    availableSources.push('INSTITUTION_ROSTER');
    sourceModes.INSTITUTION_ROSTER = rosterUpload.sourceMode || 'INSTITUTION_REPORTED';
    sourceFreshness.INSTITUTION_ROSTER = rosterUpload.createdAt;
  } else {
    missingSources.push('INSTITUTION_ROSTER');
    sourceModes.INSTITUTION_ROSTER = 'UNAVAILABLE';
  }

  // 2. National APAAR / Central Allotment Registry
  const nationalRecord = await ExternalRegisterRecord.findOne({
    institutionId,
    academicYear: reportingPeriod,
    sourceType: { $in: ['ALLOTMENT', 'ADMISSION'] }
  }).sort({ createdAt: -1 });

  if (nationalRecord) {
    availableSources.push('NATIONAL_APAAR_REGISTRY');
    sourceModes.NATIONAL_APAAR_REGISTRY = nationalRecord.sourceMode || 'SIMULATED';
    sourceFreshness.NATIONAL_APAAR_REGISTRY = nationalRecord.createdAt;
  } else {
    // Check if reconciliation run flagged SOURCE_UNAVAILABLE
    const unavailFinding = await ReconciliationFinding.findOne({
      institutionId,
      type: 'SOURCE_UNAVAILABLE',
      'sourceRefs.source': { $regex: /APAAR|ALLOTMENT|NATIONAL/i }
    });

    if (unavailFinding) {
      missingSources.push('NATIONAL_APAAR_REGISTRY');
      sourceModes.NATIONAL_APAAR_REGISTRY = 'OUTAGE_OR_DISCONNECTED';
    } else {
      missingSources.push('NATIONAL_APAAR_REGISTRY');
      sourceModes.NATIONAL_APAAR_REGISTRY = 'NOT_INTEGRATED';
    }
  }

  // 3. Board Results / Secondary Exam Register
  const boardRecord = await ExternalRegisterRecord.findOne({
    institutionId,
    academicYear: reportingPeriod,
    sourceType: 'EXAM'
  }).sort({ createdAt: -1 });

  if (boardRecord) {
    availableSources.push('BOARD_RESULTS_REGISTER');
    sourceModes.BOARD_RESULTS_REGISTER = boardRecord.sourceMode || 'SIMULATED';
    sourceFreshness.BOARD_RESULTS_REGISTER = boardRecord.createdAt;
  } else {
    missingSources.push('BOARD_RESULTS_REGISTER');
    sourceModes.BOARD_RESULTS_REGISTER = 'NOT_INTEGRATED';
  }

  const coveragePct =
    expectedSources.length > 0
      ? Math.round((availableSources.length / expectedSources.length) * 1000) / 10
      : 0;

  return {
    coveragePct,
    expectedSources,
    availableSources,
    missingSources,
    sourceModes,
    sourceFreshness
  };
}

module.exports = {
  calculateCompleteness,
  calculateDiscrepancies,
  calculateTimeliness,
  calculateCorrections,
  calculateDataCoverage,
  calculateMedian,
  calculateP90
};
