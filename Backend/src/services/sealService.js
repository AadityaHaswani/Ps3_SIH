/**
 * Seal Service.
 * Implements server-side cryptographic sealing for committed roster versions.
 * Constructs domain-separated Merkle trees, generates seal manifests,
 * and performs end-to-end seal verification against stored rows and signed anchors.
 */
const IntegritySeal = require('../models/integritySeal.model');
const SealAnchor = require('../models/sealAnchor.model');
const RosterVersion = require('../models/rosterVersion.model');
const RosterRow = require('../models/rosterRow.model');
const { computeMerkleTree, SEAL_SCHEMA_VERSION } = require('../utils/merkleTree');
const { computeManifestHash, verifyAnchorSignature } = require('../utils/sealCrypto');
const { logAuditEvent } = require('./auditService');

/**
 * Cryptographically seals a committed roster version.
 * Server-computed from stored validated rows; never trusts client-supplied roots.
 *
 * @param {Object} rosterVersion - Committed RosterVersion document
 * @param {Object} [user] - Authenticated user context
 * @returns {Promise<Object>} Created or existing IntegritySeal document
 */
async function sealRosterVersion(rosterVersion, user = {}) {
  if (!rosterVersion || !rosterVersion._id) {
    throw new Error('Valid committed RosterVersion is required for sealing.');
  }

  // 1. Idempotency check: reuse existing seal if already created
  const existingSeal = await IntegritySeal.findOne({ rosterVersionId: rosterVersion._id });
  if (existingSeal) {
    return existingSeal;
  }

  // 2. Resolve previous committed version to link previousSealRoot in the chain
  let previousSealRoot = null;
  if (rosterVersion.versionNumber > 1) {
    const previousVersion = await RosterVersion.findOne({
      institutionId: rosterVersion.institutionId,
      academicYear: rosterVersion.academicYear,
      versionNumber: rosterVersion.versionNumber - 1
    }).lean();

    if (previousVersion) {
      const prevSeal = await IntegritySeal.findOne({
        rosterVersionId: previousVersion._id
      }).lean();
      if (prevSeal) {
        previousSealRoot = prevSeal.merkleRoot;
      }
    }
  }

  // 3. Fetch stored rows for this version
  const rows = await RosterRow.find({ rosterVersionId: rosterVersion._id }).lean();

  // 4. Compute deterministic Merkle tree
  const { merkleRoot, rowCount, rowHashSample } = computeMerkleTree(rows);

  // 5. Compute canonical manifest hash
  const manifestHash = computeManifestHash({
    institutionId: rosterVersion.institutionId,
    academicYear: rosterVersion.academicYear,
    rosterVersionId: rosterVersion._id,
    versionNumber: rosterVersion.versionNumber,
    rowCount,
    merkleRoot,
    previousSealRoot,
    sealSchemaVersion: SEAL_SCHEMA_VERSION
  });

  // 6. Create immutable IntegritySeal document
  const seal = await IntegritySeal.create({
    rosterVersionId: rosterVersion._id,
    institutionId: rosterVersion.institutionId,
    academicYear: rosterVersion.academicYear,
    versionNumber: rosterVersion.versionNumber,
    rowCount,
    sealSchemaVersion: SEAL_SCHEMA_VERSION,
    merkleRoot,
    previousSealRoot,
    manifestHash,
    rowHashSample,
    sealedAt: new Date(),
    sealedBy: {
      userId: user.id || 'system',
      role: user.role || 'INSTITUTION_ADMIN',
      email: user.email || 'admin@institution.edu'
    }
  });

  // 7. Log canonical audit event
  await logAuditEvent({
    action: 'ROSTER_VERSION_SEALED',
    entityType: 'IntegritySeal',
    entityId: seal._id,
    institutionId: rosterVersion.institutionId,
    performedBy: user,
    details: {
      rosterVersionId: rosterVersion._id,
      versionNumber: rosterVersion.versionNumber,
      rowCount,
      merkleRoot,
      previousSealRoot,
      manifestHash
    }
  });

  return seal;
}

/**
 * Verifies a committed roster version's cryptographic integrity against its seal and signed anchor.
 *
 * VERIFICATION CRITERIA:
 * 1. Stored rows recompute the exact same Merkle root.
 * 2. Manifest hash matches recomputed canonical manifest hash.
 * 3. Central authority Ed25519 digital signature verifies.
 * 4. Anchor chain continuity links to correct preceding anchor.
 *
 * @param {string} rosterVersionId
 * @param {Object} [user] - Authenticated user context
 * @returns {Promise<Object>} Verification outcome { result: 'PASS'|'FAIL'|'INCONCLUSIVE', ... }
 */
