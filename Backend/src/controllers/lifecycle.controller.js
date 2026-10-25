/**
 * Student Lifecycle Controller.
 * Handles recording append-only lifecycle events, corrections, and timelines.
 */
const lifecycleService = require('../services/lifecycleService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * POST /api/v1/lifecycle/events
 */
async function recordEvent(req, res, next) {
  try {
    const payload = req.body || {};
    const user = req.user || {};

    // Scoping check for institution users
    const isInstitutionUser = user.role && user.role.startsWith('INSTITUTION_');
    if (isInstitutionUser) {
      if (!user.institutionId) {
        return sendError(res, 'FORBIDDEN', 'User is not associated with an institution.', 403);
      }
      if (payload.institutionId && String(payload.institutionId) !== String(user.institutionId)) {
        return sendError(res, 'FORBIDDEN', 'Cannot record lifecycle events for another institution.', 403);
      }
      payload.institutionId = user.institutionId;
    }

    if (!payload.institutionId) {
      return sendError(res, 'VALIDATION_ERROR', 'institutionId is required.', 400);
    }

    if (!payload.type) {
      return sendError(res, 'VALIDATION_ERROR', 'Event type is required.', 400);
    }

    // Check if correction request
    if (payload.supersedesEventId || payload.type === 'CORRECTED') {
      if (!payload.supersedesEventId) {
        return sendError(res, 'VALIDATION_ERROR', 'supersedesEventId is required for correction events.', 400);
      }
      const correctedEvent = await lifecycleService.recordCorrectionEvent(
        payload.supersedesEventId,
        payload,
        user
      );
      return sendSuccess(res, { event: correctedEvent }, 201);
    }

    const result = await lifecycleService.recordLifecycleEvent(payload, user);
    return sendSuccess(res, { event: result.event, isReplay: result.isReplay }, 201);
  } catch (err) {
    if (err.statusCode === 422 || err.code === 'INVALID_LIFECYCLE_TRANSITION') {
      return sendError(res, err.code || 'INVALID_LIFECYCLE_TRANSITION', err.message, 422, [
        {
          allowedTransitions: lifecycleService.ALLOWED_TRANSITIONS[err.currentState] || [],
          attemptedTransition: err.attemptedTransition
        }
      ]);
    }
    if (err.statusCode === 409) {
      return sendError(res, 'CONFLICT', err.message, 409);
    }
    if (err.statusCode === 400) {
      return sendError(res, err.code || 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

/**
 * GET /api/v1/lifecycle/students/:tokenId/events
 */
async function getTimeline(req, res, next) {
  try {
    const { tokenId } = req.params;
    if (!tokenId) {
      return sendError(res, 'VALIDATION_ERROR', 'Student token ID is required.', 400);
    }

    const user = req.user || {};
    const isInstitutionUser = user.role && user.role.startsWith('INSTITUTION_');
    const institutionScope = isInstitutionUser ? user.institutionId : (req.query.institutionId || null);

    const timeline = await lifecycleService.getStudentTimeline(tokenId, institutionScope, user);
    return sendSuccess(res, timeline, 200);
  } catch (err) {
    if (err.statusCode === 403) {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    next(err);
  }
}

module.exports = {
  recordEvent,
  getTimeline
};
