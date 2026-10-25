/**
 * Verification Routes.
 * Mounts endpoints for assurance label requests, manual review,
 * subject lookups, and connector status under /api/v1/verifications.
 */
const express = require('express');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const {
  handleRequestVerification,
  handleReviewVerification,
  handleListVerifications,
  handleGetBySubject,
  handleGetConnectorsStatus
} = require('../controllers/verification.controller');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// 1. By-subject query
router.get('/by-subject', handleGetBySubject);

// 2. Request verification (institution admin/operator, authority roles)
router.post(
  '/request',
  authorize([
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ]),
  handleRequestVerification
);

// 3. Review verification (authority officers & admins only, strictly forbidden to institutions and auditors)
router.patch(
  '/:id/review',
  authorize([ROLES.PLATFORM_ADMIN, ROLES.AUTHORITY_ADMIN, ROLES.AUTHORITY_OFFICER]),
  handleReviewVerification
);

// 4. List verification records with institution scoping
router.get(
  '/',
  authorize([
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ]),
  handleListVerifications
);

// 5. Connectors status route alias
router.get('/connectors/status', handleGetConnectorsStatus);

module.exports = router;
