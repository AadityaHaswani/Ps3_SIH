/**
 * Root API v1 router.
 * Aggregates all modular sub-routers under /api/v1.
 */
const express = require('express');
const healthRoutes = require('./health.routes');
const rosterRoutes = require('./roster.routes');
const reconciliationRoutes = require('./reconciliation.routes');
const findingRoutes = require('./finding.routes');
const seatLedgerRoutes = require('./seatLedger.routes');
const samplingRunRoutes = require('./samplingRun.routes');
const samplingItemRoutes = require('./samplingItem.routes');

const router = express.Router();

// Mount modular sub-routes
router.use('/health', healthRoutes);
router.use('/rosters', rosterRoutes);
router.use('/reconciliations', reconciliationRoutes);
router.use('/reconciliation-findings', findingRoutes);
router.use('/findings', findingRoutes);
router.use('/seat-ledger', seatLedgerRoutes);
router.use('/sampling-runs', samplingRunRoutes);
router.use('/sampling-items', samplingItemRoutes);

module.exports = router;
