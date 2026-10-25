/**
 * Overlap Service.
 * Detects cross-institution enrolment intervals for the same student token.
 * Flags observations with strictly neutral, non-punitive explanations.
 * Preserves append-only review decisions and authority-only resolutions.
 */
const crypto = require('crypto');
const OverlapCase = require('../models/overlapCase.model');
const StudentLifecycleEvent = require('../models/lifecycleEvent.model');
const Institution = require('../models/institution.model');
const { deriveStudentToken } = require('../utils/cryptoToken');
const auditService = require('./auditService');
const scorecardService = require('./scorecardService');

const {
  OVERLAP_STATUSES,
  RESOLUTION_CODES,
  DEFAULT_NEUTRAL_EXPLANATION
} = OverlapCase;

/**
 * Calculates enrolment intervals per institution for a student token
 * using valid (non-superseded) lifecycle events.
 */
async function buildInstitutionEnrolmentIntervals(studentTokenId, keyVersion = 'v1') {
  const events = await StudentLifecycleEvent.find({
    studentTokenId,
    keyVersion,
    status: 'VALID'
  })
    .sort({ effectiveDate: 1, reportedAt: 1 })
    .lean();

  if (events.length === 0) return [];

  // Group events by institution
  const instMap = new Map();
  for (const ev of events) {
    const instIdStr = String(ev.institutionId);
    if (!instMap.has(instIdStr)) {
      instMap.set(instIdStr, []);
    }
    instMap.get(instIdStr).push(ev);
  }

  const intervals = [];

  for (const [instIdStr, instEvents] of instMap.entries()) {
    // Sort chronologically
    instEvents.sort((a, b) => new Date(a.effectiveDate) - new Date(b.effectiveDate));

    let currentInterval = null;

    for (const ev of instEvents) {
      if (['ADMITTED', 'ENROLLED', 'TRANSFER_IN_CONFIRMED'].includes(ev.type)) {
        if (!currentInterval) {
          currentInterval = {
            institutionId: ev.institutionId,
            programmeCode: ev.programmeCode || null,
            academicYear: ev.academicYear || null,
            startDate: new Date(ev.effectiveDate),
            endDate: null
          };
        }
      } else if (['WITHDRAWN', 'COMPLETED', 'TRANSFER_OUT_CONFIRMED'].includes(ev.type)) {
        if (currentInterval) {
          currentInterval.endDate = new Date(ev.effectiveDate);
          intervals.push(currentInterval);
          currentInterval = null;
        }
      }
    }

    if (currentInterval) {
      intervals.push(currentInterval);
    }
  }

  return intervals;
}

/**
 * Detects overlapping active enrolment intervals for a student across institutions.
 * @param {string} studentTokenId
 * @param {string} keyVersion
 * @returns {Promise<Array<Object>>} Created or updated OverlapCases
 */
