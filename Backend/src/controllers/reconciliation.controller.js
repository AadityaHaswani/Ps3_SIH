/**
 * Reconciliation Controller.
 * Handles triggering reconciliation runs, retrieving run details, paginating findings,
 * and presenting chart-ready summaries.
 */
const {
  runReconciliation,
  getReconciliationRun,
  listReconciliationRuns
} = require('../services/reconciliationService');
const { getFindings } = require('../services/findingService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * POST /api/v1/reconciliations
 */
async function createReconciliation(req, res, next) {
  try {
    const {
      academicYear,
      rosterVersionId,
      sources = ['ROSTER', 'ADMISSION', 'EXAM', 'INTAKE'],
      programmeCodes = [],
      simulationToggles = {}
    } = req.body;

    const institutionId = req.institutionId || req.body.institutionId;
    if (!institutionId) {
      return sendError(res, 'VALIDATION_ERROR', 'institutionId is required.', 400);
    }

    if (!academicYear || !rosterVersionId) {
      return sendError(res, 'VALIDATION_ERROR', 'academicYear and rosterVersionId are required.', 400);
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || null;

    const { run, isReplay } = await runReconciliation({
      institutionId,
      academicYear,
      rosterVersionId,
      sources,
      programmeCodes,
      user: req.user,
      idempotencyKey,
      simulationToggles
    });

    return sendSuccess(
      res,
      {
        id: run._id,
        runId: run.runId,
        institutionId: run.institutionId,
        academicYear: run.academicYear,
        rosterVersionId: run.rosterVersionId,
        status: run.status,
        ruleVersion: run.ruleVersion,
        summary: run.summary,
        sourceModes: run.sourceModes,
        sourceFreshness: run.sourceFreshness,
        createdAt: run.createdAt
      },
      isReplay ? 200 : 201,
      { isReplay }
    );
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.message.includes('must be COMMITTED') || err.message.includes('At least two sources')) {
      return sendError(res, 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

/**
 * GET /api/v1/reconciliations/:id
 */
async function getReconciliation(req, res, next) {
  try {
    const { id } = req.params;
    const run = await getReconciliationRun(id);

    if (!run) {
      return sendError(res, 'NOT_FOUND', 'Reconciliation run not found.', 404);
    }

    // Check institution scope
    if (req.institutionId && String(run.institutionId) !== String(req.institutionId)) {
      return sendError(res, 'FORBIDDEN', 'Access to another institution reconciliation run is denied.', 403);
    }

    return sendSuccess(res, run, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/reconciliations
 */
async function listReconciliations(req, res, next) {
  try {
    const { page = 1, limit = 25, academicYear } = req.query;
    const filter = {};

    if (req.institutionId) {
      filter.institutionId = req.institutionId;
    } else if (req.query.institutionId) {
      filter.institutionId = req.query.institutionId;
    }

    if (academicYear) {
      filter.academicYear = academicYear;
    }

    const result = await listReconciliationRuns(filter, { page, limit });
    return sendSuccess(res, result.items, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/reconciliations/:id/findings
 */
async function getReconciliationFindings(req, res, next) {
  try {
    const { id } = req.params;
    const { page = 1, limit = 25, type, severity, reviewStatus } = req.query;

    const run = await getReconciliationRun(id);
    if (!run) {
      return sendError(res, 'NOT_FOUND', 'Reconciliation run not found.', 404);
    }

    if (req.institutionId && String(run.institutionId) !== String(req.institutionId)) {
      return sendError(res, 'FORBIDDEN', 'Access denied to findings for another institution.', 403);
    }

    const filter = { runId: run.runId };
    if (type) filter.type = type;
    if (severity) filter.severity = severity;
    if (reviewStatus) filter.reviewStatus = reviewStatus;

    const result = await getFindings(filter, { page, limit });
    return sendSuccess(res, result.items, 200, result.pagination);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/reconciliations/:id/summary
 */
async function getReconciliationSummary(req, res, next) {
  try {
    const { id } = req.params;
    const run = await getReconciliationRun(id);

    if (!run) {
      return sendError(res, 'NOT_FOUND', 'Reconciliation run not found.', 404);
    }

    if (req.institutionId && String(run.institutionId) !== String(req.institutionId)) {
      return sendError(res, 'FORBIDDEN', 'Access denied to summary for another institution.', 403);
    }

    const summaryData = {
      runId: run.runId,
      status: run.status,
      ruleVersion: run.ruleVersion,
      academicYear: run.academicYear,
      sources: run.sources,
      sourceModes: run.sourceModes,
      sourceFreshness: run.sourceFreshness,
      summary: run.summary,
      metrics: {
        reconciliationRatePct:
          run.summary.rosterRecords > 0
            ? Math.round((run.summary.confirmed3Way / run.summary.rosterRecords) * 1000) / 10
            : 0,
        unresolvedCount:
          run.summary.unmatched +
          run.summary.conflicts +
          run.summary.candidateReview +
          run.summary.duplicateCandidates,
        coveragePct: run.summary.sourceUnavailable === 0 ? 100 : 66.7
      },
      chartBreakdown: [
        { label: 'Confirmed 3-Way', count: run.summary.confirmed3Way, status: 'CONFIRMED_3WAY' },
        { label: 'Confirmed Partial', count: run.summary.confirmedPartial, status: 'CONFIRMED_PARTIAL' },
        { label: 'Unmatched in Register', count: run.summary.unmatched, status: 'UNMATCHED' },
        { label: 'Attribute Conflicts', count: run.summary.conflicts, status: 'CONFLICT' },
        { label: 'Candidate Review Required', count: run.summary.candidateReview, status: 'CANDIDATE_REVIEW' },
        { label: 'Duplicate Candidates', count: run.summary.duplicateCandidates, status: 'DUPLICATE_CANDIDATE' },
        { label: 'Missing from Roster', count: run.summary.missingFromRoster, status: 'MISSING_FROM_ROSTER' },
        { label: 'Over-Intake Mismatch', count: run.summary.countMismatches, status: 'COUNT_MISMATCH' }
      ]
    };

    return sendSuccess(res, summaryData, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createReconciliation,
  getReconciliation,
  listReconciliations,
  getReconciliationFindings,
  getReconciliationSummary
};
