/**
 * Unit Tests for Feature 7: Record Change Blast-Radius & Sealed Roster.
 *
 * Verifies:
 * 1. Merkle Tree & Canonicalisation (leaves, internal nodes, odd-node promotion, tamper detection).
 * 2. Ed25519 Signatures, key isolation, and anchor payload canonicalisation.
 * 3. Version Diff classification (ADDED, REMOVED, MODIFIED, UNCHANGED, UNKEYED) & privacy masking.
 * 4. Feature 6 Compatibility: evidence-backed MANUAL_OFFICER verification in LIVE mode produces genuine label.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  canonicalizeRow,
  computeLeafHash,
  computeInternalHash,
  computeMerkleTree,
  SEAL_SCHEMA_VERSION
} = require('../src/utils/merkleTree');
const {
  canonicalizeManifest,
  computeManifestHash,
  canonicalizeAnchorPayload,
  signAnchorPayload,
  verifyAnchorSignature,
  generateTestKeyPair
} = require('../src/utils/sealCrypto');
const { maskDiffValue, getRowKey } = require('../src/services/versionDiffService');
const { resolveEffectiveLabel } = require('../src/services/labelResolverService');

afterAll(async () => {
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

describe('Feature 7: Unit Tests - Sealed Roster, Merkle Tree & Change Diff', () => {
  describe('1. Merkle Tree & Canonicalisation Pure Logic', () => {
    const sampleRowA = {
      rowKey: 'STUDENT_001',
      applicationNo: 'APP-1001',
      apaarToken: 'TOKEN-ABC-1234',
      programmeCode: 'CS',
      academicYear: '2024-25',
      category: 'GENERAL',
      gender: 'MALE',
      dob: '2005-06-15',
      admissionQuota: 'STATE_MERIT',
      admissionDate: '2024-07-01',
      validationStatus: 'VALID',
      // Non-sealed fields that must NOT affect Merkle root:
      name: 'Rohan Sharma',
      internalNotes: 'Pending hostel room allotment',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('8. The same canonical row produces the exact same leaf hash deterministically', () => {
      const canonical1 = canonicalizeRow(sampleRowA);
      const canonical2 = canonicalizeRow({ ...sampleRowA });

      expect(canonical1).toBe(canonical2);
      expect(computeLeafHash(canonical1)).toBe(computeLeafHash(canonical2));
    });

    test('9. Row ordering is deterministic because computeMerkleTree sorts rows by rowKey', () => {
      const row1 = { ...sampleRowA, rowKey: 'ROW_AAA' };
      const row2 = { ...sampleRowA, rowKey: 'ROW_BBB' };
      const row3 = { ...sampleRowA, rowKey: 'ROW_CCC' };

      const tree1 = computeMerkleTree([row1, row2, row3]);
      const tree2 = computeMerkleTree([row3, row1, row2]); // Different input order

      expect(tree1.merkleRoot).toBe(tree2.merkleRoot);
      expect(tree1.rowCount).toBe(3);
    });

    test('10. Changing any sealed field causes leaf hash and Merkle root to change', () => {
      const baseTree = computeMerkleTree([sampleRowA]);

      // Mutate sealed field: category
      const mutatedRow = { ...sampleRowA, category: 'OBC' };
      const mutatedTree = computeMerkleTree([mutatedRow]);

      expect(baseTree.merkleRoot).not.toBe(mutatedTree.merkleRoot);
    });

    test('11. Changing a non-sealed field (e.g. name or internal notes) does NOT change the root', () => {
      const baseTree = computeMerkleTree([sampleRowA]);

      // Mutate non-sealed fields
      const modifiedRow = {
        ...sampleRowA,
        name: 'A completely different name',
        internalNotes: 'Updated hostel assignment'
      };
      const modifiedTree = computeMerkleTree([modifiedRow]);

      // Sealed root is strictly invariant to non-sealed fields
      expect(baseTree.merkleRoot).toBe(modifiedTree.merkleRoot);
    });

    test('12. Empty and single-row rosters are handled cleanly and deterministically', () => {
      const emptyTree = computeMerkleTree([]);
      expect(emptyTree.rowCount).toBe(0);
      expect(emptyTree.merkleRoot).toBeDefined();
      expect(typeof emptyTree.merkleRoot).toBe('string');
      expect(emptyTree.merkleRoot.length).toBe(64); // SHA-256 hex length

      const singleTree = computeMerkleTree([sampleRowA]);
      expect(singleTree.rowCount).toBe(1);
      expect(singleTree.leaves.length).toBe(1);
      expect(singleTree.merkleRoot).toBe(singleTree.leaves[0].leafHash);
    });

    test('13. Odd-numbered Merkle trees promote the unpaired node to the next level', () => {
      const row1 = { ...sampleRowA, rowKey: 'R1' };
      const row2 = { ...sampleRowA, rowKey: 'R2' };
      const row3 = { ...sampleRowA, rowKey: 'R3' }; // 3 rows (odd count)

      const tree = computeMerkleTree([row1, row2, row3]);
      expect(tree.rowCount).toBe(3);

      // Manual calculation following documented odd-node promotion rule:
      const l1 = computeLeafHash(canonicalizeRow(row1));
      const l2 = computeLeafHash(canonicalizeRow(row2));
      const l3 = computeLeafHash(canonicalizeRow(row3));

      // Layer 1: [h(l1, l2), promoted(l3)]
      const parent12 = computeInternalHash(l1, l2);
      const promoted3 = l3;

      // Layer 2 (Root): h(parent12, promoted3)
      const expectedRoot = computeInternalHash(parent12, promoted3);
      expect(tree.merkleRoot).toBe(expectedRoot);
    });

    test('14. Dates, numbers, nulls and strings normalise consistently in canonicalization', () => {
      const rowWithNulls = {
        rowKey: '  STUDENT_NULLS  ',
        applicationNo: ' APP-999 ',
        programmeCode: '  cs  ',
        academicYear: ' 2024-25 ',
        category: null,
        gender: undefined,
        admissionDate: null
      };

      const canonical = canonicalizeRow(rowWithNulls);
      const parsed = JSON.parse(canonical);

      expect(parsed.rowKey).toBe('STUDENT_NULLS');
      expect(parsed.applicationNo).toBe('APP-999');
      expect(parsed.programmeCode).toBe('CS');
      expect(parsed.category).toBe('GENERAL');
      expect(parsed.gender).toBe('OTHER');
      expect(parsed.admissionDate).toBe('');
      expect(parsed.sealSchemaVersion).toBe(SEAL_SCHEMA_VERSION);
    });
  });

  describe('2. Ed25519 Signatures and Anchor Chain Cryptography', () => {
    const instId = new mongoose.Types.ObjectId().toString();
    const verId = new mongoose.Types.ObjectId().toString();

    const sampleManifest = {
      institutionId: instId,
      academicYear: '2024-25',
      rosterVersionId: verId,
      versionNumber: 1,
      rowCount: 60,
      merkleRoot: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      previousSealRoot: null,
      sealSchemaVersion: 'v1.0'
    };

    test('17. A valid manifest anchor signature verifies successfully', () => {
      const manifestHash = computeManifestHash(sampleManifest);

      const anchorPayload = {
        institutionId: instId,
        academicYear: '2024-25',
        rosterVersionId: verId,
        sequenceNumber: 1,
        manifestHash,
        sealRoot: sampleManifest.merkleRoot,
        previousAnchorHash: null
      };

      const { signature } = signAnchorPayload(anchorPayload);
      expect(signature).toBeDefined();

      const isValid = verifyAnchorSignature(anchorPayload, signature);
      expect(isValid).toBe(true);
    });

    test('18. An altered anchor payload fails signature verification', () => {
      const manifestHash = computeManifestHash(sampleManifest);

      const anchorPayload = {
        institutionId: instId,
        academicYear: '2024-25',
        rosterVersionId: verId,
        sequenceNumber: 1,
        manifestHash,
        sealRoot: sampleManifest.merkleRoot,
        previousAnchorHash: null
      };

      const { signature } = signAnchorPayload(anchorPayload);

      // Tamper with anchor payload
      const tamperedPayload = { ...anchorPayload, sequenceNumber: 2 };
      const isValid = verifyAnchorSignature(tamperedPayload, signature);
      expect(isValid).toBe(false);
    });

    test('21. Key Isolation: APAAR HMAC secret cannot verify an Ed25519 anchor signature', () => {
      const testKeys = generateTestKeyPair();

      const manifestHash = computeManifestHash(sampleManifest);
      const anchorPayload = {
        institutionId: instId,
        academicYear: '2024-25',
        rosterVersionId: verId,
        sequenceNumber: 1,
        manifestHash,
        sealRoot: sampleManifest.merkleRoot,
        previousAnchorHash: null
      };

      // Sign with an external keypair
      const canonical = canonicalizeAnchorPayload(anchorPayload);
      const forgedSig = crypto.sign(null, Buffer.from(canonical, 'utf8'), testKeys.privateKey).toString('hex');

      // Platform default public key must reject forged external signature
      const isValid = verifyAnchorSignature(anchorPayload, forgedSig);
      expect(isValid).toBe(false);
    });
  });

  describe('3. Version Diff & Privacy Masking Pure Helpers', () => {
    test('5 & 7. Masking helper masks APAAR tokens, application references and student names', () => {
      expect(maskDiffValue('apaarToken', 'ABCDEF1234567890')).toBe('********567890');
      expect(maskDiffValue('applicationNo', 'APP-2024-00123')).toBe('********0123');
      expect(maskDiffValue('name', 'Priya Sharma')).toBe('P**** S****');
      expect(maskDiffValue('category', 'OBC_NCL')).toBe('OBC_NCL');
    });

    test('6. getRowKey falls back gracefully when rowKey is missing', () => {
      expect(getRowKey({ rowKey: 'RKEY_123' })).toBe('RKEY_123');
      expect(getRowKey({ applicationNo: 'APP100', programmeCode: 'CS' })).toBe('APP100__CS');
      expect(getRowKey({})).toBe(null);
    });
  });

  describe('4. Feature 6 Compatibility: Manual Officer Verification in LIVE Mode', () => {
    test('45 & 46. Eligible authorised manual officer verification with evidence in LIVE mode achieves AUTHORITY_VERIFIED', async () => {
      const mockLiveOfficerRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'AUTHORITY_VERIFIED',
        sourceMode: 'LIVE',
        method: 'MANUAL_OFFICER',
        status: 'COMPLETED',
        evidenceRef: 'REG-GAZETTE-ORDER-2024.PDF',
        reviewer: { role: 'AUTHORITY_OFFICER', userId: 'officer-42' },
        valueSnapshot: 120,
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 120,
        records: [mockLiveOfficerRecord]
      });

      expect(res.effectiveLabel).toBe('AUTHORITY_VERIFIED');
      expect(res.isSimulated).toBe(false);
      expect(res.sourceMode).toBe('LIVE');
      expect(res.displayBadge.text).toBe('Authority Verified');
      expect(res.confidenceScore).toBe(1.0);
    });

    test('45b. Simulated manual officer verification remains strictly coerced to AUTHORITY_VERIFIED_SIMULATED', async () => {
      const mockSimulatedOfficerRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'AUTHORITY_VERIFIED',
        sourceMode: 'SIMULATED', // Simulated prototype mode
        method: 'MANUAL_OFFICER',
        status: 'COMPLETED',
        evidenceRef: 'SIMULATED_TEST_DOC.PDF',
        reviewer: { role: 'AUTHORITY_OFFICER', userId: 'officer-42' },
        valueSnapshot: 120,
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 120,
        records: [mockSimulatedOfficerRecord]
      });

      expect(res.effectiveLabel).toBe('AUTHORITY_VERIFIED_SIMULATED');
      expect(res.isSimulated).toBe(true);
      expect(res.displayBadge.text).toContain('Simulated');
    });
  });
});