async function detectOverlaps(studentTokenId, keyVersion = 'v1') {
  if (!studentTokenId) return [];

  const intervals = await buildInstitutionEnrolmentIntervals(studentTokenId, keyVersion);

  // Overlap requires at least 2 intervals at DIFFERENT institutions
  if (intervals.length < 2) {
    return [];
  }

  const detectedCases = [];

  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const intA = intervals[i];
      const intB = intervals[j];

      // Must be different institutions
      if (String(intA.institutionId) === String(intB.institutionId)) {
        continue;
      }

      // Check temporal overlap:
      // Interval A: [StartA, EndA], Interval B: [StartB, EndB]
      const startOverlap = intA.startDate > intB.startDate ? intA.startDate : intB.startDate;
      
      let endOverlap = null;
      if (intA.endDate && intB.endDate) {
        endOverlap = intA.endDate < intB.endDate ? intA.endDate : intB.endDate;
      } else if (intA.endDate) {
        endOverlap = intA.endDate;
      } else if (intB.endDate) {
        endOverlap = intB.endDate;
      }

      // If endOverlap is specified, check if startOverlap < endOverlap
      const hasOverlap = !endOverlap || startOverlap < endOverlap;

      if (hasOverlap) {
        let overlapDays = 0;
        if (endOverlap) {
          overlapDays = Math.max(1, Math.round((endOverlap - startOverlap) / (1000 * 60 * 60 * 24)));
        } else {
          overlapDays = Math.max(1, Math.round((Date.now() - startOverlap.getTime()) / (1000 * 60 * 60 * 24)));
        }

        // Generate deterministic caseId for this token and pair of institutions
        const sortedInstIds = [String(intA.institutionId), String(intB.institutionId)].sort();
        const hashSeed = `${studentTokenId}:${keyVersion}:${sortedInstIds[0]}:${sortedInstIds[1]}`;
        const caseHash = crypto.createHash('sha256').update(hashSeed).digest('hex').substring(0, 12);
        const caseId = `OVR-${caseHash.toUpperCase()}`;

        // Derive opaque studentRef
        const derived = deriveStudentToken(studentTokenId, keyVersion);
        const studentRef = derived.studentRef;

        // Check if an existing open or in_review case exists to prevent unlimited duplicates
        let overlapCase = await OverlapCase.findOne({ caseId });

        const institutionsPayload = [
          {
            institutionId: intA.institutionId,
            programmeCode: intA.programmeCode,
            academicYear: intA.academicYear,
            enrollmentInterval: {
              startDate: intA.startDate,
              endDate: intA.endDate
            }
          },
          {
            institutionId: intB.institutionId,
            programmeCode: intB.programmeCode,
            academicYear: intB.academicYear,
            enrollmentInterval: {
              startDate: intB.startDate,
              endDate: intB.endDate
            }
          }
        ];

        if (overlapCase) {
          // If already resolved, do not un-resolve unless intervals significantly changed
          if (overlapCase.status !== 'RESOLVED') {
            overlapCase.institutions = institutionsPayload;
            overlapCase.overlapInterval = {
              startDate: startOverlap,
              endDate: endOverlap,
              overlapDays
            };
            await overlapCase.save();
          }
        } else {
          // Create new overlap observation
          overlapCase = await OverlapCase.create({
            caseId,
            studentTokenId,
            keyVersion,
            studentRef,
            institutions: institutionsPayload,
            overlapInterval: {
              startDate: startOverlap,
              endDate: endOverlap,
              overlapDays
            },
            caseType: 'OVERLAP',
            status: 'OPEN',
            severity: 'INFO',
            policySourceRef: 'AICTE_ACADEMIC_HANDBOOK_CONCURRENT_ENROLMENT',
            policyVerified: false,
            explanation: DEFAULT_NEUTRAL_EXPLANATION,
            resolutionHistory: []
          });

          // Log audit observation
          try {
            await auditService.logAuditEvent({
              action: 'OVERLAP_OBSERVED',
              entityType: 'OverlapCase',
              entityId: overlapCase._id,
              institutionId: intA.institutionId,
              performedBy: {
                userId: 'SYSTEM',
                role: 'SYSTEM',
                email: 'system@platform.local'
              },
              details: {
                caseId,
                severity: 'INFO',
                policyVerified: false,
                explanation: DEFAULT_NEUTRAL_EXPLANATION
              }
            });
          } catch (_) {}
        }

        detectedCases.push(overlapCase);
      }
    }
  }

  return detectedCases;
}

/**
 * Lists overlap cases with institution-scoping and pagination.
 */
async function listOverlapCases(filters = {}, pagination = {}, user = null) {
  const query = {};

  // Role scoping: Institution users only see cases involving their institution
  const isInstitutionUser = user && user.role && user.role.startsWith('INSTITUTION_');
  if (isInstitutionUser) {
    if (!user.institutionId) {
      const error = new Error('Institution context is missing from user token.');
      error.statusCode = 403;
      throw error;
    }
    query['institutions.institutionId'] = user.institutionId;
  } else if (filters.institutionId) {
    // Authority user filtering by institution
    query['institutions.institutionId'] = filters.institutionId;
  }

  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.severity) {
    query.severity = filters.severity;
  }
  if (filters.caseType) {
    query.caseType = filters.caseType;
  }

  const p = Math.max(1, parseInt(pagination.page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 20));
  const skip = (p - 1) * l;

  const [total, cases] = await Promise.all([
    OverlapCase.countDocuments(query),
    OverlapCase.find(query)
      .populate('institutions.institutionId', 'name code type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean()
  ]);

  // Mask studentTokenId for ordinary institution users
  const sanitizedCases = cases.map((c) => {
    const item = { ...c };
    if (isInstitutionUser) {
      delete item.studentTokenId;
    }
    return item;
  });

  return {
    cases: sanitizedCases,
    pagination: {
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l)
    }
  };
}

/**
 * Retrieves a single overlap case by ID or caseId.
 */
