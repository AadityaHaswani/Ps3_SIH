/**
 * Verification Controller.
 * Handles HTTP endpoints for requesting verifications, officer review of evidence,
 * querying effective labels & history, and connector status.
 */
const {
  requestVerification,
  reviewVerification,
  listVerifications,
  getSubjectVerifications
} = require('../services/verificationService');
const connectorRegistry = require('../services/connectors/connectorRegistry');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * POST /api/v1/verifications/request
 * Initiates an automated or manual verification request.
 */
async function handleRequestVerification(req, res, next) {
  try {
    if (req.user && req.user.role === 'AUDITOR') {
      return sendError(res, 'FORBIDDEN', 'Auditor role is read-only and cannot request verifications.', 403);
    }

    const {
      subjectType,
      subjectId,
      fieldPath = 'approvedIntake',
      connectorId = 'mock-authority-intake',
      value,
      context = {}
    } = req.body;

    let institutionId = req.body.institutionId;

    // Institution scoping check
    if (req.user && ['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(req.user.role)) {
      if (institutionId && req.user.institutionId && String(institutionId) !== String(req.user.institutionId)) {
        return sendError(res, 'FORBIDDEN', 'Cannot request verification for another institution.', 403);
      }
      institutionId = req.user.institutionId || institutionId;
    }

    if (!subjectType || !subjectId || value === undefined || !institutionId) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'subjectType, subjectId, institutionId, and value are required.',
        400
      );
    }

    const idempotencyKey =
      req.headers['idempotency-key'] || req.body.idempotencyKey || null;

    const result = await requestVerification({
      subjectType,
      subjectId,
      fieldPath,
      connectorId,
      institutionId,
      value,
      context,
      user: req.user,
      idempotencyKey
    });

    return sendSuccess(res, result, result.isReplay ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/verifications/:id/review
 * Reviews verification evidence by an authorized authority reviewer.
 */
async function handleReviewVerification(req, res, next) {
  try {
    const allowedRoles = ['AUTHORITY_ADMIN', 'AUTHORITY_OFFICER', 'PLATFORM_ADMIN'];
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return sendError(
        res,
        'FORBIDDEN',
        'Forbidden: Only authorized authority officers can review verification evidence.',
        403
      );
    }

    const { action, notes, evidenceRef, sourceMode, method } = req.body;
    if (!action || !['CONFIRM', 'REJECT', 'CONFLICT'].includes(action)) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'Review action must be one of: CONFIRM, REJECT, CONFLICT.',
        400
      );
    }

    const result = await reviewVerification(
      req.params.id,
      { action, notes, evidenceRef, sourceMode, method },
      req.user
    );

    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/verifications
 * Lists verification records with filters, institution scoping, and pagination.
 */
async function handleListVerifications(req, res, next) {
  try {
    const {
      subjectType,
      subjectId,
      fieldPath,
      label,
      sourceMode,
      status,
      institutionId,
      page,
      limit
    } = req.query;

    if (
      req.user &&
      ['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(req.user.role) &&
      institutionId &&
      req.user.institutionId &&
      String(institutionId) !== String(req.user.institutionId)
    ) {
      return sendError(res, 'FORBIDDEN', 'Cannot query verifications for another institution.', 403);
    }

    const filters = {
      subjectType,
      subjectId,
      fieldPath,
      label,
      sourceMode,
      status,
      institutionId
    };

    const result = await listVerifications(filters, { page, limit }, req.user);
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/verifications/by-subject
 * Resolves effective assurance label and returns complete history for a subject.
 */
async function handleGetBySubject(req, res, next) {
  try {
    const {
      subjectType,
      subjectId,
      fieldPath = 'approvedIntake',
      currentValue,
      requiredSourceVersion
    } = req.query;

    if (!subjectType || !subjectId) {
      return sendError(res, 'VALIDATION_ERROR', 'subjectType and subjectId are required query parameters.', 400);
    }

    const result = await getSubjectVerifications({
      subjectType,
      subjectId,
      fieldPath,
      currentValue: currentValue !== undefined ? currentValue : null,
      requiredSourceVersion: requiredSourceVersion || null,
      user: req.user
    });

    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/connectors/status
 * Returns health, availability, and trusted modes of registered connectors.
 * Sanitized against any secret or credential leakage.
 */
async function handleGetConnectorsStatus(req, res, next) {
  try {
    const connectors = await connectorRegistry.listConnectorsStatus();
    return sendSuccess(res, { connectors, timestamp: new Date() }, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleRequestVerification,
  handleReviewVerification,
  handleListVerifications,
  handleGetBySubject,
  handleGetConnectorsStatus
};
