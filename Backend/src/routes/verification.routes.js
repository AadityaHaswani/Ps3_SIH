/**
 * Verification Routes.
 * Mounts endpoints for assurance label requests, manual review,
 * subject lookups, and connector status under /api/v1/verifications.
 */
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
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
  authorize([PERMISSIONS.VERIFICATION_REQUEST]),
  handleRequestVerification
);

// 3. Review verification (authority officers & admins only, strictly forbidden to institutions and auditors)
router.patch(
  '/:id/review',
  authorize([PERMISSIONS.VERIFICATION_REVIEW]),
  handleReviewVerification
);

// 4. List verification records with institution scoping
router.get(
  '/',
  authorize([PERMISSIONS.VERIFICATION_READ]),
  handleListVerifications
);

// 5. Connectors status route alias
router.get('/connectors/status', handleGetConnectorsStatus);

module.exports = router;
