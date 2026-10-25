/**
 * Merkle Tree and Row Canonicalisation Utility.
 * Implements deterministic domain-separated SHA-256 Merkle tree calculation for Sealed Rosters.
 *
 * SPECIFICATION RULES:
 * 1. Leaf Hash: SHA-256(0x00 || canonicalRowUtf8Bytes)
 * 2. Internal Node Hash: SHA-256(0x01 || leftHashHex || rightHashHex)
 * 3. Odd Node Rule: Unpaired node at the end of an odd layer is PROMOTED directly to the next layer.
 * 4. Empty Roster Rule: SHA-256(0x00 || 'EMPTY_ROSTER_V1')
 * 5. Strict Allow-List: Names, contacts, notes, and internal MongoDB metadata are strictly excluded.
 */
const crypto = require('crypto');

const PREFIX_LEAF = Buffer.from([0x00]);
const PREFIX_INTERNAL = Buffer.from([0x01]);
const SEAL_SCHEMA_VERSION = 'v1.0';

/**
 * Deterministically canonicalises a student roster row into a sorted JSON string.
 * Strips personal identifiers (raw names, phone numbers, email, notes) and internal DB properties.
 *
 * @param {Object} row - RosterRow document or plain object
 * @returns {string} Canonical UTF-8 string
 */
function canonicalizeRow(row) {
  if (!row || typeof row !== 'object') {
    return JSON.stringify({ sealSchemaVersion: SEAL_SCHEMA_VERSION });
  }

  // Canonical allowlist: explicitly sorted alphabetically
  const canonicalObj = {
    academicYear: row.academicYear ? String(row.academicYear).trim() : '',
    admissionDate: row.admissionDate ? String(row.admissionDate).trim() : '',
    admissionQuota: row.admissionQuota ? String(row.admissionQuota).trim().toUpperCase() : 'STATE_MERIT',
    apaarToken: row.apaarToken ? String(row.apaarToken).trim() : '',
    applicationNo: row.applicationNo ? String(row.applicationNo).trim() : '',
    category: row.category ? String(row.category).trim().toUpperCase() : 'GENERAL',
    dob: row.dob ? String(row.dob).trim() : '',
    gender: row.gender ? String(row.gender).trim().toUpperCase() : 'OTHER',
    programmeCode: row.programmeCode ? String(row.programmeCode).trim().toUpperCase() : '',
    rowKey: row.rowKey ? String(row.rowKey).trim() : '',
    sealSchemaVersion: SEAL_SCHEMA_VERSION,
    validationStatus: row.validationStatus ? String(row.validationStatus).trim().toUpperCase() : 'VALID'
  };

  return JSON.stringify(canonicalObj);
}

/**
 * Computes leaf hash with domain separation prefix 0x00.
 *
 * @param {string} canonicalRowStr
 * @returns {string} Hex SHA-256 digest
 */
function computeLeafHash(canonicalRowStr) {
  const hasher = crypto.createHash('sha256');
  hasher.update(PREFIX_LEAF);
  hasher.update(Buffer.from(canonicalRowStr, 'utf8'));
  return hasher.digest('hex');
}

/**
 * Computes internal node hash with domain separation prefix 0x01.
 *
 * @param {string} leftHex - Left child hash in hex
 * @param {string} rightHex - Right child hash in hex
 * @returns {string} Hex SHA-256 digest
 */
function computeInternalHash(leftHex, rightHex) {
  const hasher = crypto.createHash('sha256');
  hasher.update(PREFIX_INTERNAL);
  hasher.update(Buffer.from(leftHex, 'hex'));
  hasher.update(Buffer.from(rightHex, 'hex'));
  return hasher.digest('hex');
}

/**
 * Builds a deterministic Merkle tree from an array of roster rows.
 *
 * @param {Array<Object>} rows - Array of RosterRow objects
 * @returns {{ merkleRoot: string, rowCount: number, leaves: Array<{ rowKey: string, leafHash: string }>, rowHashSample: Array<{ rowKey: string, leafHash: string }> }}
 */
function computeMerkleTree(rows = []) {
  if (!rows || rows.length === 0) {
    const emptyHasher = crypto.createHash('sha256');
    emptyHasher.update(PREFIX_LEAF);
    emptyHasher.update(Buffer.from('EMPTY_ROSTER_V1', 'utf8'));
    const emptyRoot = emptyHasher.digest('hex');

    return {
      merkleRoot: emptyRoot,
      rowCount: 0,
      leaves: [],
      rowHashSample: []
    };
  }

  // 1. Sort rows deterministically by rowKey (fallback: applicationNo + programmeCode)
  const sortedRows = [...rows].sort((a, b) => {
    const keyA = a.rowKey || `${a.applicationNo || ''}__${a.programmeCode || ''}`;
    const keyB = b.rowKey || `${b.applicationNo || ''}__${b.programmeCode || ''}`;
    return keyA.localeCompare(keyB);
  });

  // 2. Compute canonical leaf hashes
  const leaves = sortedRows.map((row) => {
    const rowKey = row.rowKey || `${row.applicationNo || 'UNKNOWN'}__${row.programmeCode || ''}`;
    const canonicalStr = canonicalizeRow(row);
    const leafHash = computeLeafHash(canonicalStr);
    return { rowKey, leafHash };
  });

  // 3. Build tree layer by layer
  let currentLayer = leaves.map((l) => l.leafHash);

  while (currentLayer.length > 1) {
    const nextLayer = [];

    for (let i = 0; i < currentLayer.length; i += 2) {
      if (i + 1 < currentLayer.length) {
        // Paired nodes: SHA-256(0x01 || left || right)
        nextLayer.push(computeInternalHash(currentLayer[i], currentLayer[i + 1]));
      } else {
        // ODD NODE HANDLING: Promote unpaired node directly to the next layer
        nextLayer.push(currentLayer[i]);
      }
    }

    currentLayer = nextLayer;
  }

  const merkleRoot = currentLayer[0];

  // 4. Sample row hashes (first 5 and last 5) for quick mismatch diagnostics
  const rowHashSample = [];
  if (leaves.length <= 10) {
    rowHashSample.push(...leaves);
  } else {
    rowHashSample.push(...leaves.slice(0, 5));
    rowHashSample.push(...leaves.slice(-5));
  }

  return {
    merkleRoot,
    rowCount: rows.length,
    leaves,
    rowHashSample
  };
}

module.exports = {
  SEAL_SCHEMA_VERSION,
  canonicalizeRow,
  computeLeafHash,
  computeInternalHash,
  computeMerkleTree
};
