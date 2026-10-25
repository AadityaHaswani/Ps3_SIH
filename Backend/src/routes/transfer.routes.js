/**
 * Transfer API Routes.
 * Mounts endpoints for two-sided transfer handshake, confirmation, rejection, and timeout processing.
 */
const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');
const transferController = require('../controllers/transfer.controller');

const router = express.Router();

router.post(
  '/',
  authenticate,
  authorize([PERMISSIONS.TRANSFERS_CREATE]),
  transferController.createTransfer
);

router.patch(
  '/:id/confirm',
  authenticate,
  authorize([PERMISSIONS.TRANSFERS_CONFIRM_OWN_SIDE]),
  transferController.confirmTransfer
);

router.patch(
  '/:id/reject',
  authenticate,
  authorize([PERMISSIONS.TRANSFERS_CONFIRM_OWN_SIDE]),
  transferController.rejectTransfer
);

router.get(
  '/',
  authenticate,
  authorize([PERMISSIONS.TRANSFERS_READ]),
  transferController.listTransfers
);

router.get(
  '/:id',
  authenticate,
  authorize([PERMISSIONS.TRANSFERS_READ]),
  transferController.getTransfer
);

router.post(
  '/process-timeouts',
  authenticate,
  authorize([PERMISSIONS.TRANSFERS_PROCESS_TIMEOUTS]),
  transferController.processTimeouts
);

module.exports = router;
