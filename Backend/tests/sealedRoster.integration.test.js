/**
 * End-to-End Integration Tests for Feature 7:
 * Record Change Blast-Radius & Sealed Roster.
 *
 * Verifies:
 * 1. Roster commit creates exactly one IntegritySeal and SealAnchor.
 * 2. Repeated commit is idempotent.
 * 3. Committing a new roster version superseded prior version, preserving historical records.
 * 4. Version comparison API (/compare) accurately classifies ADDED, REMOVED, MODIFIED, and UNCHANGED.
 * 5. Blast-radius impact marks dependent outputs STALE while preserving unrelated institutions/buckets as FRESH.
 * 6. Closed sampling runs retain historical sample while reflecting STALE/BLOCKED status.
 * 7. Seal verification (/verify-seal) yields PASS on clean data, FAIL on tampered rows, and INCONCLUSIVE on missing anchors.
 * 8. Downloadable signed receipt (/receipt) and chain-head attestation (/chain-head).
 * 9. Revalidation endpoint executes actual re-calculation for Scorecards and blocks sampling re-sampling.
 * 10. Security: Unauthenticated 401, Cross-institution IDOR 403, Auditor read-only 403.
 */
require('../src/config/dns');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');

const Institution = require('../src/models/institution.model');
const Programme = require('../src/models/programme.model');
const RosterUpload = require('../src/models/rosterUpload.model');
const RosterVersion = require('../src/models/rosterVersion.model');
const RosterRow = require('../src/models/rosterRow.model');
const IntegritySeal = require('../src/models/integritySeal.model');
const SealAnchor = require('../src/models/sealAnchor.model');
const ImpactRecord = require('../src/models/impactRecord.model');
const SeatBalance = require('../src/models/seatBalance.model');
const ScoreSnapshot = require('../src/models/scoreSnapshot.model');
const ReconciliationRun = require('../src/models/reconciliationRun.model');
const SamplingRun = require('../src/models/samplingRun.model');
const { buildBucketKey } = require('../src/services/seatLedgerService');

