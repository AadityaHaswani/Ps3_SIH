/**
 * Transfer Controller.
 * Handles transfer case creation, two-sided confirmations, rejections,
 * listings, detail views, and timeout processing.
 */
const transferService = require('../services/transferService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * POST /api/v1/transfers
 */
async function createTransfer(req, res, next) {
  try {
    const payload = req.body || {};
    const user = req.user || {};

    // Institution users can only initiate if their institution is either sending or receiving
    const isInstitutionUser = user.role && user.role.startsWith('INSTITUTION_');
    if (isInstitutionUser) {
      const userInstStr = String(user.institutionId);
      const sendStr = String(payload.sendingInstitutionId);
      const recvStr = String(payload.receivingInstitutionId);

      if (userInstStr !== sendStr && userInstStr !== recvStr) {
        return sendError(
          res,
          'FORBIDDEN',
          'Institution may only initiate transfers involving its own institution.',
          403
        );
      }
    }

    const result = await transferService.createTransferCase(payload, user);
    const statusCode = result.isReplay ? 200 : 201;
    return sendSuccess(res, result.transferCase, statusCode, {
      isReplay: result.isReplay || false
    });
  } catch (err) {
    if (err.statusCode === 409 || err.code === 'DUPLICATE_ACTIVE_TRANSFER' || err.code === 'DUPLICATE_TRANSFER_CASE') {
      return sendError(res, err.code || 'CONFLICT', err.message, 409);
    }
    if (err.statusCode === 422) {
      return sendError(res, err.code || 'VALIDATION_ERROR', err.message, 422);
    }
    if (err.statusCode === 400) {
      return sendError(res, 'VALIDATION_ERROR', err.message, 400);
    }
    if (err.statusCode === 403) {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    next(err);
  }
}

/**
 * PATCH /api/v1/transfers/:id/confirm
 */
async function confirmTransfer(req, res, next) {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const user = req.user || {};

    const updatedCase = await transferService.confirmTransfer(id, payload, user);
    return sendSuccess(res, updatedCase, 200);
  } catch (err) {
    if (err.statusCode === 403) {
      return sendError(res, err.code || 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.statusCode === 422) {
      return sendError(res, err.code || 'VALIDATION_ERROR', err.message, 422);
    }
    if (err.statusCode === 400) {
      return sendError(res, 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

/**
 * PATCH /api/v1/transfers/:id/reject
 */
async function rejectTransfer(req, res, next) {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const user = req.user || {};

    const updatedCase = await transferService.rejectTransfer(id, payload, user);
    return sendSuccess(res, updatedCase, 200);
  } catch (err) {
    if (err.statusCode === 403) {
      return sendError(res, err.code || 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.statusCode === 422) {
      return sendError(res, err.code || 'VALIDATION_ERROR', err.message, 422);
    }
    if (err.statusCode === 400) {
      return sendError(res, 'VALIDATION_ERROR', err.message, 400);
    }
    next(err);
  }
}

/**
 * GET /api/v1/transfers
 */
async function listTransfers(req, res, next) {
  try {
    const filters = {
      status: req.query.status,
      academicYear: req.query.academicYear,
      programmeCode: req.query.programmeCode,
      institutionId: req.query.institutionId
    };

    const pagination = {
      page: req.query.page,
      limit: req.query.limit
    };

    const user = req.user || {};
    const result = await transferService.listTransferCases(filters, pagination, user);
    return sendSuccess(res, result.items, 200, result.pagination);
  } catch (err) {
    if (err.statusCode === 403) {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    next(err);
  }
}

/**
 * GET /api/v1/transfers/:id
 */
async function getTransfer(req, res, next) {
  try {
    const { id } = req.params;
    const user = req.user || {};

    const transferCase = await transferService.getTransferCaseById(id, user);
    return sendSuccess(res, transferCase, 200);
  } catch (err) {
    if (err.statusCode === 403) {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    next(err);
  }
}

/**
 * POST /api/v1/transfers/process-timeouts
 */
async function processTimeouts(req, res, next) {
  try {
    const result = await transferService.checkTransferTimeouts();
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTransfer,
  confirmTransfer,
  rejectTransfer,
  listTransfers,
  getTransfer,
  processTimeouts
};
