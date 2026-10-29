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
const scorecardRoutes = require('./scorecard.routes');
const lifecycleRoutes = require('./lifecycle.routes');
const transferRoutes = require('./transfer.routes');
const overlapRoutes = require('./overlap.routes');
const verificationRoutes = require('./verification.routes');
const connectorRoutes = require('./connector.routes');
const auditRoutes = require('./audit.routes');
const rosterVersionRoutes = require('./rosterVersion.routes');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const institutionRoutes = require('./institution.routes');

const router = express.Router();

// Mount modular sub-routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/institutions', institutionRoutes);
router.use('/health', healthRoutes);
router.use('/rosters', rosterRoutes);
router.use('/roster-versions', rosterVersionRoutes);
router.use('/reconciliations', reconciliationRoutes);
router.use('/reconciliation-findings', findingRoutes);
router.use('/findings', findingRoutes);
router.use('/seat-ledger', seatLedgerRoutes);
router.use('/sampling-runs', samplingRunRoutes);
router.use('/sampling-items', samplingItemRoutes);
router.use('/scorecards', scorecardRoutes);
router.use('/lifecycle', lifecycleRoutes);
router.use('/transfers', transferRoutes);
router.use('/overlap-cases', overlapRoutes);
router.use('/verifications', verificationRoutes);
router.use('/connectors', connectorRoutes);
router.use('/audit', auditRoutes);

module.exports = router;
