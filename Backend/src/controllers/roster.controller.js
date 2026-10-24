/**
 * Roster Controller.
 * Handles CSV upload, preview with row-level validation, and roster version commit.
 */
const {
  processRosterUpload,
  getRosterPreview,
  commitRosterVersion,
  getRosterById
} = require('../services/rosterService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

/**
 * POST /api/v1/rosters/upload
 */
async function uploadRoster(req, res, next) {
  try {
    if (!req.file) {
      return sendError(res, 'VALIDATION_ERROR', 'CSV file is required for roster upload.', 400);
    }

    const { academicYear, programmeCode } = req.body;
    if (!academicYear) {
      return sendError(res, 'VALIDATION_ERROR', 'academicYear is required (e.g. 2025-26).', 400);
    }

    const institutionId = req.institutionId || req.body.institutionId;
    if (!institutionId) {
      return sendError(res, 'VALIDATION_ERROR', 'institutionId is required.', 400);
    }

    const upload = await processRosterUpload({
      institutionId,
      academicYear,
      programmeCode,
      file: req.file,
      user: req.user
    });

    return sendSuccess(
      res,
      {
        id: upload._id,
        filename: upload.filename,
        fileSha256: upload.fileSha256,
        academicYear: upload.academicYear,
        rowCount: upload.rowCount,
        status: upload.status,
        validation: upload.validation
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/rosters/:id/preview
 */
async function getPreview(req, res, next) {
  try {
    const { id } = req.params;
    const { page = 1, limit = 25 } = req.query;

    const preview = await getRosterPreview(id, { page, limit });
    return sendSuccess(res, preview.upload, 200, {
      ...preview.pagination,
      rows: preview.rows
    });
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    next(err);
  }
}

/**
 * POST /api/v1/rosters/:id/commit
 */
async function commitRoster(req, res, next) {
  try {
    const { id } = req.params;
    const version = await commitRosterVersion(id, req.user);

    return sendSuccess(
      res,
      {
        versionId: version._id,
        versionNumber: version.versionNumber,
        status: version.status,
        rowCount: version.rowCount,
        academicYear: version.academicYear,
        committedAt: version.committedAt
      },
      201
    );
  } catch (err) {
    if (err.message.includes('not found')) {
      return sendError(res, 'NOT_FOUND', err.message, 404);
    }
    if (err.message.includes('already been committed') || err.message.includes('Cannot commit')) {
      return sendError(res, 'CONFLICT', err.message, 409);
    }
    next(err);
  }
}

/**
 * GET /api/v1/rosters/:id
 */
async function getRoster(req, res, next) {
  try {
    const { id } = req.params;
    const roster = await getRosterById(id);

    if (!roster) {
      return sendError(res, 'NOT_FOUND', 'Roster record not found.', 404);
    }

    return sendSuccess(res, roster, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadRoster,
  getPreview,
  commitRoster,
  getRoster
};
