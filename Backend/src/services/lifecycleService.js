/**
 * Student Lifecycle Service.
 * Manages append-only lifecycle event recording, transition validation,
 * derived student states, and non-destructive corrections.
 */
const mongoose = require('mongoose');
const StudentLifecycleEvent = require('../models/lifecycleEvent.model');
const Institution = require('../models/institution.model');
const { deriveStudentToken } = require('../utils/cryptoToken');

// Permitted transition state machine
const ALLOWED_TRANSITIONS = {
  ADMITTED: ['ENROLLED', 'WITHDRAWN'],
  ENROLLED: ['TRANSFER_PENDING', 'WITHDRAWN', 'COMPLETED'],
  TRANSFER_PENDING: ['TRANSFER_CONFIRMED', 'TRANSFER_REJECTED', 'NEEDS_REVIEW', 'ENROLLED'],
  TRANSFER_CONFIRMED: ['ENROLLED'],
  TRANSFER_REJECTED: ['ENROLLED'],
  WITHDRAWN: [],
  COMPLETED: [],
  NEEDS_REVIEW: ['TRANSFER_CONFIRMED', 'TRANSFER_REJECTED', 'ENROLLED']
};

/**
 * Derives current lifecycle state from a sequence of non-superseded events.
 * @param {Array<Object>} events - Array of valid lifecycle events sorted by effectiveDate ascending
 * @returns {string} Derived state
 */
function deriveCurrentState(events = []) {
  if (!events || !Array.isArray(events)) return 'UNKNOWN';
  const validEvents = events.filter((e) => e && e.status === 'VALID');
  if (validEvents.length === 0) return 'UNKNOWN';

  const lastEvent = validEvents[validEvents.length - 1];

  switch (lastEvent.type) {
    case 'ADMITTED':
      return 'ADMITTED';
    case 'ENROLLED':
      return 'ENROLLED';
    case 'TRANSFER_OUT_REQUESTED':
    case 'TRANSFER_IN_REQUESTED':
      return 'TRANSFER_PENDING';
    case 'TRANSFER_OUT_CONFIRMED':
    case 'TRANSFER_IN_CONFIRMED':
      return 'TRANSFER_CONFIRMED';
    case 'WITHDRAWN':
      return 'WITHDRAWN';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CORRECTED': {
      // Look back to determine the corrected state
      if (validEvents.length > 1) {
        return deriveCurrentState(validEvents.slice(0, -1));
      }
      return 'ENROLLED';
    }
    default:
      return 'ENROLLED';
  }
}

/**
 * Validates whether an incoming event type is legal given current state.
 * Throws HTTP 422 INVALID_LIFECYCLE_TRANSITION if invalid.
 */
function validateTransition(currentState, targetEventType) {
  let targetState = targetEventType;
  if (
    [
      'ADMITTED',
      'ENROLLED',
      'TRANSFER_PENDING',
      'TRANSFER_CONFIRMED',
      'TRANSFER_REJECTED',
      'NEEDS_REVIEW',
      'WITHDRAWN',
      'COMPLETED'
    ].includes(targetEventType)
  ) {
    targetState = targetEventType;
  } else if (targetEventType.includes('REQUESTED')) {
    targetState = 'TRANSFER_PENDING';
  } else if (targetEventType.includes('CONFIRMED')) {
    targetState = 'TRANSFER_CONFIRMED';
  } else if (targetEventType === 'CORRECTED') {
    targetState = currentState;
  }

  // Initial event can be ADMITTED or TRANSFER_IN_CONFIRMED or ENROLLED
  if (currentState === 'UNKNOWN') {
    if (['ADMITTED', 'TRANSFER_IN_CONFIRMED', 'ENROLLED'].includes(targetEventType)) {
      return { isValid: true };
    }
    const error = new Error(
      `Initial lifecycle event for student cannot be '${targetEventType}'. Expected ADMITTED or ENROLLED.`
    );
    error.statusCode = 422;
    error.code = 'INVALID_LIFECYCLE_TRANSITION';
    error.currentState = currentState;
    error.attemptedTransition = targetEventType;
    throw error;
  }

  const allowedTargets = ALLOWED_TRANSITIONS[currentState] || [];
  if (!allowedTargets.includes(targetState)) {
    const error = new Error(
      `Illegal state transition from '${currentState}' to '${targetState}' via event '${targetEventType}'.`
    );
    error.statusCode = 422;
    error.code = 'INVALID_LIFECYCLE_TRANSITION';
    error.currentState = currentState;
    error.attemptedTransition = targetEventType;
    throw error;
  }

  return { isValid: true };
}

