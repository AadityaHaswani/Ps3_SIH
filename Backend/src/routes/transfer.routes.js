/**
 * Transfer API Routes.
 * Mounts endpoints for two-sided transfer handshake, confirmation, rejection, and timeout processing.
 */
const express = require('express');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const transferController = require('../controllers/transfer.controller');

const router = express.Router();

const CREATE_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER,
  ROLES.INSTITUTION_ADMIN
];

const CONFIRM_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.INSTITUTION_ADMIN
];

const READ_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER,
  ROLES.AUDITOR,
  ROLES.INSTITUTION_ADMIN,
  ROLES.INSTITUTION_OPERATOR
];

const TIMEOUT_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER
];

router.post(
  '/',
  authenticate,
  authorize(CREATE_ROLES),
  transferController.createTransfer
);

router.patch(
  '/:id/confirm',
  authenticate,
  authorize(CONFIRM_ROLES),
  transferController.confirmTransfer
);

router.patch(
  '/:id/reject',
  authenticate,
  authorize(CONFIRM_ROLES),
  transferController.rejectTransfer
);

router.get(
  '/',
  authenticate,
  authorize(READ_ROLES),
  transferController.listTransfers
);

router.get(
  '/:id',
  authenticate,
  authorize(READ_ROLES),
  transferController.getTransfer
);

router.post(
  '/process-timeouts',
  authenticate,
  authorize(TIMEOUT_ROLES),
  transferController.processTimeouts
);

module.exports = router;
