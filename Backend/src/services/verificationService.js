/**
 * Verification Service.
 * Orchestrates verification requests, connector dispatch, manual evidence reviews,
 * local invalidation/supersession, and canonical audit logging.
 */
const mongoose = require('mongoose');
const VerificationRecord = require('../models/verificationRecord.model');
const SeatBalance = require('../models/seatBalance.model');
const Programme = require('../models/programme.model');
const Institution = require('../models/institution.model');
const connectorRegistry = require('./connectors/connectorRegistry');
const { resolveEffectiveLabel } = require('./labelResolverService');
const { logAuditEvent } = require('./auditService');

/**
 * Requests an authority or register verification for a specific subject and field.
 */
async function requestVerification({
  subjectType,
  subjectId,
  fieldPath = 'approvedIntake',
  connectorId = 'mock-authority-intake',
  institutionId,
  value,
  context = {},
  user = {},
  idempotencyKey = null
}) {
  // 1. Idempotency replay check
  if (idempotencyKey) {
    const existing = await VerificationRecord.findOne({ idempotencyKey }).lean();
    if (existing) {
      const resolved = await resolveEffectiveLabel({
        subjectType,
        subjectId,
        fieldPath,
        currentValue: value
      });
      return { verificationRecord: existing, effectiveLabel: resolved, isReplay: true };
    }
  }

  // 2. Validate institution exists
  if (!institutionId) {
    const err = new Error('institutionId is required for verification.');
    err.statusCode = 400;
    throw err;
  }
  const inst = await Institution.findById(institutionId).lean();
  if (!inst) {
    const err = new Error(`Institution ${institutionId} not found.`);
    err.statusCode = 404;
    throw err;
  }

  // 3. Execute connector verification safely
  const connectorResult = await connectorRegistry.executeVerification({
    connectorId,
    subjectType,
    subjectId,
    fieldPath,
    value,
    institutionId,
    context
  });

  // 4. Supersede older pending or superseded records for the exact same field if requested
  const prevRecord = await VerificationRecord.findOne({
    subjectType,
    subjectId,
    fieldPath,
    status: { $in: ['PENDING', 'COMPLETED', 'UNABLE_TO_VERIFY'] }
  }).sort({ createdAt: -1 });

  // 5. Create new VerificationRecord
  const record = await VerificationRecord.create({
    subjectType,
    subjectId,
    fieldPath,
    institutionId,
    valueSnapshot: value,
    label: connectorResult.label,
    sourceMode: connectorResult.sourceMode,
    method: connectorResult.method || 'CONNECTOR_API',
    status:
      connectorResult.status === 'COMPLETED'
        ? 'COMPLETED'
        : connectorResult.status === 'CONFLICT'
        ? 'CONFLICT'
        : connectorResult.status === 'UNABLE_TO_VERIFY'
        ? 'UNABLE_TO_VERIFY'
        : 'PENDING',
    sourceRef: connectorResult.sourceRef,
    connectorId: connectorResult.connectorId,
    ruleOrSourceVersion: connectorResult.ruleOrSourceVersion || 'v1.0',
    evidenceRef: connectorResult.evidenceRef || null,
    notes: connectorResult.notes || null,
    verifiedAt: connectorResult.status === 'COMPLETED' ? new Date() : null,
    supersedesVerificationId: prevRecord ? prevRecord._id : null,
    history: [
      {
        action: 'VERIFICATION_REQUESTED',
        by: user.id || 'system',
        role: user.role || 'INSTITUTION_USER',
        at: new Date(),
        notes: connectorResult.notes
      }
    ],
    createdBy: {
      userId: user.id || null,
      role: user.role || null,
      email: user.email || null
    },
    ...(idempotencyKey ? { idempotencyKey } : {})
  });

  // 6. Log Canonical Audit Event
  await logAuditEvent({
    action: 'VERIFICATION_REQUESTED',
    entityType: 'VerificationRecord',
    entityId: record._id,
    institutionId,
    performedBy: user,
    details: {
      subjectType,
      subjectId,
      fieldPath,
      connectorId,
      label: record.label,
      sourceMode: record.sourceMode,
      status: record.status,
      isSimulated: connectorResult.isSimulated
    }
  });

  // 7. Synchronize effective label on SeatBalance if applicable
  if (subjectType === 'PROGRAMME_INTAKE' || subjectType === 'SEAT_BALANCE') {
    await syncSeatBalanceVerification(institutionId, subjectId, value, record.label, record.sourceMode);
  }

  // 8. Resolve final effective label
  const resolved = await resolveEffectiveLabel({
    subjectType,
    subjectId,
    fieldPath,
    currentValue: value
  });

  return {
    verificationRecord: record,
    effectiveLabel: resolved,
    isReplay: false
  };
}

