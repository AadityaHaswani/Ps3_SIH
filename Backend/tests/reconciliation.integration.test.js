/**
 * End-to-End Integration Tests for Feature 1: Seat Three-Way Match Engine.
 * Tests matching execution, idempotency, findings pagination, human review workflow,
 * and source outage resilience on fictional synthetic data.
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
const ExternalRegisterRecord = require('../src/models/externalRegisterRecord.model');
const ReconciliationRun = require('../src/models/reconciliationRun.model');
const ReconciliationFinding = require('../src/models/reconciliationFinding.model');
const { generateApaarToken } = require('../src/utils/cryptoToken');

describe('Feature 1: Seat Three-Way Match Integration Suite', () => {
  const institutionId = new mongoose.Types.ObjectId();
  const otherInstitutionId = new mongoose.Types.ObjectId();
  const academicYear = '2025-26';
  const programmeCode = 'CSE';

  let committedVersionId;
  let testRunId;

  // Key tokens for synthetic test fixtures
  const tokenStudent1 = generateApaarToken('111122223333');
  const tokenStudent2 = generateApaarToken('444455556666');
  const tokenStudentMissing = generateApaarToken('777788889999');

  beforeAll(async () => {
    await connectDB();

    // 1. Create Target Institution
    await Institution.create({
      _id: institutionId,
      code: `SIT_${Date.now()}`,
      name: 'Sample Institute of Technology (DEMO)',
      type: 'ENGINEERING',
      state: 'Karnataka',
      status: 'ACTIVE'
    });

    // 2. Create Second Institution for Scoping Security Test
    await Institution.create({
      _id: otherInstitutionId,
      code: `OTHER_${Date.now()}`,
      name: 'Other Autonomous College',
      type: 'ENGINEERING',
      state: 'Karnataka',
      status: 'ACTIVE'
    });

    // 3. Create Programme with Approved Intake = 3 (Testing over-intake detection)
    await Programme.create({
      institutionId,
      code: programmeCode,
      name: 'Computer Science and Engineering',
      durationYears: 4,
      intakeByYear: [
        {
          academicYear,
          seatCategory: 'ALL',
          approvedIntake: 3, // Approved intake capacity
          label: 'AICTE_APPROVED',
          sourceMode: 'SIMULATED'
        }
      ]
    });

    // 4. Seed Synthetic External Register Records (Admission and Exam Registers)
    await ExternalRegisterRecord.create([
      // Ext 1: Exact match for Student 1 in ADMISSION
      {
        sourceType: 'ADMISSION',
        sourceMode: 'SIMULATED',
        sourceIdentifier: 'ADM-2025-001',
        institutionId,
        programmeCode,
        academicYear,
        apaarToken: tokenStudent1,
        applicationNo: 'APP-001',
        candidateName: 'Aarav Sharma',
        normalisedName: 'AARAV SHARMA',
        dob: '2004-03-15',
        category: 'GENERAL',
        asOf: new Date()
      },
      // Ext 2: Exact match for Student 1 in EXAM
      {
        sourceType: 'EXAM',
        sourceMode: 'SIMULATED',
        sourceIdentifier: 'EXAM-2025-001',
        institutionId,
        programmeCode,
        academicYear,
        apaarToken: tokenStudent1,
        applicationNo: 'APP-001',
        candidateName: 'Aarav Sharma',
        normalisedName: 'AARAV SHARMA',
        dob: '2004-03-15',
        category: 'GENERAL',
        asOf: new Date()
      },
      // Ext 3: Conflict for Student 2 in ADMISSION (Category OBC in admission vs GENERAL in roster)
      {
        sourceType: 'ADMISSION',
        sourceMode: 'SIMULATED',
        sourceIdentifier: 'ADM-2025-002',
        institutionId,
        programmeCode,
        academicYear,
        apaarToken: tokenStudent2,
        applicationNo: 'APP-002',
        candidateName: 'Bhavna Rao',
        normalisedName: 'BHAVNA RAO',
        dob: '2004-07-20',
        category: 'OBC', // Conflict!
        asOf: new Date()
      },
      // Ext 4: Weak match for Student 3 in ADMISSION (Different applicationNo and no token, but same name + DOB)
      {
        sourceType: 'ADMISSION',
        sourceMode: 'SIMULATED',
        sourceIdentifier: 'ADM-2025-003',
        institutionId,
        programmeCode,
        academicYear,
        apaarToken: null,
        applicationNo: 'APP-DIFF-999',
        candidateName: 'Chetan Desai',
        normalisedName: 'CHETAN DESAI',
        dob: '2004-11-10',
        category: 'GENERAL',
        asOf: new Date()
      },
      // Ext 5: Candidate present in ADMISSION but missing from Roster (Reverse Check)
      {
        sourceType: 'ADMISSION',
        sourceMode: 'SIMULATED',
        sourceIdentifier: 'ADM-2025-999',
        institutionId,
        programmeCode,
        academicYear,
        apaarToken: tokenStudentMissing,
        applicationNo: 'APP-MISSING-001',
        candidateName: 'Devika Nair',
        normalisedName: 'DEVIKA NAIR',
        dob: '2004-12-05',
        category: 'GENERAL',
        asOf: new Date()
      }
    ]);

    // 5. Create and Commit a Synthetic Roster with 4 Students
    const uploadDoc = await RosterUpload.create({
      institutionId,
      academicYear,
      programmeCode,
      filename: 'demo_roster.csv',
      fileSha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      rowCount: 4,
      status: 'COMMITTED'
    });

    const versionDoc = await RosterVersion.create({
      institutionId,
      academicYear,
      versionNumber: 1,
      status: 'COMMITTED',
      uploadId: uploadDoc._id,
      fileSha256: uploadDoc.fileSha256,
      rowCount: 4
    });

    committedVersionId = versionDoc._id;
    uploadDoc.committedVersionId = committedVersionId;
    await uploadDoc.save();

    await RosterRow.create([
      // Row 1: Aarav Sharma -> Confirmed 3-Way
      {
        rosterUploadId: uploadDoc._id,
        rosterVersionId: committedVersionId,
        rowKey: 'row_1',
        applicationNo: 'APP-001',
        apaarToken: tokenStudent1,
        name: 'Aarav Sharma',
        normalisedName: 'AARAV SHARMA',
        dob: '2004-03-15',
        category: 'GENERAL',
        programmeCode,
        academicYear
      },
      // Row 2: Bhavna Rao -> Attribute Conflict (Category)
      {
        rosterUploadId: uploadDoc._id,
        rosterVersionId: committedVersionId,
        rowKey: 'row_2',
        applicationNo: 'APP-002',
        apaarToken: tokenStudent2,
        name: 'Bhavna Rao',
        normalisedName: 'BHAVNA RAO',
        dob: '2004-07-20',
        category: 'GENERAL', // Conflict with OBC
        programmeCode,
        academicYear
      },
      // Row 3: Chetan Desai -> Weak K3 Match (Candidate Review)
      {
        rosterUploadId: uploadDoc._id,
        rosterVersionId: committedVersionId,
        rowKey: 'row_3',
        applicationNo: 'APP-003',
        apaarToken: null,
        name: 'Chetan Desai',
        normalisedName: 'CHETAN DESAI',
        dob: '2004-11-10',
        category: 'GENERAL',
        programmeCode,
        academicYear
      },
      // Row 4: Esha Mehra -> Unmatched in all external registers
      {
        rosterUploadId: uploadDoc._id,
        rosterVersionId: committedVersionId,
        rowKey: 'row_4',
        applicationNo: 'APP-004',
        apaarToken: generateApaarToken('999900001111'),
        name: 'Esha Mehra',
        normalisedName: 'ESHA MEHRA',
        dob: '2004-08-25',
        category: 'GENERAL',
        programmeCode,
        academicYear
      }
    ]);
  }, 30000);

  afterAll(async () => {
    // Teardown created test data
    try {
      await ReconciliationFinding.deleteMany({ institutionId });
      await ReconciliationRun.deleteMany({ institutionId });
      await ExternalRegisterRecord.deleteMany({ institutionId });
      await RosterRow.deleteMany({ rosterVersionId: committedVersionId });
      await RosterVersion.deleteMany({ institutionId });
      await RosterUpload.deleteMany({ institutionId });
      await Programme.deleteMany({ institutionId });
      await Institution.deleteMany({ _id: { $in: [institutionId, otherInstitutionId] } });
    } catch (_) {}
    await disconnectDB();
  }, 30000);

  describe('1. Reconciliation Execution (POST /api/v1/reconciliations)', () => {
    test('should execute Seat Three-Way Match and generate accurate summary counts', async () => {
      const idempotencyKey = `idem_${Date.now()}`;

      const res = await request(app)
        .post('/api/v1/reconciliations')
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          institutionId: institutionId.toString(),
          academicYear,
          rosterVersionId: committedVersionId.toString(),
          sources: ['ROSTER', 'ADMISSION', 'EXAM', 'INTAKE'],
          programmeCodes: [programmeCode]
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.summary.rosterRecords).toBe(4);
      expect(res.body.data.summary.confirmed3Way).toBe(1); // Student 1
      expect(res.body.data.summary.conflicts).toBe(1); // Student 2 (Category diff)
      expect(res.body.data.summary.candidateReview).toBe(1); // Student 3 (K3 weak)
      expect(res.body.data.summary.unmatched).toBe(1); // Student 4 (Esha Mehra)
      expect(res.body.data.summary.missingFromRoster).toBe(1); // Devika Nair
      expect(res.body.data.summary.countMismatches).toBe(1); // 4 students > 3 approved intake

      testRunId = res.body.data.runId;

      // 2. Test Idempotency Replay
      const replayRes = await request(app)
        .post('/api/v1/reconciliations')
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          institutionId: institutionId.toString(),
          academicYear,
          rosterVersionId: committedVersionId.toString()
        });

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.meta.isReplay).toBe(true);
      expect(replayRes.body.data.runId).toBe(testRunId);
    });
  });

  describe('2. Findings Queries & Pagination (GET /api/v1/reconciliations/:id/findings)', () => {
    test('should retrieve paginated findings with filter for CONFLICT', async () => {
      const res = await request(app)
        .get(`/api/v1/reconciliations/${testRunId}/findings?type=CONFLICT`)
        .set('x-user-role', 'AUTHORITY_OFFICER');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('CONFLICT');
      expect(res.body.data[0].fieldDiffs[0].field).toBe('category');
      expect(res.body.data[0].fieldDiffs[0].rosterValue).toBe('GENERAL');
      expect(res.body.data[0].fieldDiffs[0].sourceValue).toBe('OBC');
    });

    test('should retrieve findings filtered by CANDIDATE_REVIEW and verify weak confidence', async () => {
      const res = await request(app)
        .get(`/api/v1/reconciliations/${testRunId}/findings?type=CANDIDATE_REVIEW`)
        .set('x-user-role', 'AUTHORITY_OFFICER');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].matchConfidence).toBe('WEAK');
      expect(res.body.data[0].reviewStatus).toBe('PENDING');
    });

    test('should retrieve COUNT_MISMATCH finding reflecting intake capacity overflow', async () => {
      const res = await request(app)
        .get(`/api/v1/reconciliations/${testRunId}/findings?type=COUNT_MISMATCH`)
        .set('x-user-role', 'AUTHORITY_OFFICER');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].severity).toBe('CRITICAL');
      expect(res.body.data[0].fieldDiffs[0].rosterValue).toBe('4');
      expect(res.body.data[0].fieldDiffs[0].sourceValue).toBe('3');
    });
  });

  describe('3. Reconciliation Summary Metrics (GET /api/v1/reconciliations/:id/summary)', () => {
    test('should return chart-ready summary metrics', async () => {
      const res = await request(app)
        .get(`/api/v1/reconciliations/${testRunId}/summary`)
        .set('x-user-role', 'AUTHORITY_OFFICER');

      expect(res.status).toBe(200);
      expect(res.body.data.metrics.reconciliationRatePct).toBe(25); // 1 of 4 confirmed 3-way
      expect(res.body.data.chartBreakdown).toBeDefined();
      expect(res.body.data.chartBreakdown.find((b) => b.status === 'CONFIRMED_3WAY').count).toBe(1);
    });
  });

  describe('4. Auditable Human Review Workflow (PATCH /api/v1/reconciliation-findings/:id/review)', () => {
    test('should record review decisions (CONFIRM, REQUEST_CLARIFICATION, RESOLVE) and preserve audit history', async () => {
      // Find candidate review item
      const candidateFinding = await ReconciliationFinding.findOne({
        runId: testRunId,
        type: 'CANDIDATE_REVIEW'
      });
      expect(candidateFinding).toBeDefined();

      // Step 1: Officer confirms candidate match
      const confirmRes = await request(app)
        .patch(`/api/v1/reconciliation-findings/${candidateFinding._id}/review`)
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .send({
          action: 'CONFIRM',
          note: 'Confirmed candidate identity through verified enrollment records.'
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.reviewStatus).toBe('CONFIRMED');
      expect(confirmRes.body.data.reviewHistory).toHaveLength(1);
      expect(confirmRes.body.data.reviewHistory[0].action).toBe('CONFIRM');

      // Step 2: Request clarification on an unmatched finding
      const unmatchedFinding = await ReconciliationFinding.findOne({
        runId: testRunId,
        type: 'UNMATCHED'
      });

      const clarifyRes = await request(app)
        .patch(`/api/v1/reconciliation-findings/${unmatchedFinding._id}/review`)
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .send({
          action: 'REQUEST_CLARIFICATION',
          note: 'Requested spot admission allotment certificate from institution admin.'
        });

      expect(clarifyRes.status).toBe(200);
      expect(clarifyRes.body.data.reviewStatus).toBe('CLARIFICATION_REQUESTED');
      expect(clarifyRes.body.data.reviewHistory).toHaveLength(1);

      // Step 3: Resolve finding later with institution explanation
      const resolveRes = await request(app)
        .patch(`/api/v1/reconciliation-findings/${unmatchedFinding._id}/review`)
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .send({
          action: 'RESOLVE',
          note: 'Allotment order verified via State CET portal spot-round report.'
        });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.reviewStatus).toBe('RESOLVED');
      expect(resolveRes.body.data.reviewHistory).toHaveLength(2); // History preserved!
      expect(resolveRes.body.data.reviewHistory[0].action).toBe('REQUEST_CLARIFICATION');
      expect(resolveRes.body.data.reviewHistory[1].action).toBe('RESOLVE');
    });
  });

  describe('5. External Source Outage Resilience', () => {
    test('should classify unavailable sources as SOURCE_UNAVAILABLE without raising false missing-student penalties', async () => {
      const outageRes = await request(app)
        .post('/api/v1/reconciliations')
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .send({
          institutionId: institutionId.toString(),
          academicYear,
          rosterVersionId: committedVersionId.toString(),
          sources: ['ROSTER', 'EXAM'],
          simulationToggles: { EXAM: 'UNAVAILABLE' } // Simulate exam register service downtime
        });

      expect(outageRes.status).toBe(201);
      expect(outageRes.body.data.summary.sourceUnavailable).toBe(1);

      const outageFindings = await ReconciliationFinding.find({
        runId: outageRes.body.data.runId,
        type: 'SOURCE_UNAVAILABLE'
      });
      expect(outageFindings).toHaveLength(1);
      expect(outageFindings[0].explanation.ruleApplied).toBe('SOURCE_AVAILABILITY_CHECK');
    });
  });

  describe('6. Security & Institution Scoping', () => {
    test('should deny institution user access to another institution reconciliation run', async () => {
      const res = await request(app)
        .get(`/api/v1/reconciliations/${testRunId}`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', otherInstitutionId.toString()); // Different institution!

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
