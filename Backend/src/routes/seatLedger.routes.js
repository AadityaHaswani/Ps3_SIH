/**
 * Seat Ledger & Academic Mass-Balance Routes.
 * Mounts endpoints for balances, append-only entries, intake governance,
 * occupancy rules, integrity audits, and cohort mass-balance.
 */
const express = require('express');
const {
  getSeatBalances,
  getSeatBalanceDetail,
  getSeatBalanceEntries,
  getSeatBalanceHistory,
  declareIntake,
  updateApprovedIntake,
  getOccupancyRules,
  createRule,
  verifyIntegrity,
  getMassBalance
} = require('../controllers/seatLedger.controller');
const {
  authenticate,
  authorize,
  scopeToInstitution
} = require('../middleware/auth');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

// All ledger routes require authentication
router.use(authenticate);

// Balance queries & historical timelines
router.get(
  '/balances',
  authorize([PERMISSIONS.SEAT_LEDGER_READ]),
  scopeToInstitution,
  getSeatBalances
);

router.get(
  '/balances/:id',
  authorize([PERMISSIONS.SEAT_LEDGER_READ]),
  scopeToInstitution,
  getSeatBalanceDetail
);

router.get(
  '/balances/:id/entries',
  authorize([PERMISSIONS.SEAT_LEDGER_READ]),
  scopeToInstitution,
  getSeatBalanceEntries
);

router.get(
  '/history',
  authorize([PERMISSIONS.SEAT_LEDGER_READ]),
  scopeToInstitution,
  getSeatBalanceHistory
);

// Intake Governance: Institution self-declarations
router.post(
  '/intake-declarations',
  authorize([PERMISSIONS.SEAT_INTAKE_DECLARE]),
  scopeToInstitution,
  declareIntake
);
router.post(
  '/intake/declare',
  authorize([PERMISSIONS.SEAT_INTAKE_DECLARE]),
  scopeToInstitution,
  declareIntake
);

// Authority approved intake configuration (Institution users explicitly excluded)
router.put(
  '/intake',
  authorize([PERMISSIONS.SEAT_INTAKE_APPROVE]),
  updateApprovedIntake
);

// Occupancy Rules
router.get(
  '/rules',
  authorize([PERMISSIONS.SEAT_LEDGER_READ]),
  getOccupancyRules
);

router.post(
  '/rules',
  authorize([PERMISSIONS.SEAT_RULES_UPDATE]),
  createRule
);

// Ledger Integrity Auditing
router.post(
  '/verify-integrity',
  authorize([PERMISSIONS.SEAT_LEDGER_AUDIT]),
  scopeToInstitution,
  verifyIntegrity
);

// Academic Mass-Balance
router.get(
  '/mass-balance',
  authorize([PERMISSIONS.SEAT_LEDGER_READ]),
  scopeToInstitution,
  getMassBalance
);

module.exports = router;
