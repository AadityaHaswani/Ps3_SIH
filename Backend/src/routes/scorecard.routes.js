/**
 * Institutional Data Reliability Scorecard Routes.
 * Mounts endpoints for scorecards, metric drill-downs, comparisons, recalculations, and config versioning.
 * Strictly enforces authentication, institution data scoping, and role permissions.
 */
const express = require('express');
const {
  getScorecard,
  getMetrics,
  getTrend,
  getHistory,
  recalculateScore,
  compareInstitutions,
  getConfig,
  createConfig
} = require('../controllers/scorecard.controller');
const {
  authenticate,
  authorize,
  scopeToInstitution
} = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

router.use(authenticate);

// 1. Scoring Configuration (Config is queryable by all authenticated users, created only by Authority Admin)
router.get('/config', getConfig);
router.post(
  '/config',
  authorize([PERMISSIONS.SCORING_CONFIG_UPDATE]),
  createConfig
);

// 2. Multi-Institution Comparison (anonymised for institution-scoped users)
router.get('/compare', compareInstitutions);

// 3. Recalculation (Institution users can only recalculate own institution; Authority Admin can recalculate any)
router.post(
  '/recalculate',
  authorize([PERMISSIONS.SCORECARDS_RECALCULATE]),
  scopeToInstitution,
  recalculateScore
);

// 4. Institution-scoped Scorecard Endpoints
router.get(
  '/institutions/:institutionId',
  scopeToInstitution,
  getScorecard
);

router.get(
  '/institutions/:institutionId/metrics',
  scopeToInstitution,
  getMetrics
);

router.get(
  '/institutions/:institutionId/trend',
  scopeToInstitution,
  getTrend
);

router.get(
  '/institutions/:institutionId/history',
  scopeToInstitution,
  getHistory
);

module.exports = router;