/**
 * Reviews a verification record by an authorized authority officer.
 * Strict RBAC: AUTHORITY_ADMIN, AUTHORITY_OFFICER, PLATFORM_ADMIN only.
 */
async function reviewVerification(
  verificationId,
  { action, notes, evidenceRef, sourceMode = 'SIMULATED', method: requestedMethod },
  user = {}
) {
  // 1. RBAC authorization check
  const allowedRoles = ['AUTHORITY_ADMIN', 'AUTHORITY_OFFICER', 'PLATFORM_ADMIN'];
  if (!user || !allowedRoles.includes(user.role)) {
    const err = new Error('Forbidden: Only authorized authority officers can review verification evidence.');
    err.statusCode = 403;
    err.code = 'FORBIDDEN_REVIEWER';
    throw err;
  }

  // 2. Fetch record
  const record = await VerificationRecord.findById(verificationId);
  if (!record) {
    const err = new Error(`Verification record ${verificationId} not found.`);
    err.statusCode = 404;
    throw err;
  }

  // 3. Process review action
  const previousLabel = record.label;
  const previousStatus = record.status;
  let newLabel = record.label;
  let newStatus = 'COMPLETED';
  let method = requestedMethod || record.method;

  if (action === 'CONFIRM') {
    newStatus = 'COMPLETED';
    if (method === 'MANUAL_OFFICER') {
      // Eligible authorised manual officer review backed by recorded evidence
      const isLiveEvidence = sourceMode === 'LIVE' && !!evidenceRef;
      newLabel = isLiveEvidence ? 'AUTHORITY_VERIFIED' : 'AUTHORITY_VERIFIED_SIMULATED';
    } else if (evidenceRef) {
      newLabel = 'DOCUMENT_SUPPORTED';
      method = 'DOCUMENT_REVIEW';
    } else {
      // Manual officer verification without document reference
      newLabel = user.role === 'AUTHORITY_ADMIN' && sourceMode === 'LIVE'
        ? 'AUTHORITY_VERIFIED'
        : 'AUTHORITY_VERIFIED_SIMULATED';
      method = 'MANUAL_OFFICER';
    }
    record.verifiedAt = new Date();

    // Officer review confirms evidence, resolving and superseding prior conflicting or pending records
    await VerificationRecord.updateMany(
      {
        _id: { $ne: record._id },
        subjectType: record.subjectType,
        subjectId: record.subjectId,
        fieldPath: record.fieldPath,
        status: { $in: ['CONFLICT', 'PENDING'] }
      },
      {
        $set: { status: 'SUPERSEDED' },
        $push: {
          history: {
            action: 'SUPERSEDED_BY_OFFICER_REVIEW',
            by: user.id || 'authority',
            role: user.role,
            at: new Date(),
            notes: `Resolved and superseded by officer review (${record._id})`
          }
        }
      }
    );
  } else if (action === 'REJECT') {
    newStatus = 'UNABLE_TO_VERIFY';
    newLabel = 'UNABLE_TO_VERIFY';
  } else if (action === 'CONFLICT') {
    newStatus = 'CONFLICT';
    newLabel = 'VERIFICATION_PENDING';
  } else {
    const err = new Error(`Invalid review action '${action}'. Allowed: CONFIRM, REJECT, CONFLICT.`);
    err.statusCode = 400;
    throw err;
  }

  record.label = newLabel;
  record.status = newStatus;
  record.method = method;
  record.evidenceRef = evidenceRef || record.evidenceRef;
  record.notes = notes || record.notes;
  record.reviewer = {
    userId: user.id || 'authority',
    role: user.role,
    email: user.email || 'officer@authority.gov.in'
  };

  record.history.push({
    action: `REVIEW_${action}`,
    by: user.id || 'authority',
    role: user.role,
    at: new Date(),
    notes: notes || `Verification reviewed with decision: ${action}`
  });

  await record.save();

  // 4. Log Canonical Audit Event
  await logAuditEvent({
    action: 'VERIFICATION_REVIEWED',
    entityType: 'VerificationRecord',
    entityId: record._id,
    institutionId: record.institutionId,
    performedBy: user,
    details: {
      action,
      previousLabel,
      newLabel,
      previousStatus,
      newStatus,
      evidenceRef,
      method
    }
  });

  // 5. Re-synchronize SeatBalance if applicable
  if (record.subjectType === 'PROGRAMME_INTAKE' || record.subjectType === 'SEAT_BALANCE') {
    await syncSeatBalanceVerification(
      record.institutionId,
      record.subjectId,
      record.valueSnapshot,
      newLabel,
      record.sourceMode
    );
  }

  const resolved = await resolveEffectiveLabel({
    subjectType: record.subjectType,
    subjectId: record.subjectId,
    fieldPath: record.fieldPath,
    currentValue: record.valueSnapshot
  });

  return {
    verificationRecord: record,
    effectiveLabel: resolved
  };
}