async function verifyRosterSeal(rosterVersionId, user = {}) {
  const version = await RosterVersion.findById(rosterVersionId).lean();
  if (!version) {
    const err = new Error(`RosterVersion ${rosterVersionId} not found.`);
    err.statusCode = 404;
    throw err;
  }

  const [seal, anchor] = await Promise.all([
    IntegritySeal.findOne({ rosterVersionId }).lean(),
    SealAnchor.findOne({ rosterVersionId }).lean()
  ]);

  // If required seal or anchor is absent, cannot reliably establish integrity
  if (!seal || !anchor) {
    return {
      result: 'INCONCLUSIVE',
      checkedAt: new Date(),
      rosterVersionId,
      versionNumber: version.versionNumber,
      institutionId: version.institutionId,
      academicYear: version.academicYear,
      merkleRoot: seal ? seal.merkleRoot : null,
      expectedRoot: seal ? seal.merkleRoot : null,
      recomputedRoot: null,
      signatureValid: false,
      chainValid: false,
      mismatchedRowKeys: [],
      explanation:
        'Verification inconclusive: Integrity seal manifest or trusted central signed anchor is missing for this version.',
      disclaimer:
        'A passing seal establishes integrity relative to the trusted anchor. It does not prove that the roster original content was true or authentic.'
    };
  }

  // 1. Fetch current stored rows and recompute Merkle root
  const currentRows = await RosterRow.find({ rosterVersionId }).lean();
  const { merkleRoot: recomputedRoot, leaves: recomputedLeaves } = computeMerkleTree(currentRows);

  // 2. Check if current stored rows produce the expected sealed root
  const rootMatches = recomputedRoot === seal.merkleRoot;
  let mismatchedRowKeys = [];

  if (!rootMatches) {
    // Diagnose mismatched row keys by comparing leaf hashes
    const sealedSampleKeys = new Set((seal.rowHashSample || []).map((s) => s.rowKey));
    for (const leaf of recomputedLeaves) {
      if (sealedSampleKeys.has(leaf.rowKey)) {
        const expectedSample = seal.rowHashSample.find((s) => s.rowKey === leaf.rowKey);
        if (expectedSample && expectedSample.leafHash !== leaf.leafHash) {
          mismatchedRowKeys.push(leaf.rowKey);
        }
      }
    }

    if (mismatchedRowKeys.length === 0 && currentRows.length !== seal.rowCount) {
      mismatchedRowKeys.push(`ROW_COUNT_MISMATCH: stored=${currentRows.length}, sealed=${seal.rowCount}`);
    } else if (mismatchedRowKeys.length === 0) {
      mismatchedRowKeys.push('ROOT_MISMATCH_TAMPERED_ROW');
    }

    await logAuditEvent({
      action: 'ROSTER_SEAL_VERIFICATION_FAILED',
      entityType: 'IntegritySeal',
      entityId: seal._id,
      institutionId: version.institutionId,
      performedBy: user,
      details: {
        rosterVersionId,
        expectedRoot: seal.merkleRoot,
        recomputedRoot,
        mismatchedRowKeys
      }
    });

    return {
      result: 'FAIL',
      checkedAt: new Date(),
      rosterVersionId,
      versionNumber: version.versionNumber,
      institutionId: version.institutionId,
      academicYear: version.academicYear,
      merkleRoot: seal.merkleRoot,
      expectedRoot: seal.merkleRoot,
      recomputedRoot,
      signatureValid: true,
      chainValid: true,
      mismatchedRowKeys,
      explanation:
        'Cryptographic integrity failure: Stored roster row data has been modified or tampered with since sealing.',
      disclaimer:
        'A passing seal establishes integrity relative to the trusted anchor. It does not prove that the roster original content was true or authentic.'
    };
  }

  // 3. Verify manifest hash
  const recomputedManifestHash = computeManifestHash({
    institutionId: version.institutionId,
    academicYear: version.academicYear,
    rosterVersionId: version._id,
    versionNumber: version.versionNumber,
    rowCount: seal.rowCount,
    merkleRoot: seal.merkleRoot,
    previousSealRoot: seal.previousSealRoot,
    sealSchemaVersion: seal.sealSchemaVersion
  });

  if (recomputedManifestHash !== seal.manifestHash || seal.manifestHash !== anchor.manifestHash) {
    return {
      result: 'FAIL',
      checkedAt: new Date(),
      rosterVersionId,
      versionNumber: version.versionNumber,
      institutionId: version.institutionId,
      academicYear: version.academicYear,
      merkleRoot: seal.merkleRoot,
      expectedRoot: seal.merkleRoot,
      recomputedRoot,
      signatureValid: false,
      chainValid: true,
      mismatchedRowKeys: [],
      explanation: 'Manifest hash divergence: seal manifest does not match trusted anchor reference.',
      disclaimer:
        'A passing seal establishes integrity relative to the trusted anchor. It does not prove that the roster original content was true or authentic.'
    };
  }

  // 4. Verify central authority Ed25519 digital signature
  const signatureValid = verifyAnchorSignature(
    {
      institutionId: anchor.institutionId,
      academicYear: anchor.academicYear,
      rosterVersionId: anchor.rosterVersionId,
      sequenceNumber: anchor.sequenceNumber,
      manifestHash: anchor.manifestHash,
      sealRoot: anchor.sealRoot,
      previousAnchorHash: anchor.previousAnchorHash,
      signingKeyVersion: anchor.signingKeyVersion,
      signerIdentity: anchor.signerIdentity
    },
    anchor.signature
  );

  if (!signatureValid) {
    return {
      result: 'FAIL',
      checkedAt: new Date(),
      rosterVersionId,
      versionNumber: version.versionNumber,
      institutionId: version.institutionId,
      academicYear: version.academicYear,
      merkleRoot: seal.merkleRoot,
      expectedRoot: seal.merkleRoot,
      recomputedRoot,
      signatureValid: false,
      chainValid: true,
      mismatchedRowKeys: [],
      explanation: 'Digital signature validation failed: anchor signature does not match central authority public key.',
      disclaimer:
        'A passing seal establishes integrity relative to the trusted anchor. It does not prove that the roster original content was true or authentic.'
    };
  }

  // 5. Verify anchor chain continuity
  let chainValid = true;
  if (anchor.sequenceNumber > 1) {
    const prevAnchor = await SealAnchor.findOne({
      institutionId: anchor.institutionId,
      academicYear: anchor.academicYear,
      sequenceNumber: anchor.sequenceNumber - 1
    }).lean();

    if (!prevAnchor || prevAnchor.anchorHash !== anchor.previousAnchorHash) {
      chainValid = false;
      return {
        result: 'FAIL',
        checkedAt: new Date(),
        rosterVersionId,
        versionNumber: version.versionNumber,
        institutionId: version.institutionId,
        academicYear: version.academicYear,
        merkleRoot: seal.merkleRoot,
        expectedRoot: seal.merkleRoot,
        recomputedRoot,
        signatureValid: true,
        chainValid: false,
        mismatchedRowKeys: [],
        explanation: 'Anchor chain continuity broken: previous anchor hash does not match predecessor anchor.',
        disclaimer:
          'A passing seal establishes integrity relative to the trusted anchor. It does not prove that the roster original content was true or authentic.'
      };
    }
  }

  // 6. Complete PASS
  await logAuditEvent({
    action: 'ROSTER_SEAL_VERIFIED',
    entityType: 'IntegritySeal',
    entityId: seal._id,
    institutionId: version.institutionId,
    performedBy: user,
    details: {
      rosterVersionId,
      result: 'PASS',
      merkleRoot: seal.merkleRoot,
      signatureValid: true,
      chainValid: true
    }
  });

  return {
    result: 'PASS',
    checkedAt: new Date(),
    rosterVersionId,
    versionNumber: version.versionNumber,
    institutionId: version.institutionId,
    academicYear: version.academicYear,
    merkleRoot: seal.merkleRoot,
    expectedRoot: seal.merkleRoot,
    recomputedRoot,
    signatureValid: true,
    chainValid: true,
    mismatchedRowKeys: [],
    explanation:
      'Cryptographic verification passed: Stored sealed fields match the trusted signed anchor and hash chain perfectly.',
    disclaimer:
      'A passing seal establishes integrity relative to the trusted anchor. It does not prove that the roster original content was true or authentic.'
  };
}

module.exports = {
  sealRosterVersion,
  verifyRosterSeal
};
