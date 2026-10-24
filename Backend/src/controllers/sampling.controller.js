/**
 * Assurance Sampling Controller.
 * Handles HTTP requests for sample-size preview, random sample generation,
 * item verification reviews, immutable run closure, and Wilson score estimates.
 */
const {
  previewSamplingSize,
  createSamplingRun,
  getSamplingRunById,
  listSamplingRuns,
  getSamplingItems,
  recordItemVerification,
  closeSamplingRun,
  computeRunEstimate
} = require('../services/assuranceSamplingService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const {
  normaliseProgrammeCode,
  normaliseAcademicYear,
  normaliseCategory
} = require('../utils/normalisation');

/**
 * POST /api/v1/sampling-runs/preview-size
 * Previews recommended sample size and population breakdown without persisting.
 */
async function previewSize(req, res, next) {
  try {
    const institutionId = req.institutionId || req.body.institutionId;
    if (!institutionId) {
      return sendError(res, 'VALIDATION_ERROR', 'institutionId is required.', 400);
    }

    const {
      rosterVersionId,
      academicYear,
      programmeCode = null,
      seatCategory = null,
      confidenceLevel = 0.95,
      marginOfError = 0.05,
      expectedProportion = 0.50,
      minSampleSize = 10,
      maxSampleSize = 500,
      riskTargetedCount = 0
    } = req.body;

    if (!rosterVersionId) {
      return sendError(res, 'VALIDATION_ERROR', 'rosterVersionId is required.', 400);
    }

    const preview = await previewSamplingSize({
      institutionId,
      rosterVersionId,
      academicYear,
      programmeCode,
      seatCategory,
      confidenceLevel,
      marginOfError,
      expectedProportion,
      minSampleSize,
      maxSampleSize,
      riskTargetedCount
    });

    return sendSuccess(res, preview, 200);
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.message.includes('uncommitted')) {
      return sendError(res, 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

/**
 * POST /api/v1/sampling-runs
 * Draws a cryptographically secure random sample and creates a new SamplingRun.
 */
async function createRun(req, res, next) {
  try {
    const institutionId = req.institutionId || req.body.institutionId;
    if (!institutionId) {
      return sendError(res, 'VALIDATION_ERROR', 'institutionId is required.', 400);
    }

    const {
      rosterVersionId,
      academicYear,
      programmeCode = null,
      seatCategory = null,
      samplingParameters = {},
      riskTargetedCount = 0
    } = req.body;

    if (!rosterVersionId) {
      return sendError(res, 'VALIDATION_ERROR', 'rosterVersionId is required.', 400);
    }

    const idempotencyKey =
      req.headers['idempotency-key'] || req.body.idempotencyKey || null;

    const { run, isReplay } = await createSamplingRun({
      institutionId,
      rosterVersionId,
      academicYear,
      programmeCode,
      seatCategory,
      samplingParameters,
      riskTargetedCount,
      user: req.user,
      idempotencyKey
    });

    return sendSuccess(
      res,
      {
        run,
        isReplay
      },
      isReplay ? 200 : 201,
      { isReplay }
    );
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.message.includes('uncommitted') || err.message.includes('No eligible')) {
      return sendError(res, 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

/**
 * GET /api/v1/sampling-runs
 * Lists sampling runs with filtering and pagination.
 */
async function listRuns(req, res, next) {
  try {
    const institutionId = req.institutionId || req.query.institutionId;
    const { academicYear, status, page = 1, limit = 25 } = req.query;

    const filter = {};
    if (institutionId) filter.institutionId = institutionId;
    if (academicYear) filter.academicYear = normaliseAcademicYear(academicYear);
    if (status) filter.status = status.toUpperCase().trim();

    const result = await listSamplingRuns(filter, { page, limit });

    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/sampling-runs/:id
 * Retrieves metadata and summary for a single sampling run.
 */
async function getRunDetail(req, res, next) {
  try {
    const { id } = req.params;
    const institutionId = req.institutionId || null;

    const run = await getSamplingRunById(id, institutionId);
    if (!run) {
      return sendError(res, 'NOT_FOUND', 'Sampling run not found or access restricted.', 404);
    }

    return sendSuccess(res, run, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/sampling-runs/:id/items
 * Retrieves paginated sampling items for a run with optional filtering.
 */
async function getItems(req, res, next) {
  try {
    const { id } = req.params;
    const institutionId = req.institutionId || null;
    const { verificationStatus, stratum, page = 1, limit = 25 } = req.query;

    const run = await getSamplingRunById(id, institutionId);
    if (!run) {
      return sendError(res, 'NOT_FOUND', 'Sampling run not found or access restricted.', 404);
    }

    const filter = {};
    if (verificationStatus) filter.verificationStatus = verificationStatus.toUpperCase().trim();
    if (stratum) filter.stratum = stratum.toUpperCase().trim();

    const result = await getSamplingItems(run._id, filter, { page, limit });

    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/sampling-items/:id/result
 * Records verification outcome for a single sampling item (Authority / Reviewer only).
 */
async function recordResult(req, res, next) {
  try {
    const { id } = req.params;
    const {
      verificationStatus,
      verificationMethod,
      evidenceRef,
      notes,
      exclusionReason
    } = req.body;

    if (!verificationStatus) {
      return sendError(res, 'VALIDATION_ERROR', 'verificationStatus is required.', 400);
    }

    const updatedItem = await recordItemVerification({
      itemId: id,
      verificationStatus: verificationStatus.toUpperCase().trim(),
      verificationMethod,
      evidenceRef,
      notes,
      exclusionReason,
      user: req.user
    });

    return sendSuccess(res, updatedItem, 200);
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.message.includes('CLOSED') || err.message.includes('Invalid') || err.message.includes('required')) {
      return sendError(res, 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

/**
 * POST /api/v1/sampling-runs/:id/close
 * Formally closes a sampling run, freezing all item results.
 */
async function closeRun(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const closed = await closeSamplingRun(id, req.user, reason);

    return sendSuccess(res, closed, 200);
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.message.includes('already closed')) {
      return sendError(res, 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

/**
 * GET /api/v1/sampling-runs/:id/estimate
 * Calculates statistical verification rate and Wilson score interval for the random stratum.
 */
async function getEstimate(req, res, next) {
  try {
    const { id } = req.params;
    const institutionId = req.institutionId || null;

    const estimate = await computeRunEstimate(id, institutionId);

    return sendSuccess(res, estimate, 200);
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    next(err);
  }
}

module.exports = {
  previewSize,
  createRun,
  listRuns,
  getRunDetail,
  getItems,
  recordResult,
  closeRun,
  getEstimate
};