/**
 * Records a new lifecycle event.
 */
async function recordLifecycleEvent(data, user) {
  const {
    rawApaar,
    studentTokenId,
    keyVersion = 'v1',
    institutionId,
    type,
    effectiveDate,
    sourceRef = null,
    reason = null,
    programmeCode = null,
    academicYear = null,
    seatCategory = 'GENERAL',
    notes = null,
    idempotencyKey = null
  } = data;

  if (!institutionId || !mongoose.Types.ObjectId.isValid(institutionId)) {
    const error = new Error('Valid institutionId is required.');
    error.statusCode = 400;
    throw error;
  }

  // Idempotency check
  if (idempotencyKey) {
    const existing = await StudentLifecycleEvent.findOne({ idempotencyKey });
    if (existing) {
      return { event: existing, isReplay: true };
    }
  }

  // Resolve student token reference
  let token = studentTokenId;
  let ver = keyVersion;
  if (!token && rawApaar) {
    const derived = deriveStudentToken(rawApaar, keyVersion, institutionId);
    if (derived.status === 'MISSING_IDENTIFIER') {
      const error = new Error('Missing student identifier; cannot derive privacy token.');
      error.statusCode = 400;
      throw error;
    }
    token = derived.token;
    ver = derived.keyVersion;
  }

  if (!token) {
    const error = new Error('Student identifier (rawApaar or studentTokenId) is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!effectiveDate) {
    const error = new Error('effectiveDate is required.');
    error.statusCode = 400;
    throw error;
  }

  const parsedEffective = new Date(effectiveDate);
  if (isNaN(parsedEffective.getTime())) {
    const error = new Error('Invalid effectiveDate format.');
    error.statusCode = 400;
    throw error;
  }

  // Validate chronology: cannot be more than 60 days into future
  const maxFuture = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  if (parsedEffective > maxFuture) {
    const error = new Error('effectiveDate cannot be more than 60 days in the future.');
    error.statusCode = 422;
    error.code = 'INVALID_LIFECYCLE_TRANSITION';
    throw error;
  }

  // Find existing valid events for this student at this institution
  const existingEvents = await StudentLifecycleEvent.find({
    studentTokenId: token,
    institutionId,
    status: 'VALID'
  }).sort({ effectiveDate: 1, reportedAt: 1 });

  const currentState = deriveCurrentState(existingEvents);
  const transitionCheck = validateTransition(currentState, type);

  if (!transitionCheck.isValid) {
    const error = new Error(transitionCheck.reason);
    error.statusCode = 422;
    error.code = 'INVALID_LIFECYCLE_TRANSITION';
    throw error;
  }

  // Insert event
  const event = await StudentLifecycleEvent.create({
    studentTokenId: token,
    keyVersion: ver,
    institutionId,
    type,
    effectiveDate: parsedEffective,
    reportedAt: new Date(),
    sourceRef,
    status: 'VALID',
    reason,
    programmeCode,
    academicYear,
    seatCategory,
    notes,
    actor: {
      userId: user ? user.id : 'system',
      role: user ? user.role : 'INSTITUTION_ADMIN',
      email: user ? user.email : null
    },
    ...(idempotencyKey ? { idempotencyKey } : {})
  });

  // Mark Scorecard snapshots stale for this institution
  if (academicYear) {
    try {
      const scorecardService = require('./scorecardService');
      scorecardService
        .markSnapshotsStale(institutionId, academicYear, 'LIFECYCLE_EVENT_RECORDED')
        .catch(() => {});
    } catch (_) {}
  }

  // Trigger overlap check
  try {
    const overlapService = require('./overlapService');
    await overlapService.detectOverlaps(token, ver);
  } catch (_) {}

  return { event, isReplay: false };
}

/**
 * Records an append-only correction superseding a prior event.
 */
async function recordCorrectionEvent(supersedesEventId, data, user) {
  if (!supersedesEventId || !mongoose.Types.ObjectId.isValid(supersedesEventId)) {
    const error = new Error('Valid supersedesEventId is required for corrections.');
    error.statusCode = 400;
    throw error;
  }

  const priorEvent = await StudentLifecycleEvent.findById(supersedesEventId);
  if (!priorEvent) {
    const error = new Error(`Lifecycle event ${supersedesEventId} not found.`);
    error.statusCode = 404;
    throw error;
  }

  if (priorEvent.status === 'SUPERSEDED') {
    const error = new Error('Cannot correct an already superseded event.');
    error.statusCode = 422;
    error.code = 'INVALID_LIFECYCLE_TRANSITION';
    throw error;
  }

  // Prevent self-supersession / cyclic correction
  if (data.eventId && String(data.eventId) === String(supersedesEventId)) {
    const error = new Error('Self-referential correction is not permitted.');
    error.statusCode = 422;
    error.code = 'INVALID_LIFECYCLE_TRANSITION';
    throw error;
  }

  // Verify institution scope
  if (
    user &&
    user.role &&
    user.role.startsWith('INSTITUTION_') &&
    user.institutionId &&
    String(priorEvent.institutionId) !== String(user.institutionId)
  ) {
    const error = new Error('Cross-institution correction is strictly prohibited.');
    error.statusCode = 403;
    throw error;
  }

  // Mark prior event as SUPERSEDED (history preserved)
  priorEvent.status = 'SUPERSEDED';
  await priorEvent.save();

  // Create new CORRECTED event
  const correctedEffective = data.effectiveDate ? new Date(data.effectiveDate) : priorEvent.effectiveDate;
  const newEvent = await StudentLifecycleEvent.create({
    studentTokenId: priorEvent.studentTokenId,
    keyVersion: priorEvent.keyVersion,
    institutionId: priorEvent.institutionId,
    type: 'CORRECTED',
    effectiveDate: correctedEffective,
    reportedAt: new Date(),
    sourceRef: data.sourceRef || priorEvent.sourceRef,
    status: 'VALID',
    supersedesEventId: priorEvent._id,
    reason: data.reason || 'Data entry correction',
    programmeCode: data.programmeCode || priorEvent.programmeCode,
    academicYear: data.academicYear || priorEvent.academicYear,
    seatCategory: data.seatCategory || priorEvent.seatCategory,
    notes: data.notes || null,
    actor: {
      userId: user ? user.id : 'system',
      role: user ? user.role : 'INSTITUTION_ADMIN',
      email: user ? user.email : null
    }
  });

  // Mark scorecard snapshots stale
  if (newEvent.academicYear) {
    try {
      const scorecardService = require('./scorecardService');
      scorecardService
        .markSnapshotsStale(newEvent.institutionId, newEvent.academicYear, 'LIFECYCLE_CORRECTION')
        .catch(() => {});
    } catch (_) {}
  }

  // Re-evaluate overlaps
  try {
    const overlapService = require('./overlapService');
    await overlapService.detectOverlaps(newEvent.studentTokenId, newEvent.keyVersion);
  } catch (_) {}

  return newEvent;
}

/**
 * Retrieves a student's lifecycle timeline.
 */
async function getStudentTimeline(tokenId, institutionScope = null, user = null) {
  const query = { studentTokenId: tokenId };
  if (institutionScope) {
    query.institutionId = institutionScope;
  }

  const events = await StudentLifecycleEvent.find(query)
    .sort({ effectiveDate: 1, reportedAt: 1 })
    .lean();

  const validEvents = events.filter((e) => e.status === 'VALID');
  const currentState = deriveCurrentState(validEvents);

  // Derive opaque studentRef
  const derived = deriveStudentToken(tokenId, 'v1', institutionScope);
  const studentRef = derived.studentRef;

  // Mask token for ordinary institution callers
  const isInstitutionUser = user && user.role && user.role.startsWith('INSTITUTION_');

  const sanitizedEvents = events.map((e) => ({
    _id: e._id,
    type: e.type,
    effectiveDate: e.effectiveDate,
    reportedAt: e.reportedAt,
    status: e.status,
    supersedesEventId: e.supersedesEventId,
    programmeCode: e.programmeCode,
    academicYear: e.academicYear,
    reason: e.reason,
    institutionId: e.institutionId,
    ...(isInstitutionUser ? { studentRef } : { studentTokenId: e.studentTokenId, studentRef })
  }));

  return {
    studentRef,
    currentState,
    totalEvents: events.length,
    validEventsCount: validEvents.length,
    events: sanitizedEvents
  };
}

module.exports = {
  deriveCurrentState,
  validateTransition,
  recordLifecycleEvent,
  recordCorrectionEvent,
  getStudentTimeline,
  ALLOWED_TRANSITIONS
};
