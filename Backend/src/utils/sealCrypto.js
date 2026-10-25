/**
 * Seal Cryptography & Ed25519 Signing Utility.
 * Manages trusted platform signing keys, Ed25519 digital signatures,
 * and canonical serialization for manifests and anchor payloads.
 *
 * PRIVACY & SECURITY SAFEGUARDS:
 * - Sealing keys are strictly independent from APAAR HMAC student token secrets.
 * - Private keys are never returned, serialized in API responses, or printed in logs.
 * - In dev/test environments without configured keys, an ephemeral in-memory Ed25519
 *   keypair is generated and reused across the process lifecycle.
 */
const crypto = require('crypto');

const DEFAULT_SIGNING_KEY_VERSION = 'ed25519_v1';
const DEFAULT_SIGNER_IDENTITY = 'AICTE_CENTRAL_AUTHORITY_SIGNER';

// Stable deterministic fallback Ed25519 keypair for local/demo/test environments.
// Production deployments supply SEAL_SIGNING_PRIVATE_KEY and SEAL_SIGNING_PUBLIC_KEY via environment/vault.
const DEV_SIGNING_PRIVATE_KEY =
  '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIChYYELRAN9LZzCKprAAoI7iSDonmKMggbDh+jnpTGrq\n-----END PRIVATE KEY-----\n';
const DEV_SIGNING_PUBLIC_KEY =
  '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAx5SwhiL2G8tr2Hjl6xz7//AHmRZvb6aAz9bkeD44IBI=\n-----END PUBLIC KEY-----\n';

/**
 * Retrieves the platform Ed25519 signing keypair.
 * Reads from process.env if available; otherwise falls back to a stable deterministic dev keypair.
 *
 * @returns {{ privateKey: (KeyObject|string), publicKey: (KeyObject|string), keyVersion: string }}
 */
function getSigningKeys() {
  let envPrivate = process.env.SEAL_SIGNING_PRIVATE_KEY;
  let envPublic = process.env.SEAL_SIGNING_PUBLIC_KEY;
  const keyVersion = process.env.SEAL_SIGNING_KEY_VERSION || DEFAULT_SIGNING_KEY_VERSION;

  if (process.env.NODE_ENV === 'production') {
    if (!envPrivate || !envPublic) {
      throw new Error(
        'SECURITY_ERROR: Production environment requires explicitly configured SEAL_SIGNING_PRIVATE_KEY and SEAL_SIGNING_PUBLIC_KEY. Fallback development keys are strictly forbidden.'
      );
    }
  }

  if (envPrivate && envPublic) {
    try {
      if (typeof envPrivate === 'string' && envPrivate.includes('\\n')) {
        envPrivate = envPrivate.replace(/\\n/g, '\n');
      }
      if (typeof envPublic === 'string' && envPublic.includes('\\n')) {
        envPublic = envPublic.replace(/\\n/g, '\n');
      }
      return {
        privateKey: envPrivate,
        publicKey: envPublic,
        keyVersion
      };
    } catch (e) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `SECURITY_ERROR: Failed to parse configured Ed25519 signing keys in production: ${e.message}`
        );
      }
      // Fall through to dev keypair if env keys invalid in dev/test
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SECURITY_ERROR: Production environment requires explicitly configured SEAL_SIGNING_PRIVATE_KEY and SEAL_SIGNING_PUBLIC_KEY. Fallback development keys are strictly forbidden.'
    );
  }

  return {
    privateKey: DEV_SIGNING_PRIVATE_KEY,
    publicKey: DEV_SIGNING_PUBLIC_KEY,
    keyVersion
  };
}

/**
 * Generates an isolated test keypair (useful for testing signature failures or key rotations).
 */
function generateTestKeyPair() {
  return crypto.generateKeyPairSync('ed25519');
}

/**
 * Deterministically canonicalises an IntegritySeal manifest into a standard UTF-8 string.
 */
