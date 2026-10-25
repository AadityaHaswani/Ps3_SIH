/**
 * Receipt Service.
 * Generates cryptographic signed receipts for committed sealed rosters and chain heads.
 *
 * PRIVACY & DISCLOSURE RULES:
 * - Receipts strictly omit raw student records, names, or contact details.
 * - Contain domain-separated Merkle roots, manifest hashes, and Ed25519 digital signatures.
 * - Designed for independent retention by regulatory authorities and external auditors.
 */
const RosterVersion = require('../models/rosterVersion.model');
const IntegritySeal = require('../models/integritySeal.model');
const SealAnchor = require('../models/sealAnchor.model');
const { logAuditEvent } = require('./auditService');

/**
 * Generates an on-demand signed cryptographic receipt for a committed roster version.
 *
 * @param {string} rosterVersionId
 * @param {Object} [user] - Authenticated user context
 * @returns {Promise<Object>} Cryptographic receipt payload
 */
async function generateRosterReceipt(rosterVersionId, user = {}) {
  const version = await RosterVersion.findById(rosterVersionId).lean();
  if (!version) {
    const err = new Error(`RosterVersion ${rosterVersionId} not found.`);
    err.statusCode = 404;
    throw err;
  }

  // Institution scoping check
  if (['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(user.role)) {
    if (user.institutionId && String(version.institutionId) !== String(user.institutionId)) {
      const err = new Error('Forbidden: Cannot access receipt for another institution.');
      err.statusCode = 403;
      throw err;
    }
  }

  const [seal, anchor] = await Promise.all([
    IntegritySeal.findOne({ rosterVersionId }).lean(),
    SealAnchor.findOne({ rosterVersionId }).lean()
  ]);

  if (!seal || !anchor) {
    const err = new Error('Seal manifest or anchor record not found for this version.');
    err.statusCode = 404;
    throw err;
  }

  const receipt = {
    receiptType: 'SEALED_ROSTER_COMMITMENT_RECEIPT',
    receiptId: `RECEIPT_${version._id}`,
    generatedAt: new Date(),
    institutionId: version.institutionId,
    academicYear: version.academicYear,
    rosterVersion: {
      versionId: version._id,
      versionNumber: version.versionNumber,
      status: version.status,
      rowCount: version.rowCount,
      fileSha256: version.fileSha256,
      committedAt: version.committedAt
    },
    cryptographicSeal: {
      sealId: seal._id,
      sealSchemaVersion: seal.sealSchemaVersion,
      merkleRoot: seal.merkleRoot,
      previousSealRoot: seal.previousSealRoot,
      manifestHash: seal.manifestHash,
      sealedAt: seal.sealedAt
    },
    trustedAuthorityAnchor: {
      anchorId: anchor.anchorId,
      sequenceNumber: anchor.sequenceNumber,
      anchorHash: anchor.anchorHash,
      previousAnchorHash: anchor.previousAnchorHash,
      signingKeyVersion: anchor.signingKeyVersion,
      signature: anchor.signature,
      signerIdentity: anchor.signerIdentity,
      anchoredAt: anchor.anchoredAt
    },
    verification: {
      endpoint: `/api/v1/roster-versions/${version._id}/verify-seal`,
      method: 'POST',
      instructions:
        'Submit a POST request to the verification endpoint to validate row-level Merkle integrity, manifest hash, and digital signature against stored data.'
    },
    disclaimer:
      'This receipt cryptographically proves that the roster content was sealed and anchored with the central authority at the stated timestamp. It does not establish the factual accuracy of the original institution-submitted data.'
  };

  await logAuditEvent({
    action: 'ROSTER_RECEIPT_GENERATED',
    entityType: 'IntegritySeal',
    entityId: seal._id,
    institutionId: version.institutionId,
    performedBy: user,
    details: {
      rosterVersionId: version._id,
      versionNumber: version.versionNumber,
      anchorId: anchor.anchorId
    }
  });

  return receipt;
}

/**
 * Generates an on-demand signed chain-head receipt for an institution's anchor timeline.
 * Suitable for independent external retention and chain continuity verification.
 */
async function generateChainHeadReceipt(institutionId, academicYear, user = {}) {
  // Scoping check
  if (['INSTITUTION_ADMIN', 'INSTITUTION_OPERATOR'].includes(user.role)) {
    if (user.institutionId && String(institutionId) !== String(user.institutionId)) {
      const err = new Error('Forbidden: Cannot access chain-head receipt for another institution.');
      err.statusCode = 403;
      throw err;
    }
  }

  const latestAnchor = await SealAnchor.findOne({ institutionId, academicYear })
    .sort({ sequenceNumber: -1 })
    .lean();

  if (!latestAnchor) {
    const err = new Error('No anchor records discovered for this institution and academic year.');
    err.statusCode = 404;
    throw err;
  }

  const totalAnchors = await SealAnchor.countDocuments({ institutionId, academicYear });

  return {
    receiptType: 'CHAIN_HEAD_ATTESTATION_RECEIPT',
    generatedAt: new Date(),
    institutionId,
    academicYear,
    chainHead: {
      anchorId: latestAnchor.anchorId,
      sequenceNumber: latestAnchor.sequenceNumber,
      totalAnchorsInChain: totalAnchors,
      rosterVersionId: latestAnchor.rosterVersionId,
      sealRoot: latestAnchor.sealRoot,
      manifestHash: latestAnchor.manifestHash,
      anchorHash: latestAnchor.anchorHash,
      previousAnchorHash: latestAnchor.previousAnchorHash,
      signature: latestAnchor.signature,
      signingKeyVersion: latestAnchor.signingKeyVersion,
      signerIdentity: latestAnchor.signerIdentity,
      anchoredAt: latestAnchor.anchoredAt
    },
    verificationNotice:
      'Chain-head attestation confirms the authoritative tip of the append-only roster seal anchor hash chain.'
  };
}

module.exports = {
  generateRosterReceipt,
  generateChainHeadReceipt
};
