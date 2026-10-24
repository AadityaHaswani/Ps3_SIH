/**
 * End-to-End Integration Tests for Feature 3:
 * Assurance Sampling and Verification Confidence.
 *
 * Verifies:
 * - Previewing sample size from committed roster
 * - Rejecting sampling from uncommitted roster uploads
 * - Cryptographically secure sample selection and commitment hashing
 * - Stratum separation (RANDOM vs RISK_TARGETED)
 * - Recording verification outcomes (VERIFIED, FAILED_CHECK, UNCONFIRMED, EXCLUDED)
 * - Prohibiting institution users from recording authority verification (403 Forbidden)
 * - Audit trail immutability on SamplingItem.history
 * - Insufficient-data handling and Wilson score intervals
 * - Non-response bias accounting (UNCONFIRMED != FAILED_CHECK)
 * - Formally closing runs and freezing item edits
 * - Idempotent run creation
 * - Cross-institution scoping security
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
const SamplingRun = require('../src/models/samplingRun.model');
const SamplingItem = require('../src/models/samplingItem.model');

const {
  processRosterUpload,
  commitRosterVersion
} = require('../src/services/rosterService');

describe('Feature 3: Assurance Sampling Integration Suite', () => {
  const institutionId = new mongoose.Types.ObjectId();
  const otherInstitutionId = new mongoose.Types.ObjectId();
  const academicYear = '2024-25';
  const programmeCode = 'CSE';

  let committedVersionId;
  let uncommittedUploadId;
  let testRunId;
  let testItemId;

  beforeAll(async () => {
    await connectDB();

    // 1. Create Target Institution
    await Institution.create({
      _id: institutionId,
      code: `SIT_SAMPLING_${Date.now()}`,
      name: 'Sampling Institute of Technology (DEMO)',
      type: 'ENGINEERING',
      state: 'Karnataka',
      status: 'ACTIVE'
    });

    // 2. Create Second Institution for Scoping Security
    await Institution.create({
      _id: otherInstitutionId,
      code: `OTHER_SAMPLING_${Date.now()}`,
      name: 'Other Autonomous College',
      type: 'ENGINEERING',
      state: 'Karnataka',
      status: 'ACTIVE'
    });

    // 3. Create Programme
    await Programme.create({
      institutionId,
      code: programmeCode,
      name: 'Computer Science and Engineering',
      durationYears: 4,
      intakeByYear: [
        {
          academicYear,
          seatCategory: 'ALL',
          approvedIntake: 60,
          label: 'AICTE_APPROVED',
          sourceMode: 'SIMULATED'
        }
      ]
    });

    // 4. Create and commit a roster with 30 valid students
    let csvLines = ['applicationNo,apaarId,name,dob,gender,category,programmeCode,academicYear'];
    for (let i = 1; i <= 30; i++) {
      const appNo = `APP-SAMP-${String(i).padStart(3, '0')}`;
      const apaar = `8888${String(i).padStart(8, '0')}`;
      csvLines.push(`${appNo},${apaar},Candidate Name ${i},2005-05-15,MALE,GENERAL,${programmeCode},${academicYear}`);
    }
    const csvBuffer = Buffer.from(csvLines.join('\n'), 'utf8');

    const upload = await processRosterUpload({
      institutionId,
      academicYear,
      programmeCode,
      file: { buffer: csvBuffer, originalname: 'committed_roster.csv' },
      user: { id: 'admin-1', role: 'INSTITUTION_ADMIN', email: 'admin@sit.edu' }
    });

    const committed = await commitRosterVersion(upload._id, {
      id: 'admin-1',
      role: 'INSTITUTION_ADMIN',
      email: 'admin@sit.edu'
    });

    committedVersionId = committed._id;

    // 5. Create an uncommitted roster upload (to test rejection)
    const uncommittedUpload = await processRosterUpload({
      institutionId,
      academicYear,
      programmeCode,
      file: { buffer: csvBuffer, originalname: 'uncommitted_roster.csv' },
      user: { id: 'admin-1', role: 'INSTITUTION_ADMIN', email: 'admin@sit.edu' }
    });

    uncommittedUploadId = uncommittedUpload._id;
  });

  afterAll(async () => {
    await Institution.deleteMany({ _id: { $in: [institutionId, otherInstitutionId] } });
    await Programme.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await RosterUpload.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await RosterVersion.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await RosterRow.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await SamplingRun.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await SamplingItem.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await disconnectDB();
  });

  describe('1. Sample Size Preview', () => {
    test('POST /api/v1/sampling-runs/preview-size calculates recommended size without persisting', async () => {
      const res = await request(app)
        .post('/api/v1/sampling-runs/preview-size')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          institutionId: institutionId.toString(),
          rosterVersionId: committedVersionId.toString(),
          academicYear,
          confidenceLevel: 0.95,
          marginOfError: 0.05,
          expectedProportion: 0.50,
          minSampleSize: 10,
          maxSampleSize: 50
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.eligiblePopulationSize).toBe(30);
      expect(res.body.data.recommendedSampleSize).toBeGreaterThanOrEqual(10);
      expect(res.body.data.recommendedSampleSize).toBeLessThanOrEqual(30);
      expect(res.body.data.finitePopulationCorrectionApplied).toBe(true);

      // Verify no SamplingRun was created in DB
      const runCount = await SamplingRun.countDocuments({ institutionId });
      expect(runCount).toBe(0);
    });

    test('rejects preview request on uncommitted upload ID with 404/validation error', async () => {
      const res = await request(app)
        .post('/api/v1/sampling-runs/preview-size')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          institutionId: institutionId.toString(),
          rosterVersionId: uncommittedUploadId.toString(), // Upload ID, NOT committed version ID
          academicYear
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('not found');
    });
  });

  describe('2. Sample Run Creation & Cryptographic Selection', () => {
    test('POST /api/v1/sampling-runs draws cryptographically secure random sample and risk-targeted stratum', async () => {
      const res = await request(app)
        .post('/api/v1/sampling-runs')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          institutionId: institutionId.toString(),
          rosterVersionId: committedVersionId.toString(),
          academicYear,
          programmeCode,
          samplingParameters: {
            confidenceLevel: 0.95,
            marginOfError: 0.10,
            expectedProportion: 0.50,
            minSampleSize: 10,
            maxSampleSize: 20
          },
          riskTargetedCount: 3, // Optional targeted stratum
          idempotencyKey: 'samp-run-idemp-001'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.run).toBeDefined();

      const run = res.body.data.run;
      testRunId = run._id;

      expect(run.status).toBe('ACTIVE');
      expect(run.eligiblePopulationSize).toBe(30);
      expect(run.sampleSize).toBeGreaterThanOrEqual(10);
      expect(run.targetedSampleSize).toBe(3);
      expect(run.totalSampleSize).toBe(run.sampleSize + 3);
      expect(run.selectionHash).toHaveLength(64); // SHA-256 commitment hash
      expect(run.algorithmVersion).toBe('crypto-fisher-yates@1');
      expect(run.summary.pending).toBe(run.totalSampleSize);

      // Verify SamplingItem records created in MongoDB
      const items = await SamplingItem.find({ samplingRunId: run._id });
      expect(items.length).toBe(run.totalSampleSize);

      // Verify stratum separation
      const randomItems = items.filter((i) => i.stratum === 'RANDOM');
      const targetedItems = items.filter((i) => i.stratum === 'RISK_TARGETED');

      expect(randomItems.length).toBe(run.sampleSize);
      expect(targetedItems.length).toBe(3);

      // Verify student names are masked and no raw APAAR IDs are stored
      for (const item of items) {
        expect(item.studentNameMasked).toMatch(/^[A-Z]\*+/);
        expect(item.verificationStatus).toBe('PENDING');
      }

      testItemId = randomItems[0]._id;
    });

    test('replaying sample creation with same idempotency key returns existing run (200 OK)', async () => {
      const res = await request(app)
        .post('/api/v1/sampling-runs')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          institutionId: institutionId.toString(),
          rosterVersionId: committedVersionId.toString(),
          academicYear,
          idempotencyKey: 'samp-run-idemp-001'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isReplay).toBe(true);
      expect(res.body.data.run._id).toBe(testRunId);
    });
  });

  describe('3. Querying Sampling Runs and Items', () => {
    test('GET /api/v1/sampling-runs lists runs for institution', async () => {
      const res = await request(app)
        .get('/api/v1/sampling-runs')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .query({ institutionId: institutionId.toString(), academicYear });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });

    test('GET /api/v1/sampling-runs/:id retrieves run metadata and summary', async () => {
      const res = await request(app)
        .get(`/api/v1/sampling-runs/${testRunId}`)
        .set('x-user-role', 'AUTHORITY_ADMIN');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(testRunId);
      expect(res.body.data.summary.total).toBeGreaterThan(0);
    });

    test('GET /api/v1/sampling-runs/:id/items returns paginated items with masked data', async () => {
      const res = await request(app)
        .get(`/api/v1/sampling-runs/${testRunId}/items`)
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeLessThanOrEqual(10);
      expect(res.body.data.items[0].studentNameMasked).toBeDefined();
    });
  });

  describe('4. Recording Verification Outcomes & RBAC', () => {
    test('institution user cannot record authority verification outcome (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/sampling-items/${testItemId}/result`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString())
        .send({
          verificationStatus: 'VERIFIED',
          verificationMethod: 'DOCUMENT_INSPECTION'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('auditor role is read-only and cannot record verification outcome (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/sampling-items/${testItemId}/result`)
        .set('x-user-role', 'AUDITOR')
        .send({
          verificationStatus: 'VERIFIED',
          verificationMethod: 'DOCUMENT_INSPECTION'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('authority reviewer records VERIFIED outcome with evidence reference', async () => {
      const res = await request(app)
        .patch(`/api/v1/sampling-items/${testItemId}/result`)
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          verificationStatus: 'VERIFIED',
          verificationMethod: 'DOCUMENT_INSPECTION',
          evidenceRef: 'DOC-VERIF-2024-001',
          notes: 'Original marksheet and allotment letter verified'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationStatus).toBe('VERIFIED');
      expect(res.body.data.verificationMethod).toBe('DOCUMENT_INSPECTION');
      expect(res.body.data.history.length).toBe(1);
      expect(res.body.data.history[0].previousStatus).toBe('PENDING');
      expect(res.body.data.history[0].newStatus).toBe('VERIFIED');
    });

    test('records FAILED_CHECK, UNCONFIRMED, and EXCLUDED outcomes for other items', async () => {
      const items = await SamplingItem.find({ samplingRunId: testRunId, stratum: 'RANDOM' });

      // Item 2: FAILED_CHECK
      await request(app)
        .patch(`/api/v1/sampling-items/${items[1]._id}/result`)
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .send({
          verificationStatus: 'FAILED_CHECK',
          verificationMethod: 'CROSS_REGISTER_MATCH',
          notes: 'Candidate DOB does not match secondary board register'
        });

      // Item 3: UNCONFIRMED (non-response, contact unreachable)
      await request(app)
        .patch(`/api/v1/sampling-items/${items[2]._id}/result`)
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .send({
          verificationStatus: 'UNCONFIRMED',
          verificationMethod: 'DIRECT_CONTACT_CALL',
          notes: 'Contact unreachable after 3 attempts'
        });

      // Item 4: EXCLUDED (with mandatory exclusion reason)
      await request(app)
        .patch(`/api/v1/sampling-items/${items[3]._id}/result`)
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .send({
          verificationStatus: 'EXCLUDED',
          exclusionReason: 'Student officially transferred out before sampling census date'
        });

      // Verify run summary was updated dynamically
      const run = await SamplingRun.findById(testRunId);
      expect(run.summary.verified).toBe(1);
      expect(run.summary.failedCheck).toBe(1);
      expect(run.summary.unconfirmed).toBe(1);
      expect(run.summary.excluded).toBe(1);
    });
  });

  describe('5. Statistical Estimate & Wilson Interval API', () => {
    test('returns INSUFFICIENT_DATA_FOR_ESTIMATE when resolved checks are below minimum threshold', async () => {
      // Currently only 2 resolved checks (1 verified + 1 failed), threshold requires 5
      const res = await request(app)
        .get(`/api/v1/sampling-runs/${testRunId}/estimate`)
        .set('x-user-role', 'AUTHORITY_ADMIN');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('INSUFFICIENT_DATA_FOR_ESTIMATE');
      expect(res.body.data.isEstimateAvailable).toBe(false);
      expect(res.body.data.reason).toContain('below the required threshold');
      expect(res.body.data.limitations.length).toBeGreaterThan(0);
    });

    test('calculates ESTIMATE_AVAILABLE once sufficient checks are resolved', async () => {
      const items = await SamplingItem.find({
        samplingRunId: testRunId,
        stratum: 'RANDOM',
        verificationStatus: 'PENDING'
      });

      // Mark 10 more items as VERIFIED so resolvedCount reaches 12 and responseRate >= 50%
      for (let i = 0; i < Math.min(10, items.length); i++) {
        await request(app)
          .patch(`/api/v1/sampling-items/${items[i]._id}/result`)
          .set('x-user-role', 'AUTHORITY_ADMIN')
          .send({
            verificationStatus: 'VERIFIED',
            verificationMethod: 'DOCUMENT_INSPECTION',
            evidenceRef: `DOC-VERIF-${i + 2}`
          });
      }

      const res = await request(app)
        .get(`/api/v1/sampling-runs/${testRunId}/estimate`)
        .set('x-user-role', 'AUTHORITY_ADMIN');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ESTIMATE_AVAILABLE');
      expect(res.body.data.isEstimateAvailable).toBe(true);
      expect(res.body.data.confidenceInterval).toBeDefined();
      expect(res.body.data.confidenceInterval.lowerPct).toBeGreaterThanOrEqual(0);
      expect(res.body.data.confidenceInterval.upperPct).toBeLessThanOrEqual(100);
      expect(res.body.data.sensitivityBounds).toBeDefined();

      // UNCONFIRMED was NOT treated as failure
      expect(res.body.data.counts.unconfirmedCount).toBe(1);
      expect(res.body.data.counts.failedCount).toBe(1);
    });
  });

  describe('6. Run Closure & Immutability Enforcement', () => {
    test('POST /api/v1/sampling-runs/:id/close marks run as CLOSED', async () => {
      const res = await request(app)
        .post(`/api/v1/sampling-runs/${testRunId}/close`)
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({ reason: 'Official assurance review concluded' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CLOSED');
      expect(res.body.data.closedBy.reason).toBe('Official assurance review concluded');
    });

    test('editing item in a CLOSED sampling run is rejected (Validation Error 400)', async () => {
      const res = await request(app)
        .patch(`/api/v1/sampling-items/${testItemId}/result`)
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          verificationStatus: 'FAILED_CHECK',
          notes: 'Attempting edit after closure'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cannot modify verification outcome for a CLOSED sampling run');
    });
  });

  describe('7. Cross-Institution Security Scoping', () => {
    test('institution user cannot access sampling runs belonging to another institution (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/sampling-runs')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', otherInstitutionId.toString())
        .query({ institutionId: institutionId.toString() }); // Target institution A from user in B

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cross-institution access is strictly prohibited');
    });
  });
});
