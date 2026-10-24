/**
 * Reconciliation Service.
 * Coordinates the Seat Three-Way Match process across roster, admission, exam, and approved-intake sources.
 * Emits explainable findings, preserves neutral language, and adheres to idempotency.
 */
const ReconciliationRun = require('../models/reconciliationRun.model');
const ReconciliationFinding = require('../models/reconciliationFinding.model');
const RosterVersion = require('../models/rosterVersion.model');
const RosterRow = require('../models/rosterRow.model');
const ExternalRegisterRecord = require('../models/externalRegisterRecord.model');
const Programme = require('../models/programme.model');
const { matchRosterRecordAgainstSource, detectDuplicateCandidates } = require('./matchingService');
const { maskIdentifier, maskName } = require('../utils/cryptoToken');

const STALE_THRESHOLD_DAYS = 30;

/**
 * Runs the Seat Three-Way Match reconciliation workflow.
 */
async function runReconciliation({
  institutionId,
  academicYear,
  rosterVersionId,
  sources = ['ROSTER', 'ADMISSION', 'EXAM', 'INTAKE'],
  programmeCodes = [],
  user = {},
  idempotencyKey = null,
  simulationToggles = {} // allows simulating external source outage in tests or demo
}) {
  // 1. Idempotency Check: if run with same key already completed, return existing run
  if (idempotencyKey) {
    const existingRun = await ReconciliationRun.findOne({
      institutionId,
      idempotencyKey,
      status: 'COMPLETED'
    }).lean();

    if (existingRun) {
      return { run: existingRun, isReplay: true };
    }
  }

  // 2. Validate Roster Version
  const rosterVersion = await RosterVersion.findOne({
    _id: rosterVersionId,
    institutionId
  });

  if (!rosterVersion) {
    throw new Error('Committed roster version not found for this institution.');
  }

  if (rosterVersion.status !== 'COMMITTED') {
    throw new Error(`Roster version must be COMMITTED to run reconciliation. Current status: ${rosterVersion.status}`);
  }

  if (!Array.isArray(sources) || sources.length < 2) {
    throw new Error('At least two sources (including ROSTER) must be selected for reconciliation.');
  }

  const runId = `recon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // 3. Retrieve Roster Rows
  const rowQuery = {
    rosterVersionId: rosterVersion._id
  };
  if (programmeCodes.length > 0) {
    rowQuery.programmeCode = { $in: programmeCodes };
  }

  const rosterRows = await RosterRow.find(rowQuery).lean();

  // 4. Inspect External Sources (Admission, Exam)
  const externalSourceTypes = sources.filter((s) => ['ADMISSION', 'ALLOTMENT', 'EXAM', 'SCHOLARSHIP'].includes(s));
  const sourceRecordsMap = {};
  const sourceFreshness = {};
  const activeSources = [];

  for (const srcType of externalSourceTypes) {
    // Check if source is artificially toggled as unavailable (for testing resilience)
    if (simulationToggles[srcType] === 'UNAVAILABLE') {
      sourceFreshness[srcType] = {
        available: false,
        asOf: null,
        isStale: false,
        notes: 'External source service is temporarily unavailable.'
      };
      continue;
    }

    const extRecords = await ExternalRegisterRecord.find({
      institutionId,
      academicYear,
      sourceType: srcType,
      ...(programmeCodes.length > 0 ? { programmeCode: { $in: programmeCodes } } : {})
    }).lean();

    // Check if source has records or is reachable
    if (extRecords.length === 0 && simulationToggles[srcType] === 'EMPTY_AS_UNAVAILABLE') {
      sourceFreshness[srcType] = {
        available: false,
        asOf: null,
        isStale: false,
        notes: 'No records available in register.'
      };
      continue;
    }

    activeSources.push(srcType);

    // Compute freshness
    let latestAsOf = new Date(0);
    extRecords.forEach((r) => {
      if (r.asOf && new Date(r.asOf) > latestAsOf) {
        latestAsOf = new Date(r.asOf);
      }
    });

    const isStale =
      latestAsOf.getTime() > 0 &&
      (Date.now() - latestAsOf.getTime()) / (1000 * 60 * 60 * 24) > STALE_THRESHOLD_DAYS;

    sourceFreshness[srcType] = {
      available: true,
      asOf: latestAsOf.getTime() > 0 ? latestAsOf.toISOString() : new Date().toISOString(),
      isStale,
      recordCount: extRecords.length
    };

    sourceRecordsMap[srcType] = extRecords;
  }

  // 5. Initialize Findings and Summary Accumulator
  const findingsToInsert = [];
  const summary = {
    rosterRecords: rosterRows.length,
    confirmed3Way: 0,
    confirmedPartial: 0,
    unmatched: 0,
    conflicts: 0,
    candidateReview: 0,
    sourceUnavailable: 0,
    duplicateCandidates: 0,
    missingFromRoster: 0,
    countMismatches: 0
  };

  // Flag any unavailable sources
  externalSourceTypes.forEach((src) => {
    if (!activeSources.includes(src)) {
      summary.sourceUnavailable++;
      findingsToInsert.push({
        runId,
        institutionId,
        type: 'SOURCE_UNAVAILABLE',
        severity: 'INFO',
        recordRef: {},
        sourceRefs: [{ source: src, sourceRecordId: null, identifierMasked: null }],
        fieldDiffs: [],
        matchConfidence: 'WEAK',
        reviewStatus: 'RESOLVED',
        explanation: {
          expected: `Register ${src} available for comparison.`,
          observed: `Register ${src} is unreachable or unavailable.`,
          sourcesCompared: ['ROSTER', src],
          ruleApplied: 'SOURCE_AVAILABILITY_CHECK',
          nextAction: 'No action required. Zero penalties or missing student findings attributed to this source.'
        }
      });
    }
  });

  // Keep track of matched external record IDs for reverse check
  const matchedExternalIds = new Set();

  // 6. Match Each Roster Record against Active Sources
  for (const row of rosterRows) {
    const sourceMatches = {};
    let hasConflict = false;
    let hasWeakCandidate = false;
    let allActiveMatched = true;
    let matchedAny = false;
    const allFieldDiffs = [];
    const sourceRefs = [];

    for (const src of activeSources) {
      const records = sourceRecordsMap[src] || [];
      const matchResult = matchRosterRecordAgainstSource(row, records, src);
      sourceMatches[src] = matchResult;

      if (matchResult.matchedRecord) {
        matchedAny = true;
        matchedExternalIds.add(String(matchResult.matchedRecord._id));

        sourceRefs.push({
          source: src,
          sourceRecordId: String(matchResult.matchedRecord._id),
          identifierMasked: maskIdentifier(matchResult.matchedRecord.applicationNo || matchResult.matchedRecord.sourceIdentifier),
          attributes: {
            programmeCode: matchResult.matchedRecord.programmeCode,
            category: matchResult.matchedRecord.category,
            dob: matchResult.matchedRecord.dob
          }
        });
      }

      if (matchResult.status === 'CONFLICT') {
        hasConflict = true;
        allFieldDiffs.push(...matchResult.fieldDiffs);
      } else if (matchResult.status === 'CANDIDATE_REVIEW') {
        hasWeakCandidate = true;
        if (matchResult.fieldDiffs.length > 0) {
          allFieldDiffs.push(...matchResult.fieldDiffs);
        }
      } else if (matchResult.status === 'NOT_FOUND') {
        allActiveMatched = false;
      }
    }

    const baseRecordRef = {
      rowKey: row.rowKey,
      applicationNo: maskIdentifier(row.applicationNo),
      apaarTokenMasked: row.apaarToken ? maskIdentifier(row.apaarToken, 6) : null,
      studentNameMasked: maskName(row.name),
      programmeCode: row.programmeCode,
      category: row.category
    };

    // Classify Outcome Status
    if (activeSources.length === 0) {
      // No external sources were active
      summary.confirmedPartial++;
      findingsToInsert.push({
        runId,
        institutionId,
        type: 'CONFIRMED_PARTIAL',
        severity: 'LOW',
        recordRef: baseRecordRef,
        sourceRefs,
        fieldDiffs: [],
        matchConfidence: 'MODERATE',
        reviewStatus: 'RESOLVED',
        explanation: {
          expected: 'Independent sources available for match.',
          observed: 'External registers currently unavailable. Evaluated against institutional record alone.',
          sourcesCompared: ['ROSTER'],
          ruleApplied: 'FALLBACK_PARTIAL_CONFIRMATION',
          nextAction: 'Re-run reconciliation when external registers come online.'
        }
      });
    } else if (hasConflict) {
      summary.conflicts++;
      findingsToInsert.push({
        runId,
        institutionId,
        type: 'CONFLICT',
        severity: 'HIGH',
        recordRef: baseRecordRef,
        sourceRefs,
        fieldDiffs: allFieldDiffs,
        matchConfidence: 'STRONG',
        reviewStatus: 'PENDING',
        explanation: {
          expected: 'Attributes between matched records to be fully consistent.',
          observed: `Mismatches identified in fields: ${allFieldDiffs.map((d) => d.field).join(', ')}.`,
          sourcesCompared: ['ROSTER', ...activeSources],
          ruleApplied: 'ATTRIBUTE_CONSISTENCY_RULE',
          nextAction: 'Authority review: Examine conflicting attributes and request institution explanation if required.'
        }
      });
    } else if (hasWeakCandidate) {
      summary.candidateReview++;
      findingsToInsert.push({
        runId,
        institutionId,
        type: 'CANDIDATE_REVIEW',
        severity: 'MEDIUM',
        recordRef: baseRecordRef,
        sourceRefs,
        fieldDiffs: allFieldDiffs,
        matchConfidence: 'WEAK',
        reviewStatus: 'PENDING',
        explanation: {
          expected: 'Exact token or application number match.',
          observed: 'Candidate matched solely on normalized Name + Date of Birth + Programme. Cannot auto-confirm.',
          sourcesCompared: ['ROSTER', ...activeSources],
          ruleApplied: 'WEAK_CANDIDATE_REVIEW_RULE',
          nextAction: 'Human review required: Side-by-side comparison to confirm identity or dismiss match.'
        }
      });
    } else if (!allActiveMatched && !matchedAny) {
      summary.unmatched++;
      findingsToInsert.push({
        runId,
        institutionId,
        type: 'UNMATCHED',
        severity: 'HIGH',
        recordRef: baseRecordRef,
        sourceRefs,
        fieldDiffs: [],
        matchConfidence: 'WEAK',
        reviewStatus: 'PENDING',
        explanation: {
          expected: 'Candidate to be listed in independent allotment or examination registers.',
          observed: 'Record not found in expected external registers.',
          sourcesCompared: ['ROSTER', ...activeSources],
          ruleApplied: 'INDEPENDENT_REGISTER_PRESENCE_RULE',
          nextAction: 'Verify admission mode (e.g. spot admission, management quota) or request supporting allotment records.'
        }
      });
    } else if (allActiveMatched && activeSources.length >= 2) {
      summary.confirmed3Way++;
      findingsToInsert.push({
        runId,
        institutionId,
        type: 'CONFIRMED_3WAY',
        severity: 'INFO',
        recordRef: baseRecordRef,
        sourceRefs,
        fieldDiffs: [],
        matchConfidence: 'STRONG',
        reviewStatus: 'RESOLVED',
        explanation: {
          expected: 'Record verified across all expected registers.',
          observed: 'Student record found and verified consistently across Roster, Admission, and Examination registers.',
          sourcesCompared: ['ROSTER', ...activeSources],
          ruleApplied: 'THREE_WAY_MATCH_SUCCESS',
          nextAction: 'None. Record confirmed.'
        }
      });
    } else {
      summary.confirmedPartial++;
      findingsToInsert.push({
        runId,
        institutionId,
        type: 'CONFIRMED_PARTIAL',
        severity: 'LOW',
        recordRef: baseRecordRef,
        sourceRefs,
        fieldDiffs: [],
        matchConfidence: 'STRONG',
        reviewStatus: 'RESOLVED',
        explanation: {
          expected: 'Match across available active sources.',
          observed: 'Record confirmed against subset of available registers.',
          sourcesCompared: ['ROSTER', ...activeSources],
          ruleApplied: 'PARTIAL_MATCH_SUCCESS',
          nextAction: 'Informational.'
        }
      });
    }
  }

  // 7. Reverse Check: External records missing from Roster
  for (const src of activeSources) {
    const extRecords = sourceRecordsMap[src] || [];
    for (const ext of extRecords) {
      if (!matchedExternalIds.has(String(ext._id))) {
        summary.missingFromRoster++;
        findingsToInsert.push({
          runId,
          institutionId,
          type: 'MISSING_FROM_ROSTER',
          severity: 'MEDIUM',
          recordRef: {
            applicationNo: maskIdentifier(ext.applicationNo || ext.sourceIdentifier),
            studentNameMasked: maskName(ext.candidateName),
            programmeCode: ext.programmeCode,
            category: ext.category
          },
          sourceRefs: [
            {
              source: src,
              sourceRecordId: String(ext._id),
              identifierMasked: maskIdentifier(ext.applicationNo || ext.sourceIdentifier)
            }
          ],
          fieldDiffs: [],
          matchConfidence: 'STRONG',
          reviewStatus: 'PENDING',
          explanation: {
            expected: 'Candidate in external register to be enrolled and accounted for in institution roster.',
            observed: `Record present in ${src} register was not reported in the committed institution roster.`,
            sourcesCompared: ['ROSTER', src],
            ruleApplied: 'REVERSE_RECONCILIATION_CHECK',
            nextAction: 'Review whether candidate cancelled admission, withdrew, or was omitted from roster in error.'
          }
        });
      }
    }
  }

  // 8. Duplicate Candidate Check
  const duplicates = detectDuplicateCandidates(rosterRows);
  if (duplicates.length > 0) {
    for (const dup of duplicates) {
      summary.duplicateCandidates++;
      findingsToInsert.push({
        runId,
        institutionId,
        type: 'DUPLICATE_CANDIDATE',
        severity: 'HIGH',
        recordRef: {
          rowKey: dup.duplicateRecord.rowKey,
          applicationNo: maskIdentifier(dup.duplicateRecord.applicationNo),
          studentNameMasked: maskName(dup.duplicateRecord.name),
          programmeCode: dup.duplicateRecord.programmeCode
        },
        sourceRefs: [
          {
            source: 'ROSTER',
            sourceRecordId: dup.firstRecord.rowKey,
            identifierMasked: maskIdentifier(dup.firstRecord.applicationNo)
          }
        ],
        fieldDiffs: [],
        matchConfidence: dup.keyType === 'K1_APAAR_TOKEN' ? 'STRONG' : 'WEAK',
        reviewStatus: 'PENDING',
        explanation: {
          expected: 'Unique student enrollments without duplicate entries.',
          observed: `Potential duplicate candidate collision detected on ${dup.keyType} between ${dup.firstRecord.rowKey} and ${dup.duplicateRecord.rowKey}.`,
          sourcesCompared: ['ROSTER'],
          ruleApplied: 'DUPLICATE_CANDIDATE_DETECTION',
          nextAction: 'Human review required: Verify whether records represent duplicate submissions for the same student.'
        }
      });
    }
  }

  // 9. Approved Intake Capacity Reconciliation (Feature 1 Intake Comparison)
  if (sources.includes('INTAKE')) {
    // Group roster counts by programmeCode
    const programmeCounts = {};
    rosterRows.forEach((r) => {
      const code = r.programmeCode;
      programmeCounts[code] = (programmeCounts[code] || 0) + 1;
    });

    for (const [pCode, count] of Object.entries(programmeCounts)) {
      const progDoc = await Programme.findOne({
        institutionId,
        code: pCode
      }).lean();

      if (progDoc && Array.isArray(progDoc.intakeByYear)) {
        const intakeRecord = progDoc.intakeByYear.find(
          (iy) => iy.academicYear === academicYear
        );

        if (intakeRecord && intakeRecord.approvedIntake !== undefined) {
          if (count > intakeRecord.approvedIntake) {
            summary.countMismatches++;
            const excess = count - intakeRecord.approvedIntake;
            findingsToInsert.push({
              runId,
              institutionId,
              type: 'COUNT_MISMATCH',
              severity: 'CRITICAL',
              recordRef: {
                programmeCode: pCode
              },
              sourceRefs: [
                {
                  source: 'INTAKE',
                  attributes: {
                    approvedIntake: intakeRecord.approvedIntake,
                    reportedCount: count,
                    excessSeats: excess,
                    intakeLabel: intakeRecord.label
                  }
                }
              ],
              fieldDiffs: [
                {
                  field: 'intakeCapacity',
                  rosterValue: String(count),
                  sourceValue: String(intakeRecord.approvedIntake),
                  source: 'APPROVED_INTAKE'
                }
              ],
              matchConfidence: 'STRONG',
              reviewStatus: 'PENDING',
              explanation: {
                expected: `Reported enrollment to remain within approved intake of ${intakeRecord.approvedIntake} seats.`,
                observed: `Total roster enrollment of ${count} students exceeds approved intake by ${excess} seat(s).`,
                sourcesCompared: ['ROSTER', 'INTAKE'],
                ruleApplied: 'APPROVED_INTAKE_LIMIT_RULE',
                nextAction: 'Regulatory review: Check for authorized supernumerary, lateral entry, or spot round allotments.'
              }
            });
          }
        }
      }
    }
  }

  // 10. Bulk Insert Findings and Persist Reconciliation Run
  if (findingsToInsert.length > 0) {
    await ReconciliationFinding.insertMany(findingsToInsert);
  }

  const runDoc = await ReconciliationRun.create({
    runId,
    institutionId,
    academicYear,
    rosterVersionId: rosterVersion._id,
    programmeCodes,
    sources,
    sourceModes: {
      ROSTER: 'INSTITUTION_REPORTED',
      ADMISSION: 'SIMULATED',
      EXAM: 'SIMULATED',
      INTAKE: 'SIMULATED'
    },
    ruleVersion: 'recon-rules@1',
    status: 'COMPLETED',
    summary,
    sourceFreshness,
    startedBy: {
      userId: user.id || 'system',
      role: user.role || 'AUTHORITY_OFFICER',
      email: user.email || 'officer@aicte.gov.in'
    },
    idempotencyKey
  });

  return { run: runDoc, isReplay: false };
}

/**
 * Retrieves a reconciliation run by ID or runId
 */
async function getReconciliationRun(id) {
  const run = await ReconciliationRun.findOne({
    $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { runId: id }]
  }).lean();
  return run;
}

/**
 * Lists reconciliation runs for an institution
 */
async function listReconciliationRuns(filter = {}, { page = 1, limit = 25 }) {
  const p = Math.max(1, parseInt(page, 10));
  const l = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (p - 1) * l;

  const total = await ReconciliationRun.countDocuments(filter);
  const items = await ReconciliationRun.find(filter)
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

module.exports = {
  runReconciliation,
  getReconciliationRun,
  listReconciliationRuns
};
