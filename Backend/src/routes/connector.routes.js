/**
 * Connector Routes.
 * Mounts endpoints for connector health, availability, and status under /api/v1/connectors.
 */
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { handleGetConnectorsStatus } = require('../controllers/verification.controller');

const router = express.Router();

router.use(authenticate);

// GET /api/v1/connectors/status
router.get('/status', handleGetConnectorsStatus);

module.exports = router;