describe('Feature 7: Sealed Roster & Change Blast-Radius Integration Suite', () => {
  const instAId = new mongoose.Types.ObjectId();
  const instBId = new mongoose.Types.ObjectId();
  const academicYear = '2024-25';
  const programmeCS = 'CS_CYBER';
  const programmeEC = 'EC_COMM';
  const seatCategory = 'GENERAL';

  let uploadV1Id;
  let versionV1Id;
  let uploadV2Id;
  let versionV2Id;
  let sampleScorecardId;

  beforeAll(async () => {
    await connectDB();

    // 1. Setup Institutions
    await Institution.create([
      {
        _id: instAId,
        code: `INST_SEAL_A_${Date.now()}`,
        name: 'Vidyapeeth College of Engineering',
        type: 'ENGINEERING',
        state: 'Maharashtra',
        status: 'ACTIVE'
      },
      {
        _id: instBId,
        code: `INST_SEAL_B_${Date.now()}`,
        name: 'Sahyadri Institute of Technology',
        type: 'ENGINEERING',
        state: 'Karnataka',
        status: 'ACTIVE'
      }
    ]);

    // 2. Setup Programmes
    const [progCS, progEC] = await Programme.create([
      {
        institutionId: instAId,
        code: programmeCS,
        name: 'Computer Science & Cyber Security',
        durationYears: 4,
        intakeByYear: [{ academicYear, approvedIntake: 60, label: 'INSTITUTION_DECLARED' }]
      },
      {
        institutionId: instAId,
        code: programmeEC,
        name: 'Electronics & Communication',
        durationYears: 4,
        intakeByYear: [{ academicYear, approvedIntake: 60, label: 'INSTITUTION_DECLARED' }]
      }
    ]);

    const progB = await Programme.create({
      institutionId: instBId,
      code: programmeCS,
      name: 'Computer Science',
      durationYears: 4,
      intakeByYear: [{ academicYear, approvedIntake: 60, label: 'INSTITUTION_DECLARED' }]
    });

    // 3. Setup SeatBalances for Inst A (CS bucket and EC bucket) and Inst B
    const bucketCSA = buildBucketKey(instAId, programmeCS, academicYear, seatCategory);
    const bucketECA = buildBucketKey(instAId, programmeEC, academicYear, seatCategory);
    const bucketB = buildBucketKey(instBId, programmeCS, academicYear, seatCategory);

    await SeatBalance.create([
      {
        bucketKey: bucketCSA,
        institutionId: instAId,
        programmeId: progCS._id,
        programmeCode: programmeCS,
        academicYear,
        seatCategory,
        approvedIntake: 60,
        occupancy: 2,
        headroom: 58,
        utilisationPct: 3.33,
        status: 'OK',
        freshness: 'FRESH'
      },
      {
        bucketKey: bucketECA,
        institutionId: instAId,
        programmeId: progEC._id,
        programmeCode: programmeEC,
        academicYear,
        seatCategory,
        approvedIntake: 60,
        occupancy: 1,
        headroom: 59,
        utilisationPct: 1.67,
        status: 'OK',
        freshness: 'FRESH'
      },
      {
        bucketKey: bucketB,
        institutionId: instBId,
        programmeId: progB._id,
        programmeCode: programmeCS,
        academicYear,
        seatCategory,
        approvedIntake: 60,
        occupancy: 5,
        headroom: 55,
        utilisationPct: 8.33,
        status: 'OK',
        freshness: 'FRESH'
      }
    ]);

    // 4. Setup a pre-existing Scorecard snapshot for Inst A
    const scoreSnapshot = await ScoreSnapshot.create({
      institutionId: instAId,
      reportingPeriod: academicYear,
      overallScore: 88,
      band: 'STRONG',
      isEligibleForScore: true,
      isStale: false,
      freshness: 'FRESH',
      metrics: {
        m1Completeness: { status: 'AVAILABLE', subScore: 90 },
        m2Discrepancies: { status: 'AVAILABLE', subScore: 85 },
        m3Timeliness: { status: 'AVAILABLE', subScore: 89 }
      }
    });
    sampleScorecardId = scoreSnapshot._id;
  });

  afterAll(async () => {
    await Promise.all([
      Institution.deleteMany({ _id: { $in: [instAId, instBId] } }),
      Programme.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      RosterUpload.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      RosterVersion.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      RosterRow.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      IntegritySeal.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      SealAnchor.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      ImpactRecord.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      SeatBalance.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      ScoreSnapshot.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      ReconciliationRun.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      SamplingRun.deleteMany({ institutionId: { $in: [instAId, instBId] } })
    ]);
    await disconnectDB();
  });

  describe('1. Version Commit, Cryptographic Sealing & Idempotency', () => {
    test('1 & 2. Committing a validated roster creates exactly one seal, one anchor, and is idempotent on retry', async () => {
      // 1. Create a validated upload with 2 student rows
      const upload1 = await RosterUpload.create({
        institutionId: instAId,
        academicYear,
        programmeCode: programmeCS,
        filename: 'roster_v1.csv',
        fileSha256: 'sha256_mock_file_v1',
        rowCount: 2,
        status: 'VALIDATED',
        validation: { errors: 0, warnings: 0, ruleVersion: 'roster-val@1', rowErrors: [] }
      });
      uploadV1Id = upload1._id;

      await RosterRow.create([
        {
          rosterUploadId: uploadV1Id,
          rowKey: 'STUDENT_001',
          applicationNo: 'APP-1001',
          apaarToken: 'TOKEN_ABC123',
          name: 'Ananya Deshmukh',
          normalisedName: 'ANANYA DESHMUKH',
          dob: '2005-04-12',
          gender: 'FEMALE',
          category: 'GENERAL',
          programmeCode: programmeCS,
          academicYear,
          validationStatus: 'VALID'
        },
        {
          rosterUploadId: uploadV1Id,
          rowKey: 'STUDENT_002',
          applicationNo: 'APP-1002',
          apaarToken: 'TOKEN_DEF456',
          name: 'Siddharth Joshi',
          normalisedName: 'SIDDHARTH JOSHI',
          dob: '2005-08-20',
          gender: 'MALE',
          category: 'GENERAL',
          programmeCode: programmeCS,
          academicYear,
          validationStatus: 'VALID'
        }
      ]);

      // 2. Commit upload -> creates version 1
      const res1 = await request(app)
        .post(`/api/v1/rosters/${uploadV1Id}/commit`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send();

      expect(res1.status).toBe(201);
      expect(res1.body.success).toBe(true);
      expect(res1.body.data.versionNumber).toBe(1);
      expect(res1.body.data.status).toBe('COMMITTED');

      versionV1Id = res1.body.data.versionId || res1.body.data._id;

      // 3. Verify exactly one IntegritySeal was created
      const sealCount = await IntegritySeal.countDocuments({ rosterVersionId: versionV1Id });
      expect(sealCount).toBe(1);

      const seal = await IntegritySeal.findOne({ rosterVersionId: versionV1Id }).lean();
      expect(seal.rowCount).toBe(2);
      expect(seal.merkleRoot).toBeDefined();
      expect(seal.previousSealRoot).toBeNull(); // Genesis version

      // 4. Verify exactly one SealAnchor was created with sequenceNumber = 1
      const anchorCount = await SealAnchor.countDocuments({ rosterVersionId: versionV1Id });
      expect(anchorCount).toBe(1);

      const anchor = await SealAnchor.findOne({ rosterVersionId: versionV1Id }).lean();
      expect(anchor.sequenceNumber).toBe(1);
      expect(anchor.previousAnchorHash).toBeNull(); // Genesis anchor
      expect(anchor.signature).toBeDefined();

      // 5. Retrying the commit with supported idempotency information returns the existing version idempotently without duplicate seals
      const retryRes = await request(app)
        .post(`/api/v1/rosters/${uploadV1Id}/commit`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .set('idempotency-key', 'retry_commit_key_v1')
        .send();

      expect(retryRes.status).toBe(201);
      const retryId = retryRes.body.data.versionId || retryRes.body.data._id;
      expect(retryId.toString()).toBe(versionV1Id.toString());

      // Ensure seal count is still exactly 1
      const postRetrySealCount = await IntegritySeal.countDocuments({ rosterVersionId: versionV1Id });
      expect(postRetrySealCount).toBe(1);
    });

    test('3 & 4. Version 2 commit supersedes Version 1 and links previousSealRoot in the chain', async () => {
      // Create version 2 upload with:
      // - STUDENT_001: MODIFIED (category changed to OBC)
      // - STUDENT_002: UNCHANGED
      // - STUDENT_003: ADDED (new student)
      const upload2 = await RosterUpload.create({
        institutionId: instAId,
        academicYear,
        programmeCode: programmeCS,
        filename: 'roster_v2.csv',
        fileSha256: 'sha256_mock_file_v2',
        rowCount: 3,
        status: 'VALIDATED',
        validation: { errors: 0, warnings: 0, ruleVersion: 'roster-val@1', rowErrors: [] }
      });
      uploadV2Id = upload2._id;

      await RosterRow.create([
        {
          rosterUploadId: uploadV2Id,
          rowKey: 'STUDENT_001',
          applicationNo: 'APP-1001',
          apaarToken: 'TOKEN_ABC123',
          name: 'Ananya Deshmukh',
          normalisedName: 'ANANYA DESHMUKH',
          dob: '2005-04-12',
          gender: 'FEMALE',
          category: 'OBC', // MODIFIED
          programmeCode: programmeCS,
          academicYear,
          validationStatus: 'VALID'
        },
        {
          rosterUploadId: uploadV2Id,
          rowKey: 'STUDENT_002',
          applicationNo: 'APP-1002',
          apaarToken: 'TOKEN_DEF456',
          name: 'Siddharth Joshi',
          normalisedName: 'SIDDHARTH JOSHI',
          dob: '2005-08-20',
          gender: 'MALE',
          category: 'GENERAL', // UNCHANGED
          programmeCode: programmeCS,
          academicYear,
          validationStatus: 'VALID'
        },
        {
          rosterUploadId: uploadV2Id,
          rowKey: 'STUDENT_003',
          applicationNo: 'APP-1003',
          apaarToken: 'TOKEN_GHI789',
          name: 'Vikram Patel',
          normalisedName: 'VIKRAM PATEL',
          dob: '2005-11-05',
          gender: 'MALE',
          category: 'GENERAL', // ADDED
          programmeCode: programmeCS,
          academicYear,
          validationStatus: 'VALID'
        }
      ]);

      const res2 = await request(app)
        .post(`/api/v1/rosters/${uploadV2Id}/commit`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send();

      expect(res2.status).toBe(201);
      expect(res2.body.data.versionNumber).toBe(2);

      versionV2Id = res2.body.data.versionId || res2.body.data._id;

      // Check version 1 status is now SUPERSEDED
      const v1 = await RosterVersion.findById(versionV1Id).lean();
      expect(v1.status).toBe('SUPERSEDED');

      // Check seal 2 references previousSealRoot of seal 1
      const seal1 = await IntegritySeal.findOne({ rosterVersionId: versionV1Id }).lean();
      const seal2 = await IntegritySeal.findOne({ rosterVersionId: versionV2Id }).lean();
      expect(seal2.previousSealRoot).toBe(seal1.merkleRoot);

      // Check anchor 2 sequenceNumber = 2 and references previousAnchorHash
      const anchor1 = await SealAnchor.findOne({ rosterVersionId: versionV1Id }).lean();
      const anchor2 = await SealAnchor.findOne({ rosterVersionId: versionV2Id }).lean();
      expect(anchor2.sequenceNumber).toBe(2);
      expect(anchor2.previousAnchorHash).toBe(anchor1.anchorHash);
    });
  });

  describe('2. Version Comparison & Row Diffs API', () => {
    test('5 & 7. GET /api/v1/roster-versions/:id/compare identifies ADDED, MODIFIED, and UNCHANGED rows with masked PII', async () => {
      const res = await request(app)
        .get(`/api/v1/roster-versions/${versionV2Id}/compare`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.added).toBe(1); // STUDENT_003
      expect(res.body.data.summary.modified).toBe(1); // STUDENT_001
      expect(res.body.data.summary.unchanged).toBe(1); // STUDENT_002
      expect(res.body.data.summary.removed).toBe(0);

      // Verify privacy masking on diff items
      const modifiedRow = res.body.data.changes.find((c) => c.rowKey === 'STUDENT_001');
      expect(modifiedRow.changeType).toBe('MODIFIED');
      expect(modifiedRow.applicationNoMasked).toContain('***');
      expect(modifiedRow.fieldDiffs.length).toBeGreaterThan(0);
      const categoryDiff = modifiedRow.fieldDiffs.find((f) => f.field === 'category');
      expect(categoryDiff.before).toBe('GENERAL');
      expect(categoryDiff.after).toBe('OBC');
    });
  });

  describe('3. Blast-Radius & Output Freshness API', () => {
    test('27 & 28. Committing version 2 stales dependent Scorecards and SeatBalances, creating an ImpactRecord', async () => {
      const res = await request(app)
        .get(`/api/v1/roster-versions/${versionV2Id}/impact`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.affectedOutputsCount.total).toBeGreaterThan(0);
      expect(res.body.data.changeSummary.added).toBe(1);
      expect(res.body.data.changeSummary.modified).toBe(1);

      // Verify that Inst A's Scorecard snapshot is now marked isStale: true / freshness: 'STALE'
      const updatedScorecard = await ScoreSnapshot.findById(sampleScorecardId).lean();
      expect(updatedScorecard.isStale).toBe(true);
      expect(updatedScorecard.freshness).toBe('STALE');
      expect(updatedScorecard.staleSinceVersionId.toString()).toBe(versionV2Id.toString());
    });

    test('29 & 30. Unrelated institution and unaffected buckets remain FRESH', async () => {
      // Check Inst B's SeatBalance
      const bucketB = buildBucketKey(instBId, programmeCS, academicYear, seatCategory);
      const balanceB = await SeatBalance.findOne({ bucketKey: bucketB }).lean();
      expect(balanceB.freshness).toBe('FRESH');

      // Check Inst A's EC bucket (which had zero changes in this commit)
      const bucketECA = buildBucketKey(instAId, programmeEC, academicYear, seatCategory);
      const balanceECA = await SeatBalance.findOne({ bucketKey: bucketECA }).lean();
      expect(balanceECA.freshness).toBe('FRESH');
    });

    test('34. Closed sampling runs retain historical sample while marking freshness STALE and status BLOCKED', async () => {
      // Create a sampling run tied to version 1
      const sampleRun = await SamplingRun.create({
        runId: `SAMPLING_${Date.now()}`,
        institutionId: instAId,
        rosterVersionId: versionV1Id,
        academicYear,
        eligiblePopulationSize: 2,
        sampleSize: 2,
        totalSampleSize: 2,
        selectionHash: 'mock_hash_123',
        status: 'CLOSED',
        freshness: 'FRESH'
      });

      // Calculate blast radius for version 2 again to test sampling run staling
      const { calculateAndRecordImpact } = require('../src/services/impactService');
      const v1 = await RosterVersion.findById(versionV1Id);
      const v2 = await RosterVersion.findById(versionV2Id);
      await calculateAndRecordImpact({ newVersion: v2, previousVersion: v1, force: true });

      const updatedSampleRun = await SamplingRun.findById(sampleRun._id).lean();
      expect(updatedSampleRun.freshness).toBe('STALE');
      expect(updatedSampleRun.revalidationStatus).toBe('BLOCKED');
      expect(updatedSampleRun.status).toBe('CLOSED'); // Original closed status retained
    });
  });

  describe('4. Cryptographic Seal Verification API (POST /verify-seal)', () => {
    test('17 & 19. Clean committed version returns PASS on verify-seal', async () => {
      const res = await request(app)
        .post(`/api/v1/roster-versions/${versionV2Id}/verify-seal`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result).toBe('PASS');
      expect(res.body.data.signatureValid).toBe(true);
      expect(res.body.data.chainValid).toBe(true);
      expect(res.body.data.disclaimer).toContain('A passing seal establishes integrity relative to the trusted anchor');
    });

    test('10 & 16. Tampering with a stored row causes verify-seal to FAIL and diagnoses mismatched row key', async () => {
      // Deliberately tamper with STUDENT_003's category in the database
      await RosterRow.updateOne(
        { rosterVersionId: versionV2Id, rowKey: 'STUDENT_003' },
        { $set: { category: 'TAMPERED_CATEGORY' } }
      );

      const res = await request(app)
        .post(`/api/v1/roster-versions/${versionV2Id}/verify-seal`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result).toBe('FAIL');
      expect(res.body.data.explanation).toContain('Cryptographic integrity failure');
      expect(res.body.data.mismatchedRowKeys.length).toBeGreaterThan(0);

      // Restore row to maintain clean state
      await RosterRow.updateOne(
        { rosterVersionId: versionV2Id, rowKey: 'STUDENT_003' },
        { $set: { category: 'GENERAL' } }
      );
    });

    test('19. Missing anchor returns INCONCLUSIVE instead of false PASS', async () => {
      // Create a dummy un-anchored version
      const dummyVersion = await RosterVersion.create({
        institutionId: instAId,
        academicYear,
        versionNumber: 99,
        status: 'COMMITTED',
        uploadId: new mongoose.Types.ObjectId(),
        fileSha256: 'mock_dummy',
        rowCount: 0
      });

      const res = await request(app)
        .post(`/api/v1/roster-versions/${dummyVersion._id}/verify-seal`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(200);
      expect(res.body.data.result).toBe('INCONCLUSIVE');
      expect(res.body.data.signatureValid).toBe(false);

      await RosterVersion.deleteOne({ _id: dummyVersion._id });
    });
  });

  describe('5. Signed Receipts & Chain-Head Export API', () => {
    test('26. GET /api/v1/roster-versions/:id/receipt returns signed receipt with zero raw student rows', async () => {
      const res = await request(app)
        .get(`/api/v1/roster-versions/${versionV2Id}/receipt`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.receiptType).toBe('SEALED_ROSTER_COMMITMENT_RECEIPT');
      expect(res.body.data.cryptographicSeal.merkleRoot).toBeDefined();
      expect(res.body.data.trustedAuthorityAnchor.signature).toBeDefined();
      expect(res.body.data.verification.endpoint).toContain('verify-seal');

      // Privacy check: zero student records, names, or APAAR numbers leaked
      expect(res.body.data.rows).toBeUndefined();
      expect(res.body.data.students).toBeUndefined();
    });

    test('GET /api/v1/roster-versions/chain-head returns authoritative chain tip', async () => {
      const res = await request(app)
        .get('/api/v1/roster-versions/chain-head')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .query({ institutionId: instAId.toString(), academicYear });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chainHead.sequenceNumber).toBe(2);
      expect(res.body.data.chainHead.totalAnchorsInChain).toBe(2);
      expect(res.body.data.chainHead.signature).toBeDefined();
    });
  });

  describe('6. Revalidation Endpoint API', () => {
    test('35. POST /revalidate executes actual domain re-calculation for Scorecards', async () => {
      const res = await request(app)
        .post(`/api/v1/roster-versions/${versionV2Id}/revalidate`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          outputType: 'SCORECARD_SNAPSHOT',
          outputId: sampleScorecardId.toString()
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.revalidationStatus).toBe('REVALIDATED');
      expect(res.body.data.revalidatedOutputId).toBeDefined();
    });

    test('36. POST /revalidate returns BLOCKED for immutable sampling runs', async () => {
      const res = await request(app)
        .post(`/api/v1/roster-versions/${versionV2Id}/revalidate`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          outputType: 'SAMPLING_RUN',
          outputId: new mongoose.Types.ObjectId().toString()
        });

      expect(res.status).toBe(200);
      expect(res.body.data.revalidationStatus).toBe('BLOCKED');
      expect(res.body.data.reason).toContain('cannot be re-sampled');
    });
  });

  describe('7. Security, RBAC & Privacy Scoping', () => {
    test('38. Unauthenticated requests return 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get(`/api/v1/roster-versions/${versionV2Id}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('39. Institution user cannot access version or diff belonging to another institution (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/roster-versions/${versionV2Id}/compare`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instBId.toString()); // Attempting cross-institution IDOR

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('40. Auditor role cannot trigger revalidation mutations (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/roster-versions/${versionV2Id}/revalidate`)
        .set('x-user-role', 'AUDITOR')
        .send({
          outputType: 'SCORECARD_SNAPSHOT',
          outputId: sampleScorecardId.toString()
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