/**
 * Invalidates (supersedes) active verifications when the underlying value changes.
 */
async function invalidateVerification({
  subjectType,
  subjectId,
  fieldPath = 'approvedIntake',
  newValue,
  reason = 'Underlying value modified; prior verification superseded.',
  user = {}
}) {
  const activeRecords = await VerificationRecord.find({
    subjectType,
    subjectId,
    fieldPath,
    status: { $in: ['COMPLETED', 'PENDING', 'CONFLICT', 'UNABLE_TO_VERIFY'] }
  });

  if (activeRecords.length === 0) return 0;

  for (const record of activeRecords) {
    record.status = 'SUPERSEDED';
    record.history.push({
      action: 'SUPERSEDED_BY_VALUE_CHANGE',
      by: user.id || 'system',
      role: user.role || 'SYSTEM',
      at: new Date(),
      notes: `${reason} New value: ${newValue}`
    });
    await record.save();
  }

  await logAuditEvent({
    action: 'VERIFICATIONS_SUPERSEDED',
    entityType: 'VerificationRecord',
    entityId: subjectId,
    institutionId: activeRecords[0].institutionId,
    performedBy: user,
    details: {
      subjectType,
      subjectId,
      fieldPath,
      supersededCount: activeRecords.length,
      newValue,
      reason
    }
  });

  return activeRecords.length;
}

/**
 * Synchronizes SeatBalance intake verification status based on resolved verification.
 */
async function syncSeatBalanceVerification(institutionId, subjectId, value, label, sourceMode) {
  try {
    const bucket = await SeatBalance.findOne({
      $or: [{ bucketKey: subjectId }, { institutionId, programmeCode: subjectId.toUpperCase() }]
    });

    if (bucket) {
      bucket.intakeVerificationStatus = label;
      bucket.intakeSourceMode = sourceMode;
      bucket.isSimulated = sourceMode === 'SIMULATED' || label.includes('SIMULATED');
      await bucket.save();
    }
  } catch (err) {
    console.error('Error synchronizing SeatBalance verification status:', err.message);
  }
}

/**
 * Lists verification records with institution scoping and bounded pagination.
 */
async function listVerifications(filters = {}, { page = 1, limit = 50 } = {}, user = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (p - 1) * l;

  const query = {};

  // Strict institution scoping for institution roles
  if (['INSTITUTION_ADMIN', 'INSTITUTION_USER'].includes(user.role)) {
    if (!user.institutionId) {
      const err = new Error('Institution scope required for institution user.');
      err.statusCode = 403;
      throw err;
    }
    query.institutionId = user.institutionId;
  } else if (filters.institutionId) {
    query.institutionId = filters.institutionId;
  }

  if (filters.subjectType) query.subjectType = filters.subjectType;
  if (filters.subjectId) query.subjectId = filters.subjectId;
  if (filters.fieldPath) query.fieldPath = filters.fieldPath;
  if (filters.label) query.label = filters.label;
  if (filters.sourceMode) query.sourceMode = filters.sourceMode;
  if (filters.status) query.status = filters.status;

  const [total, items] = await Promise.all([
    VerificationRecord.countDocuments(query),
    VerificationRecord.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean()
  ]);

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

/**
 * Gets effective assurance label and complete history for a specific subject.
 */
async function getSubjectVerifications({
  subjectType,
  subjectId,
  fieldPath = 'approvedIntake',
  currentValue = null,
  requiredSourceVersion = null,
  user = {}
}) {
  const query = { subjectType, subjectId, fieldPath };

  // Enforce institution scoping
  if (['INSTITUTION_ADMIN', 'INSTITUTION_USER'].includes(user.role)) {
    if (user.institutionId) {
      query.institutionId = user.institutionId;
    }
  }

  const history = await VerificationRecord.find(query).sort({ createdAt: -1 }).lean();

  const effective = await resolveEffectiveLabel({
    subjectType,
    subjectId,
    fieldPath,
    currentValue,
    requiredSourceVersion,
    records: history
  });

  return {
    subjectType,
    subjectId,
    fieldPath,
    currentValue,
    effective,
    history
  };
}

module.exports = {
  requestVerification,
  reviewVerification,
  invalidateVerification,
  listVerifications,
  getSubjectVerifications
};
