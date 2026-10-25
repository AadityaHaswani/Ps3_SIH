/**
 * Anchor Service.
 * Implements the trusted, signed anchor layer for IntegritySeals.
 * Enforces an append-only, tamper-evident hash chain signed with Ed25519 digital signatures.
 *
 * TRUST MODEL:
 * - The uploading institution is NOT the sole holder of seal records.
 * - Central authority anchors the manifest hash, sequence number, and preceding anchor hash.
 * - Idempotent commits reuse existing anchors and prevent chain forking.
 */
const { v4: uuidv4 } = require('uuid');
const SealAnchor = require('../models/sealAnchor.model');
const { signAnchorPayload } = require('../utils/sealCrypto');
const { logAuditEvent } = require('./auditService');

/**
 * Creates and signs an anchor for an IntegritySeal manifest.
 *
 * @param {Object} seal - IntegritySeal document
 * @param {Object} rosterVersion - RosterVersion document
 * @param {Object} [user] - Authenticated user context
 * @returns {Promise<Object>} Created or existing SealAnchor document
 */
async function anchorSeal(seal, rosterVersion, user = {}) {
  if (!seal || !seal._id || !rosterVersion || !rosterVersion._id) {
    throw new Error('Valid IntegritySeal and RosterVersion are required for anchoring.');
  }

  // 1. Idempotency check: if anchor already exists for this version, return it
  const existingAnchor = await SealAnchor.findOne({ rosterVersionId: rosterVersion._id });
  if (existingAnchor) {
    return existingAnchor;
  }

  // 2. Resolve preceding anchor in the hash chain for this institution and academic year
  const latestAnchor = await SealAnchor.findOne({
    institutionId: rosterVersion.institutionId,
    academicYear: rosterVersion.academicYear
  })
    .sort({ sequenceNumber: -1 })
    .lean();

  const sequenceNumber = latestAnchor ? latestAnchor.sequenceNumber + 1 : 1;
  const previousAnchorHash = latestAnchor ? latestAnchor.anchorHash : null;

  // 3. Construct canonical anchor payload and sign with platform Ed25519 key
  const anchorPayload = {
    institutionId: rosterVersion.institutionId,
    academicYear: rosterVersion.academicYear,
    rosterVersionId: rosterVersion._id,
    sequenceNumber,
    manifestHash: seal.manifestHash,
    sealRoot: seal.merkleRoot,
    previousAnchorHash
  };

  const { signature, anchorHash, signingKeyVersion, signerIdentity } = signAnchorPayload(anchorPayload);

  // 4. Create immutable SealAnchor document
  const anchor = await SealAnchor.create({
    anchorId: `anchor_${uuidv4()}`,
    rosterVersionId: rosterVersion._id,
    sealId: seal._id,
    institutionId: rosterVersion.institutionId,
    academicYear: rosterVersion.academicYear,
    sequenceNumber,
    manifestHash: seal.manifestHash,
    sealRoot: seal.merkleRoot,
    previousAnchorHash,
    anchorHash,
    signingKeyVersion,
    signature,
    signerIdentity,
    anchoredAt: new Date(),
    status: 'COMMITTED',
    history: [
      {
        action: 'ANCHOR_CREATED',
        at: new Date(),
        by: user.id || 'system',
        notes: `Anchor seq=${sequenceNumber} created for roster v${rosterVersion.versionNumber}`
      }
    ]
  });

  // 5. Log canonical audit event
  await logAuditEvent({
    action: 'SEAL_ANCHOR_CREATED',
    entityType: 'SealAnchor',
    entityId: anchor._id,
    institutionId: rosterVersion.institutionId,
    performedBy: user,
    details: {
      rosterVersionId: rosterVersion._id,
      anchorId: anchor.anchorId,
      sequenceNumber,
      anchorHash,
      previousAnchorHash,
      signingKeyVersion
    }
  });

  return anchor;
}

/**
 * Retrieves the latest anchor (chain head) for an institution and academic year.
 */
async function getLatestAnchor(institutionId, academicYear) {
  return SealAnchor.findOne({ institutionId, academicYear }).sort({ sequenceNumber: -1 }).lean();
}

/**
 * Retrieves complete anchor chain for an institution and academic year.
 */
async function listAnchors(institutionId, academicYear) {
  return SealAnchor.find({ institutionId, academicYear }).sort({ sequenceNumber: 1 }).lean();
}

module.exports = {
  anchorSeal,
  getLatestAnchor,
  listAnchors
};
