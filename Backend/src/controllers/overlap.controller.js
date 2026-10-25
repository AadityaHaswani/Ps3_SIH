/**
 * Overlap Controller.
 * Handles listing, detail retrieval, and authority resolution for cross-institution enrolment overlaps.
 */
const overlapService = require('../services/overlapService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * GET /api/v1/overlap-cases
 */
async function listOverlapCases(req, res, next) {
  try {
    const filters = {
      status: req.query.status,
      severity: req.query.severity,
      caseType: req.query.caseType,
      institutionId: req.query.institutionId
    };

    const pagination = {
      page: req.query.page,
      limit: req.query.limit
    };

    const user = req.user || {};
    const result = await overlapService.listOverlapCases(filters, pagination, user);
    return sendSuccess(res, result.cases, 200, result.pagination);
  } catch (err) {
    if (err.statusCode === 403) {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    next(err);
  }
}

/**
 * GET /api/v1/overlap-cases/:id
 */
async function getOverlapCase(req, res, next) {
  try {
    const { id } = req.params;
    const user = req.user || {};

    const overlapCase = await overlapService.getOverlapCaseById(id, user);
    return sendSuccess(res, overlapCase, 200);
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

/**
 * PATCH /api/v1/overlap-cases/:id/resolve
 */
async function resolveOverlapCase(req, res, next) {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const user = req.user || {};

    const resolvedCase = await overlapService.resolveOverlapCase(id, payload, user);
    return sendSuccess(res, resolvedCase, 200);
  } catch (err) {
    if (err.statusCode === 403) {
      return sendError(res, err.code || 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.statusCode === 422) {
      return sendError(res, err.code || 'VALIDATION_ERROR', err.message, 422);
    }
    if (err.statusCode === 400) {
      return sendError(res, err.code || 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

module.exports = {
  listOverlapCases,
  getOverlapCase,
  resolveOverlapCase
};