function canonicalizeManifest({
  institutionId,
  academicYear,
  rosterVersionId,
  versionNumber,
  rowCount,
  merkleRoot,
  previousSealRoot,
  sealSchemaVersion = 'v1.0'
}) {
  return JSON.stringify({
    academicYear: String(academicYear || '').trim(),
    institutionId: String(institutionId || '').trim(),
    merkleRoot: String(merkleRoot || '').toLowerCase().trim(),
    previousSealRoot: previousSealRoot ? String(previousSealRoot).toLowerCase().trim() : null,
    rosterVersionId: String(rosterVersionId || '').trim(),
    rowCount: Number(rowCount || 0),
    sealSchemaVersion: String(sealSchemaVersion || 'v1.0'),
    versionNumber: Number(versionNumber || 1)
  });
}

/**
 * Computes SHA-256 digest of canonical manifest bytes.
 */
function computeManifestHash(manifestPayload) {
  const canonicalStr = canonicalizeManifest(manifestPayload);
  return crypto.createHash('sha256').update(Buffer.from(canonicalStr, 'utf8')).digest('hex');
}

/**
 * Deterministically canonicalises a SealAnchor payload for signing and hashing.
 */
function canonicalizeAnchorPayload({
  institutionId,
  academicYear,
  rosterVersionId,
  sequenceNumber,
  manifestHash,
  sealRoot,
  previousAnchorHash,
  signingKeyVersion = DEFAULT_SIGNING_KEY_VERSION,
  signerIdentity = DEFAULT_SIGNER_IDENTITY
}) {
  return JSON.stringify({
    academicYear: String(academicYear || '').trim(),
    institutionId: String(institutionId || '').trim(),
    manifestHash: String(manifestHash || '').toLowerCase().trim(),
    previousAnchorHash: previousAnchorHash ? String(previousAnchorHash).toLowerCase().trim() : null,
    rosterVersionId: String(rosterVersionId || '').trim(),
    sealRoot: String(sealRoot || '').toLowerCase().trim(),
    sequenceNumber: Number(sequenceNumber || 1),
    signerIdentity: String(signerIdentity || DEFAULT_SIGNER_IDENTITY).trim(),
    signingKeyVersion: String(signingKeyVersion || DEFAULT_SIGNING_KEY_VERSION).trim()
  });
}

/**
 * Signs canonical anchor payload with Ed25519 private key.
 *
 * @param {Object} anchorPayload
 * @param {KeyObject|string} [overridePrivateKey]
 * @returns {{ signature: string, anchorHash: string, signingKeyVersion: string, signerIdentity: string }}
 */
function signAnchorPayload(anchorPayload, overridePrivateKey = null) {
  const { privateKey, keyVersion } = getSigningKeys();
  const keyToUse = overridePrivateKey || privateKey;

  const canonicalBytes = canonicalizeAnchorPayload({
    ...anchorPayload,
    signingKeyVersion: anchorPayload.signingKeyVersion || keyVersion
  });

  const signature = crypto
    .sign(null, Buffer.from(canonicalBytes, 'utf8'), keyToUse)
    .toString('hex');

  const anchorHash = crypto
    .createHash('sha256')
    .update(Buffer.from(canonicalBytes, 'utf8'))
    .digest('hex');

  return {
    signature,
    anchorHash,
    signingKeyVersion: anchorPayload.signingKeyVersion || keyVersion,
    signerIdentity: anchorPayload.signerIdentity || DEFAULT_SIGNER_IDENTITY
  };
}

/**
 * Verifies an Ed25519 signature on an anchor payload.
 *
 * @param {Object} anchorPayload
 * @param {string} signatureHex
 * @param {KeyObject|string} [overridePublicKey]
 * @returns {boolean} True if signature is cryptographically valid
 */
function verifyAnchorSignature(anchorPayload, signatureHex, overridePublicKey = null) {
  try {
    const { publicKey } = getSigningKeys();
    const keyToUse = overridePublicKey || publicKey;

    const canonicalBytes = canonicalizeAnchorPayload(anchorPayload);
    const signatureBuffer = Buffer.from(signatureHex, 'hex');

    return crypto.verify(null, Buffer.from(canonicalBytes, 'utf8'), keyToUse, signatureBuffer);
  } catch (err) {
    return false;
  }
}

module.exports = {
  getSigningKeys,
  generateTestKeyPair,
  canonicalizeManifest,
  computeManifestHash,
  canonicalizeAnchorPayload,
  signAnchorPayload,
  verifyAnchorSignature,
  DEFAULT_SIGNING_KEY_VERSION,
  DEFAULT_SIGNER_IDENTITY
};
