/**
 * Seat Ledger Controller.
 * Handles HTTP requests for bucket balances, append-only ledger entries,
 * intake governance, occupancy rules, ledger integrity verification,
 * and academic mass-balance cohort calculations.
 */
const {
  getBalances,
  getBalanceById,
  getBalanceEntries,
  getBalanceHistory,
  recordIntakeDeclaration,
  setApprovedIntake,
  verifyLedgerIntegrity
} = require('../services/seatLedgerService');
const {
  listOccupancyRules,
  createOccupancyRule,
  getActiveOccupancyRule
} = require('../services/occupancyRuleService');
const { computeCohortMassBalance } = require('../services/massBalanceService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const {
  normaliseProgrammeCode,
  normaliseAcademicYear,
  normaliseCategory
} = require('../utils/normalisation');

/**
 * GET /api/v1/seat-ledger/balances
 * Retrieves paginated list of seat balances with filters.
 */
async function getSeatBalances(req, res, next) {
  try {
    const institutionId = req.institutionId || req.query.institutionId;
    const {
      academicYear,
      programmeCode,
      seatCategory,
      status,
      page = 1,
      limit = 25
    } = req.query;

    const filter = {};
    if (institutionId) filter.institutionId = institutionId;
    if (academicYear) filter.academicYear = normaliseAcademicYear(academicYear);
    if (programmeCode) filter.programmeCode = normaliseProgrammeCode(programmeCode);
    if (seatCategory) filter.seatCategory = normaliseCategory(seatCategory);
    if (status) filter.status = status.toUpperCase().trim();

    const result = await getBalances(filter, { page, limit });

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/seat-ledger/balances/:id
 * Retrieves detail of a single seat balance bucket.
 */
async function getSeatBalanceDetail(req, res, next) {
  try {
    const { id } = req.params;
    const institutionId = req.institutionId || null;

    const bucket = await getBalanceById(id, institutionId);
    if (!bucket) {
      return sendError(res, 'NOT_FOUND', 'Seat balance bucket not found or access restricted.', 404);
    }

    return sendSuccess(res, bucket);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/seat-ledger/balances/:id/entries
 * Retrieves paginated immutable audit entries for a specific balance bucket.
 */
async function getSeatBalanceEntries(req, res, next) {
  try {
    const { id } = req.params;
    const institutionId = req.institutionId || null;
    const { page = 1, limit = 25 } = req.query;

    const bucket = await getBalanceById(id, institutionId);
    if (!bucket) {
      return sendError(res, 'NOT_FOUND', 'Seat balance bucket not found or access restricted.', 404);
    }

    const result = await getBalanceEntries(bucket.bucketKey, { page, limit });

    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/seat-ledger/history
 * Retrieves time-series snapshot history for charting trendlines.
 */
async function getSeatBalanceHistory(req, res, next) {
  try {
    const institutionId = req.institutionId || req.query.institutionId;
    const { bucketKey, from, to } = req.query;

    const history = await getBalanceHistory({
      bucketKey,
      institutionId,
      from,
      to
    });

    return sendSuccess(res, { history });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/seat-ledger/intake-declarations
 * Records an institution self-declared intake.
 * Strictly sets status to INTAKE_UNVERIFIED and sourceMode to INSTITUTION_DECLARED.
 */
async function declareIntake(req, res, next) {
  try {
    const institutionId = req.institutionId || req.body.institutionId;
    if (!institutionId) {
      return sendError(res, 'VALIDATION_ERROR', 'institutionId is required.', 400);
    }

    const {
      programmeCode,
      academicYear,
      seatCategory = 'GENERAL',
      declaredIntake
    } = req.body;

    if (!programmeCode || !academicYear || declaredIntake === undefined) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'programmeCode, academicYear, and declaredIntake are required.',
        400
      );
    }

    const intakeNum = parseInt(declaredIntake, 10);
    if (isNaN(intakeNum) || intakeNum < 0) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'declaredIntake must be a non-negative integer.',
        400
      );
    }

    const idempotencyKey =
      req.headers['idempotency-key'] || req.body.idempotencyKey || null;

    const { bucket, isReplay } = await recordIntakeDeclaration({
      institutionId,
      programmeCode,
      academicYear,
      seatCategory,
      declaredIntake: intakeNum,
      user: req.user,
      idempotencyKey
    });

    return sendSuccess(
      res,
      {
        bucket,
        isReplay
      },
      isReplay ? 200 : 201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/seat-ledger/intake
 * Configures or revises approved intake by an authorized regulatory authority.
 */
async function updateApprovedIntake(req, res, next) {
  try {
    const institutionId = req.body.institutionId;
    if (!institutionId) {
      return sendError(res, 'VALIDATION_ERROR', 'institutionId is required.', 400);
    }

    const {
      programmeCode,
      academicYear,
      seatCategory = 'ALL',
      approvedIntake,
      sourceRef,
      verificationStatus = 'AUTHORITY_VERIFIED',
      sourceMode = 'SIMULATED'
    } = req.body;

    if (!programmeCode || !academicYear || approvedIntake === undefined) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'programmeCode, academicYear, and approvedIntake are required.',
        400
      );
    }

    const intakeNum = parseInt(approvedIntake, 10);
    if (isNaN(intakeNum) || intakeNum < 0) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'approvedIntake must be a non-negative integer.',
        400
      );
    }

    const idempotencyKey =
      req.headers['idempotency-key'] || req.body.idempotencyKey || null;

    const { bucket, isReplay } = await setApprovedIntake({
      institutionId,
      programmeCode,
      academicYear,
      seatCategory,
      approvedIntake: intakeNum,
      sourceRef,
      verificationStatus,
      sourceMode,
      user: req.user,
      idempotencyKey
    });

    return sendSuccess(
      res,
      {
        bucket,
        isReplay
      },
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/seat-ledger/rules
 * Retrieves configured occupancy rules.
 */
async function getOccupancyRules(req, res, next) {
  try {
    const { ruleVersion, activeOnly } = req.query;
    const filter = {};
    if (ruleVersion) filter.ruleVersion = ruleVersion;
    if (activeOnly === 'true') filter.isActive = true;

    const rules = await listOccupancyRules(filter);
    return sendSuccess(res, { rules }, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/seat-ledger/rules
 * Creates a new occupancy rule version (Authority / Platform Admin only).
 */
async function createRule(req, res, next) {
  try {
    const {
      ruleVersion,
      name,
      warningThresholdPct = 90,
      description,
      countingStrategy,
      policySourceRef,
      effectiveFrom
    } = req.body;

    if (!ruleVersion || !name) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'ruleVersion and name are required.',
        400
      );
    }

    const rule = await createOccupancyRule({
      ruleVersion,
      name,
      warningThresholdPct,
      description,
      countingStrategy,
      policySourceRef,
      effectiveFrom,
      user: req.user
    });

    return sendSuccess(res, { rule }, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/seat-ledger/verify-integrity
 * Audits ledger consistency by recomputing derived balances from all historical deltas.
 */
async function verifyIntegrity(req, res, next) {
  try {
    const institutionId = req.institutionId || req.body.institutionId || req.query.institutionId;
    const { academicYear, programmeCode } = req.body;

    const report = await verifyLedgerIntegrity({
      institutionId,
      academicYear,
      programmeCode
    });

    return sendSuccess(res, report, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/seat-ledger/mass-balance
 * Computes cohort carryover mass-balance between academic years.
 */
async function getMassBalance(req, res, next) {
  try {
    const institutionId = req.institutionId || req.query.institutionId;
    const {
      programmeCode,
      academicYear,
      previousAcademicYear,
      entrants = 0,
      exits = 0,
      retentionRate = 1.0
    } = req.query;

    if (!institutionId || !programmeCode || !academicYear) {
      return sendError(
        res,
        'VALIDATION_ERROR',
        'institutionId, programmeCode, and academicYear are required query parameters.',
        400
      );
    }

    const evaluation = await computeCohortMassBalance({
      institutionId,
      programmeCode,
      academicYear,
      previousAcademicYear,
      entrants,
      exits,
      retentionRate
    });

    return sendSuccess(res, evaluation, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
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
};