async function getOverlapCaseById(idOrCaseId, user = null) {
  const query =
    typeof idOrCaseId === 'string' && idOrCaseId.startsWith('OVR-')
      ? { caseId: idOrCaseId }
      : { _id: idOrCaseId };

  const overlapCase = await OverlapCase.findOne(query)
    .populate('institutions.institutionId', 'name code type')
    .lean();

  if (!overlapCase) {
    const error = new Error(`Overlap case ${idOrCaseId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  // Scoping check for institution users
  const isInstitutionUser = user && user.role && user.role.startsWith('INSTITUTION_');
  if (isInstitutionUser) {
    const userInstStr = String(user.institutionId);
    const hasAccess = overlapCase.institutions.some((inst) => {
      const instId = inst.institutionId._id ? String(inst.institutionId._id) : String(inst.institutionId);
      return instId === userInstStr;
    });

    if (!hasAccess) {
      const error = new Error('Cross-institution overlap case access is strictly prohibited.');
      error.statusCode = 403;
      throw error;
    }

    delete overlapCase.studentTokenId;
  }

  return overlapCase;
}

/**
 * Resolves an overlap case with append-only resolution history.
 * Authority-only action (AICTE_ADMIN, STATE_OFFICER, SYSTEM_ADMIN).
 */
async function resolveOverlapCase(idOrCaseId, payload, user) {
  const { code, notes } = payload;

  if (!code || !RESOLUTION_CODES.includes(code)) {
    const error = new Error(
      `Invalid resolution code: ${code}. Permitted codes: ${RESOLUTION_CODES.join(', ')}`
    );
    error.statusCode = 422;
    error.code = 'INVALID_RESOLUTION_CODE';
    throw error;
  }

  if (!notes || typeof notes !== 'string' || notes.trim().length < 5) {
    const error = new Error('A detailed reviewer note (at least 5 characters) is required to resolve an overlap case.');
    error.statusCode = 400;
    error.code = 'MISSING_REVIEW_NOTE';
    throw error;
  }

  // Authority-only role enforcement
  const allowedRoles = [
    'AUTHORITY_ADMIN',
    'AUTHORITY_OFFICER',
    'PLATFORM_ADMIN',
    'AICTE_ADMIN',
    'STATE_OFFICER',
    'SYSTEM_ADMIN'
  ];
  if (!user || !user.role || !allowedRoles.includes(user.role)) {
    const error = new Error('Only designated authority officers may resolve overlap review cases.');
    error.statusCode = 403;
    error.code = 'FORBIDDEN_REVIEW_RESOLUTION';
    throw error;
  }

  const query =
    typeof idOrCaseId === 'string' && idOrCaseId.startsWith('OVR-')
      ? { caseId: idOrCaseId }
      : { _id: idOrCaseId };
  const overlapCase = await OverlapCase.findOne(query);

  if (!overlapCase) {
    const error = new Error(`Overlap case ${idOrCaseId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  // Append to resolution history
  overlapCase.resolutionHistory.push({
    code,
    notes: notes.trim(),
    by: user.email || user.userId || 'AUTHORITY',
    role: user.role,
    at: new Date()
  });

  // Update current resolution
  overlapCase.status = 'RESOLVED';
  overlapCase.resolution = {
    code,
    notes: notes.trim(),
    resolvedBy: {
      userId: user.userId ? String(user.userId) : String(user._id || 'UNKNOWN'),
      role: user.role,
      email: user.email || null
    },
    resolvedAt: new Date()
  };

  await overlapCase.save();

  // Audit event
  try {
    await auditService.logAuditEvent({
      action: 'OVERLAP_RESOLVED',
      entityType: 'OverlapCase',
      entityId: overlapCase._id,
      institutionId: overlapCase.institutions[0]?.institutionId || null,
      performedBy: {
        userId: user.userId || String(user._id),
        role: user.role,
        email: user.email
      },
      details: {
        caseId: overlapCase.caseId,
        code,
        notes: notes.trim()
      }
    });
  } catch (_) {}

  // Mark scorecard snapshots stale for affected institutions
  for (const inst of overlapCase.institutions) {
    if (inst.academicYear) {
      try {
        await scorecardService.markSnapshotsStale(
          inst.institutionId,
          inst.academicYear,
          'OVERLAP_RESOLUTION'
        );
      } catch (_) {}
    }
  }

  return overlapCase;
}

module.exports = {
  detectOverlaps,
  buildInstitutionEnrolmentIntervals,
  listOverlapCases,
  getOverlapCaseById,
  resolveOverlapCase,
  RESOLUTION_CODES,
  DEFAULT_NEUTRAL_EXPLANATION
};
