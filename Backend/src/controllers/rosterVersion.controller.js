/**
 * Roster Version Controller.
 * Handles HTTP requests for immutable committed roster versions, row-level change diffs,
 * blast-radius impacts, cryptographic Merkle seals, signed receipts, and seal verification.
 */
const RosterVersion = require('../models/rosterVersion.model');
const IntegritySeal = require('../models/integritySeal.model');
const SealAnchor = require('../models/sealAnchor.model');
const { compareRosterVersions } = require('../services/versionDiffService');
const { getImpactByVersionId, revalidateOutput } = require('../services/impactService');
const { verifyRosterSeal } = require('../services/sealService');
const { generateRosterReceipt, generateChainHeadReceipt } = require('../services/receiptService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { resolveInstitutionId } = require('../utils/institutionResolver');

/**
 * GET /api/v1/roster-versions
 * Lists committed roster versions with institution scoping and pagination.
 */
async function handleListVersions(req, res, next) {
  try {
    const { academicYear, institutionId: rawInstId, page = 1, limit = 20 } = req.query;

    const query = {};
    const institutionId = rawInstId ? (await resolveInstitutionId(rawInstId)) || rawInstId : null;

    // Institution scoping check
    if (['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(req.user.role)) {
      if (institutionId && req.user.institutionId && String(institutionId) !== String(req.user.institutionId)) {
        return sendError(res, 'FORBIDDEN', 'Cannot list roster versions of another institution.', 403);
      }
      query.institutionId = req.user.institutionId;
    } else if (institutionId) {
      query.institutionId = institutionId;
    }

    if (academicYear) {
      query.academicYear = academicYear.trim();
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (p - 1) * l;

    const [total, versions] = await Promise.all([
      RosterVersion.countDocuments(query),
      RosterVersion.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .lean()
    ]);

    // Attach seal and anchor summary to each version
    const versionIds = versions.map((v) => v._id);
    const [seals, anchors] = await Promise.all([
      IntegritySeal.find({ rosterVersionId: { $in: versionIds } }).lean(),
      SealAnchor.find({ rosterVersionId: { $in: versionIds } }).lean()
    ]);

    const sealMap = new Map(seals.map((s) => [String(s.rosterVersionId), s]));
    const anchorMap = new Map(anchors.map((a) => [String(a.rosterVersionId), a]));

    const enrichedVersions = versions.map((v) => {
      const seal = sealMap.get(String(v._id));
      const anchor = anchorMap.get(String(v._id));
      return {
        ...v,
        isSealed: !!seal,
        merkleRoot: seal ? seal.merkleRoot : null,
        isAnchored: !!anchor,
        anchorSequence: anchor ? anchor.sequenceNumber : null
      };
    });

    return sendSuccess(
      res,
      {
        items: enrichedVersions,
        pagination: {
          page: p,
          limit: l,
          total,
          totalPages: Math.ceil(total / l)
        }
      },
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/roster-versions/chain-head
 * Retrieves signed chain-head attestation for an institution.
 */
async function handleGetChainHead(req, res, next) {
  try {
    let rawInst = req.query.institutionId;
    let institutionId = rawInst ? (await resolveInstitutionId(rawInst)) || rawInst : null;
    const academicYear = req.query.academicYear || '2024-25';

    if (['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(req.user.role)) {
      if (institutionId && req.user.institutionId && String(institutionId) !== String(req.user.institutionId)) {
        return sendError(res, 'FORBIDDEN', 'Cannot access chain head of another institution.', 403);
      }
      institutionId = req.user.institutionId || institutionId;
    }

    if (!institutionId) {
      return sendError(res, 'VALIDATION_ERROR', 'institutionId query parameter is required.', 400);
    }

    const receipt = await generateChainHeadReceipt(institutionId, academicYear, req.user);
    return sendSuccess(res, receipt, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/roster-versions/:id
 * Retrieves committed roster version details, seal metadata, and anchor status.
 */
async function handleGetVersion(req, res, next) {
  try {
    const version = await RosterVersion.findById(req.params.id).lean();
    if (!version) {
      return sendError(res, 'NOT_FOUND', `RosterVersion ${req.params.id} not found.`, 404);
    }

    // Institution scoping check
    if (['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(req.user.role)) {
      if (req.user.institutionId && String(version.institutionId) !== String(req.user.institutionId)) {
        return sendError(res, 'FORBIDDEN', 'Cannot access roster version of another institution.', 403);
      }
    }

    const [seal, anchor] = await Promise.all([
      IntegritySeal.findOne({ rosterVersionId: version._id }).lean(),
      SealAnchor.findOne({ rosterVersionId: version._id }).lean()
    ]);

    return sendSuccess(
      res,
      {
        version,
        seal: seal || null,
        anchor: anchor || null,
        isSealed: !!seal,
        isAnchored: !!anchor
      },
      200
    );
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/roster-versions/:id/compare
 * Compares version against its predecessor or an explicitly requested version.
 */
async function handleCompareVersions(req, res, next) {
  try {
    const { withVersionId, page = 1, limit = 50 } = req.query;

    const diffResult = await compareRosterVersions({
      currentVersionId: req.params.id,
      previousVersionId: withVersionId || null,
      page,
      limit,
      user: req.user
    });

    return sendSuccess(res, diffResult, 200);
  } catch (err) {
    if (err.statusCode === 403 || err.code === 'FORBIDDEN') {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404 || err.code === 'NOT_FOUND' || err.name === 'CastError') {
      return sendError(res, 'NOT_FOUND', err.message || 'Resource not found.', 404);
    }
    next(err);
  }
}

/**
 * GET /api/v1/roster-versions/:id/impact
 * Retrieves change blast-radius assessment and affected outputs.
 */
async function handleGetImpact(req, res, next) {
  try {
    const impact = await getImpactByVersionId(req.params.id, req.user);
    return sendSuccess(res, impact, 200);
  } catch (err) {
    if (err.statusCode === 403 || err.code === 'FORBIDDEN') {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404 || err.code === 'NOT_FOUND' || err.name === 'CastError') {
      return sendError(res, 'NOT_FOUND', err.message || 'Resource not found.', 404);
    }
    next(err);
  }
}

/**
 * GET /api/v1/roster-versions/:id/seal
 * Retrieves cryptographic Merkle seal manifest.
 */
async function handleGetSeal(req, res, next) {
  try {
    const version = await RosterVersion.findById(req.params.id).lean();
    if (!version) {
      return sendError(res, 'NOT_FOUND', `RosterVersion ${req.params.id} not found.`, 404);
    }

    if (['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(req.user.role)) {
      if (req.user.institutionId && String(version.institutionId) !== String(req.user.institutionId)) {
        return sendError(res, 'FORBIDDEN', 'Cannot access seal of another institution.', 403);
      }
    }

    const seal = await IntegritySeal.findOne({ rosterVersionId: version._id }).lean();
    if (!seal) {
      return sendError(res, 'NOT_FOUND', 'Seal manifest not found for this version.', 404);
    }

    return sendSuccess(res, seal, 200);
  } catch (err) {
    if (err.statusCode === 403 || err.code === 'FORBIDDEN') {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404 || err.code === 'NOT_FOUND' || err.name === 'CastError') {
      return sendError(res, 'NOT_FOUND', err.message || 'Resource not found.', 404);
    }
    next(err);
  }
}

/**
 * GET /api/v1/roster-versions/:id/receipt
 * Retrieves or downloads signed cryptographic commitment receipt.
 */
async function handleGetReceipt(req, res, next) {
  try {
    const receipt = await generateRosterReceipt(req.params.id, req.user);
    return sendSuccess(res, receipt, 200);
  } catch (err) {
    if (err.statusCode === 403 || err.code === 'FORBIDDEN') {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404 || err.code === 'NOT_FOUND' || err.name === 'CastError') {
      return sendError(res, 'NOT_FOUND', err.message || 'Resource not found.', 404);
    }
    next(err);
  }
}

/**
 * POST /api/v1/roster-versions/:id/verify-seal
 * Executes full cryptographic seal verification.
 */
async function handleVerifySeal(req, res, next) {
  try {
    const result = await verifyRosterSeal(req.params.id, req.user);
    return sendSuccess(res, result, 200);
  } catch (err) {
    if (err.statusCode === 403 || err.code === 'FORBIDDEN') {
      return sendError(res, 'FORBIDDEN', err.message, 403);
    }
    if (err.statusCode === 404 || err.code === 'NOT_FOUND' || err.name === 'CastError') {
      return sendError(res, 'NOT_FOUND', err.message || 'Resource not found.', 404);
    }
    next(err);
  }
}

/**
 * POST /api/v1/roster-versions/:id/revalidate
 * Triggers revalidation for a supported stale output.
 */
async function handleRevalidateOutput(req, res, next) {
  try {
    if (req.user.role === 'AUDITOR') {
      return sendError(res, 'FORBIDDEN', 'Auditors are read-only and cannot trigger revalidation.', 403);
    }

    const { outputType, outputId } = req.body;
    if (!outputType || !outputId) {
      return sendError(res, 'VALIDATION_ERROR', 'outputType and outputId are required.', 400);
    }

    const result = await revalidateOutput({ outputType, outputId, user: req.user });
    return sendSuccess(res, result, 200);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleListVersions,
  handleGetChainHead,
  handleGetVersion,
  handleCompareVersions,
  handleGetImpact,
  handleGetSeal,
  handleGetReceipt,
  handleVerifySeal,
  handleRevalidateOutput
};
