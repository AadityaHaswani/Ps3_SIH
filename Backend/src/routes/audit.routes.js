/**
 * Audit API Routes.
 * Mounts endpoints for querying centralized, append-only audit events under /api/v1/audit.
 */
const express = require('express');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { handleListAuditEvents } = require('../controllers/audit.controller');

const router = express.Router();

router.use(authenticate);

// GET /api/v1/audit/events
router.get(
  '/events',
  authorize([
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN
  ]),
  handleListAuditEvents
);

module.exports = router;
