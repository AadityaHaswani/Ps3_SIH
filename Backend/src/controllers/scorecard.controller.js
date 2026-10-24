/**
 * Institutional Data Reliability Scorecard Controller.
 * Handles API requests for scorecards, metrics, comparisons, recalculations, and configs.
 * Enforces standard response envelopes and permission boundaries.
 */
const mongoose = require('mongoose');
const scorecardService = require('../services/scorecardService');
const scoringConfigService = require('../services/scoringConfigService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * GET /api/v1/scorecards/institutions/:institutionId
 */
async function getScorecard(req, res, next) {
  try {
    const institutionId = req.params.institutionId;
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid institution ID format.', 400);
    }

    const reportingPeriod = req.query.reportingPeriod || '2024-25';
    const scorecard = await scorecardService.getOrCalculateScorecard(
      institutionId,
      reportingPeriod,
      {
        configVersion: req.query.configVersion,
        forceRecalculate: req.query.refresh === 'true'
      }
    );

    return sendSuccess(res, scorecard, 200, {
      reportingPeriod: scorecard.reportingPeriod,
      configVersion: scorecard.configVersion,
      isStale: scorecard.isStale
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    next(err);
  }
}

/**
 * GET /api/v1/scorecards/institutions/:institutionId/metrics
 */
async function getMetrics(req, res, next) {
  try {
    const institutionId = req.params.institutionId;
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid institution ID format.', 400);
    }

    const reportingPeriod = req.query.reportingPeriod || '2024-25';
    const metricsData = await scorecardService.getInstitutionMetrics(
      institutionId,
      reportingPeriod
    );

    return sendSuccess(res, metricsData, 200, {
      reportingPeriod: metricsData.reportingPeriod,
      configVersion: metricsData.configVersion
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    next(err);
  }
}

/**
 * GET /api/v1/scorecards/institutions/:institutionId/trend
 */
async function getTrend(req, res, next) {
  try {
    const institutionId = req.params.institutionId;
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid institution ID format.', 400);
    }

    const trendData = await scorecardService.getScorecardTrend(institutionId, {
      configVersion: req.query.configVersion,
      limit: parseInt(req.query.limit, 10) || 50
    });

    return sendSuccess(res, trendData, 200, {
      institutionId,
      dataPoints: trendData.dataPoints
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/scorecards/institutions/:institutionId/history
 */
async function getHistory(req, res, next) {
  try {
    const institutionId = req.params.institutionId;
    if (!mongoose.Types.ObjectId.isValid(institutionId)) {
      return sendError(res, 'VALIDATION_ERROR', 'Invalid institution ID format.', 400);
    }

    const historyData = await scorecardService.getSnapshotHistory(
      institutionId,
      req.query.reportingPeriod,
      req.query
    );

    return sendSuccess(res, historyData.items, 200, {
      pagination: historyData.pagination,
      disclaimer: historyData.disclaimer
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/scorecards/recalculate
 */
async function recalculateScore(req, res, next) {
  try {
    const institutionId = req.body.institutionId || req.institutionId;
    if (!institutionId || !mongoose.Types.ObjectId.isValid(institutionId)) {
      return sendError(res, 'VALIDATION_ERROR', 'Valid institutionId is required in request body.', 400);
    }

    const reportingPeriod = req.body.reportingPeriod || '2024-25';
    const freshSnapshot = await scorecardService.recalculateScorecard(
      institutionId,
      reportingPeriod,
      {
        configVersion: req.body.configVersion,
        triggerReason: 'MANUAL_RECALCULATE'
      }
    );

    return sendSuccess(res, freshSnapshot, 200, {
      message: 'Scorecard recalculation completed successfully.',
      recalculatedAt: freshSnapshot.calculatedAt
    });
  } catch (err) {
    if (err.statusCode === 404) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    next(err);
  }
}

/**
 * GET /api/v1/scorecards/compare
 */
async function compareInstitutions(req, res, next) {
  try {
    let ids = req.query.institutions;
    if (typeof ids === 'string') {
      ids = ids.split(',').map((id) => id.trim()).filter(Boolean);
    }

    if (!ids || !Array.isArray(ids) || ids.length < 2) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'At least two valid institution IDs required in query param `institutions` (comma-separated).',
        400
      );
    }

    for (const id of ids) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return sendError(res, 'VALIDATION_ERROR', `Invalid institution ID format: ${id}.`, 400);
      }
    }

    const reportingPeriod = req.query.reportingPeriod || '2024-25';
    const result = await scorecardService.compareInstitutions(
      ids,
      reportingPeriod,
      req.user,
      { configVersion: req.query.configVersion }
    );

    return sendSuccess(res, result, 200, {
      reportingPeriod,
      isDirectlyComparable: result.isDirectlyComparable
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/scorecards/config
 */
async function getConfig(req, res, next) {
  try {
    const version = req.query.version;
    const config = version
      ? await scoringConfigService.getConfigByVersion(version)
      : await scoringConfigService.getActiveConfig();

    return sendSuccess(res, config, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/scorecards/config
 * Authority-only route to create a new scoring configuration version.
 */
async function createConfig(req, res, next) {
  try {
    const newConfig = await scoringConfigService.createConfigVersion(req.body, req.user);
    return sendSuccess(res, newConfig, 201, {
      message: `Scoring configuration version '${newConfig.configVersion}' created successfully.`
    });
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.statusCode === 409 ? 'CONFLICT' : 'VALIDATION_ERROR', err.message, err.statusCode);
    }
    next(err);
  }
}

module.exports = {
  getScorecard,
  getMetrics,
  getTrend,
  getHistory,
  recalculateScore,
  compareInstitutions,
  getConfig,
  createConfig
};
