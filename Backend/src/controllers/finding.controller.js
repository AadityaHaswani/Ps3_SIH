/**
 * Finding Controller.
 * Handles single finding detail inspection and recording auditable review decisions.
 */
const { getFindingById, reviewFinding: recordFindingReview } = require('../services/findingService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * GET /api/v1/reconciliation-findings/:id or /api/v1/findings/:id
 */
async function getFinding(req, res, next) {
  try {
    const { id } = req.params;
    const finding = await getFindingById(id, req.institutionId);

    return sendSuccess(res, finding, 200);
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    next(err);
  }
}

/**
 * PATCH /api/v1/reconciliation-findings/:id/review or /api/v1/findings/:id/review
 */
async function reviewFinding(req, res, next) {
  try {
    const { id } = req.params;
    const { action, reason, note } = req.body;

    if (!action) {
      return sendError(res, 'VALIDATION_ERROR', 'Action is required (CONFIRM, DISMISS, REQUEST_CLARIFICATION, RESOLVE).', 400);
    }

    const updatedFinding = await recordFindingReview(id, { action, reason, note }, req.user);

    // Mark scorecard snapshots stale for the affected institution
    if (updatedFinding && updatedFinding.institutionId) {
      try {
        const scorecardService = require('../services/scorecardService');
        scorecardService.markSnapshotsStale(updatedFinding.institutionId, null, 'FINDING_REVIEWED').catch(() => {});
      } catch (_) {}
    }

    return sendSuccess(res, updatedFinding, 200);
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.message.includes('Invalid review action')) {
      return sendError(res, 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

module.exports = {
  getFinding,
  reviewFinding
};
