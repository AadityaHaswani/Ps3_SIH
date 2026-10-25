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
  scopeToInstitution,
  ROLES
} = require('../middleware/auth');

const router = express.Router();

// All ledger routes require authentication
router.use(authenticate);

const ALL_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUTHORITY_OFFICER,
  ROLES.AUDITOR,
  ROLES.INSTITUTION_ADMIN,
  ROLES.INSTITUTION_OPERATOR
];

const AUTHORITY_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN
];

const AUDIT_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.AUTHORITY_ADMIN,
  ROLES.AUDITOR
];

const DECLARATION_ROLES = [
  ROLES.PLATFORM_ADMIN,
  ROLES.INSTITUTION_ADMIN
];

// Balance queries & historical timelines
router.get(
  '/balances',
  authorize(ALL_ROLES),
  scopeToInstitution,
  getSeatBalances
);

router.get(
  '/balances/:id',
  authorize(ALL_ROLES),
  scopeToInstitution,
  getSeatBalanceDetail
);

router.get(
  '/balances/:id/entries',
  authorize(ALL_ROLES),
  scopeToInstitution,
  getSeatBalanceEntries
);

router.get(
  '/history',
  authorize(ALL_ROLES),
  scopeToInstitution,
  getSeatBalanceHistory
);

// Intake Governance
router.post(
  '/intake-declarations',
  authorize(DECLARATION_ROLES),
  scopeToInstitution,
  declareIntake
);
router.post(
  '/intake/declare',
  authorize(DECLARATION_ROLES),
  scopeToInstitution,
  declareIntake
);

// Authority approved intake configuration (Institution users explicitly excluded)
router.put(
  '/intake',
  authorize(AUTHORITY_ROLES),
  updateApprovedIntake
);

// Occupancy Rules
router.get(
  '/rules',
  authorize(ALL_ROLES),
  getOccupancyRules
);

router.post(
  '/rules',
  authorize(AUTHORITY_ROLES),
  createRule
);

// Ledger Integrity Auditing
router.post(
  '/verify-integrity',
  authorize(AUDIT_ROLES),
  scopeToInstitution,
  verifyIntegrity
);

// Academic Mass-Balance
router.get(
  '/mass-balance',
  authorize(ALL_ROLES),
  scopeToInstitution,
  getMassBalance
);

module.exports = router;
