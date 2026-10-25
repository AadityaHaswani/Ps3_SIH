/**
 * End-to-End Integration Tests for Feature 6:
 * Authority-Verified Intake and Data Assurance Labels.
 *
 * Verifies:
 * 1. Institution intake declaration baseline (INSTITUTION_DECLARED).
 * 2. Automated verification request with simulated connector (AUTHORITY_VERIFIED_SIMULATED).
 * 3. Idempotency replay on duplicate requests.
 * 4. Failing connector resilience (UNABLE_TO_VERIFY).
 * 5. Local invalidation on intake change: updating verified value supersedes old verification.
 * 6. Conflicting evidence detection (VERIFICATION_PENDING with hasConflict: true).
 * 7. Manual authority review workflow with supporting evidence (DOCUMENT_SUPPORTED).
 * 8. Security & RBAC: Auditor 403, unauthenticated 401, cross-institution IDOR 403.
 * 9. Connectors status endpoint with zero secret leakage.
 * 10. Centralized canonical audit logging (GET /api/v1/audit/events).
 * 11. Concurrency safeguard on active pending transfer cases.
 */
require('../src/config/dns');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');

const Institution = require('../src/models/institution.model');
const Programme = require('../src/models/programme.model');
const SeatBalance = require('../src/models/seatBalance.model');
const VerificationRecord = require('../src/models/verificationRecord.model');
const AuditEvent = require('../src/models/auditEvent.model');
const TransferCase = require('../src/models/transferCase.model');
const { buildBucketKey } = require('../src/services/seatLedgerService');

describe('Feature 6: Authority-Verified Intake & Assurance Labels Integration Suite', () => {
  const instAId = new mongoose.Types.ObjectId();
  const instBId = new mongoose.Types.ObjectId();
  const academicYear = '2024-25';
  const programmeCode = 'IT_SEC';
  const seatCategory = 'GENERAL';
  let bucketKey = buildBucketKey(instAId, programmeCode, academicYear, seatCategory);

  beforeAll(async () => {
    await connectDB();

    // Sync indexes to ensure unique compound partial index on TransferCase is built
    try {
      await TransferCase.syncIndexes();
    } catch (e) {
      // ignore
    }

    // 1. Setup Institutions
    await Institution.create([
      {
        _id: instAId,
        code: `INST_VERIF_A_${Date.now()}`,
        name: 'Alpha Institute of Technology',
        type: 'ENGINEERING',
        state: 'Maharashtra',
        status: 'ACTIVE'
      },
      {
        _id: instBId,
        code: `INST_VERIF_B_${Date.now()}`,
        name: 'Beta Technical Campus',
        type: 'ENGINEERING',
        state: 'Karnataka',
        status: 'ACTIVE'
      }
    ]);

    // 2. Setup Programme in InstA
    await Programme.create({
      institutionId: instAId,
      code: programmeCode,
      name: 'Information Technology & Security',
      durationYears: 4,
      intakeByYear: [
        {
          academicYear,
          seatCategory: 'ALL',
          approvedIntake: 60,
          label: 'INSTITUTION_DECLARED',
          sourceMode: 'SIMULATED',
          sourceRef: 'EOA-ORDER-INITIAL-60'
        }
      ]
    });
  });

  afterAll(async () => {
    // Cleanup collections
    await Promise.all([
      Institution.deleteMany({ _id: { $in: [instAId, instBId] } }),
      Programme.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      SeatBalance.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      VerificationRecord.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      AuditEvent.deleteMany({ institutionId: { $in: [instAId, instBId] } }),
      TransferCase.deleteMany({ sendingInstitutionId: { $in: [instAId, instBId] } })
    ]);
    await disconnectDB();
  });

  describe('1. Institution Intake Declaration & Assurance Label Flow', () => {
    test('1. Institution declares intake -> starts as INSTITUTION_DECLARED baseline', async () => {
      const res = await request(app)
        .post('/api/v1/seat-ledger/intake/declare')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          institutionId: instAId.toString(),
          programmeCode,
          academicYear,
          seatCategory,
          declaredIntake: 60
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bucket.approvedIntake).toBe(60);
      expect(res.body.data.bucket.intakeSourceMode).toBe('INSTITUTION_DECLARED');
      expect(res.body.data.bucket.isSimulated).toBe(false);

      bucketKey = res.body.data.bucket.bucketKey;

      // Verify effective label via /by-subject endpoint
      const bySubRes = await request(app)
        .get('/api/v1/verifications/by-subject')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .query({
          subjectType: 'PROGRAMME_INTAKE',
          subjectId: bucketKey,
          currentValue: 60
        });

      expect(bySubRes.status).toBe(200);
      expect(bySubRes.body.success).toBe(true);
      expect(bySubRes.body.data.effective.effectiveLabel).toBe('INSTITUTION_DECLARED');
      expect(bySubRes.body.data.effective.isSimulated).toBe(false);
      expect(bySubRes.body.data.effective.displayBadge.text).toBe('Institution Declared');
    });

    test('2. Request verification with mock authority connector -> yields AUTHORITY_VERIFIED_SIMULATED', async () => {
      const idempotencyKey = `verif-req-${Date.now()}`;

      const res = await request(app)
        .post('/api/v1/verifications/request')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .set('idempotency-key', idempotencyKey)
        .send({
          subjectType: 'PROGRAMME_INTAKE',
          subjectId: bucketKey,
          fieldPath: 'approvedIntake',
          connectorId: 'mock-authority-intake',
          institutionId: instAId.toString(),
          value: 60,
          context: { expectedIntake: 60 }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationRecord.label).toBe('AUTHORITY_VERIFIED_SIMULATED');
      expect(res.body.data.verificationRecord.sourceMode).toBe('SIMULATED');
      expect(res.body.data.effectiveLabel.effectiveLabel).toBe('AUTHORITY_VERIFIED_SIMULATED');
      expect(res.body.data.effectiveLabel.isSimulated).toBe(true);
      expect(res.body.data.effectiveLabel.displayBadge.text).toContain('Simulated');

      // Idempotent retry check: repeating same request with same key returns 200 replay
      const retryRes = await request(app)
        .post('/api/v1/verifications/request')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .set('idempotency-key', idempotencyKey)
        .send({
          subjectType: 'PROGRAMME_INTAKE',
          subjectId: bucketKey,
          fieldPath: 'approvedIntake',
          connectorId: 'mock-authority-intake',
          institutionId: instAId.toString(),
          value: 60
        });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.isReplay).toBe(true);
    });

    test('3. Failing connector produces UNABLE_TO_VERIFY without crashing or leaking credentials', async () => {
      const res = await request(app)
        .post('/api/v1/verifications/request')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          subjectType: 'PROGRAMME_INTAKE',
          subjectId: bucketKey,
          fieldPath: 'approvedIntake',
          connectorId: 'failing-test-connector',
          institutionId: instAId.toString(),
          value: 60
        });

      expect(res.status).toBe(201);
      expect(res.body.data.verificationRecord.status).toBe('UNABLE_TO_VERIFY');
      expect(res.body.data.verificationRecord.label).toBe('UNABLE_TO_VERIFY');
      expect(res.body.data.verificationRecord.notes).toContain('unavailable');
    });

    test('4. Local Invalidation on Value Change: declaring revised intake supersedes prior verification and resets label', async () => {
      // Institution changes declared intake from 60 to 75
      const reviseRes = await request(app)
        .post('/api/v1/seat-ledger/intake/declare')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          institutionId: instAId.toString(),
          programmeCode,
          academicYear,
          seatCategory,
          declaredIntake: 75
        });

      expect([200, 201]).toContain(reviseRes.status);
      expect(reviseRes.body.data.bucket.approvedIntake).toBe(75);

      // Verify that prior verification records for this bucket are now marked SUPERSEDED
      const supersededRecords = await VerificationRecord.find({
        subjectId: bucketKey,
        status: 'SUPERSEDED'
      });
      expect(supersededRecords.length).toBeGreaterThanOrEqual(1);

      // Effective label for 75 must reset to INSTITUTION_DECLARED
      const bySubRes = await request(app)
        .get('/api/v1/verifications/by-subject')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .query({
          subjectType: 'PROGRAMME_INTAKE',
          subjectId: bucketKey,
          currentValue: 75
        });

      expect(bySubRes.status).toBe(200);
      expect(bySubRes.body.data.effective.effectiveLabel).toBe('INSTITUTION_DECLARED');
    });

    test('5. Value conflict with authority quota yields VERIFICATION_PENDING with hasConflict: true', async () => {
      const res = await request(app)
        .post('/api/v1/verifications/request')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          subjectType: 'PROGRAMME_INTAKE',
          subjectId: bucketKey,
          fieldPath: 'approvedIntake',
          connectorId: 'mock-authority-intake',
          institutionId: instAId.toString(),
          value: 75,
          context: { expectedIntake: 60 } // Authority registry only has 60 seats approved
        });

      expect(res.status).toBe(201);
      expect(res.body.data.verificationRecord.status).toBe('CONFLICT');
      expect(res.body.data.verificationRecord.label).toBe('VERIFICATION_PENDING');
      expect(res.body.data.effectiveLabel.hasConflict).toBe(true);
      expect(res.body.data.effectiveLabel.conflictReason).toContain('conflicts with simulated authority quota');
    });
  });

  describe('2. Authority Officer Review & Document Supported Workflow', () => {
    let pendingVerificationId;

    beforeAll(async () => {
      // Create a pending verification record awaiting manual review
      const record = await VerificationRecord.create({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: bucketKey,
        fieldPath: 'approvedIntake',
        institutionId: instAId,
        valueSnapshot: 75,
        label: 'VERIFICATION_PENDING',
        sourceMode: 'SIMULATED',
        method: 'DOCUMENT_REVIEW',
        status: 'PENDING',
        notes: 'Institution submitted AICTE revised approval order awaiting officer review.'
      });
      pendingVerificationId = record._id;
    });

    test('6. Authority officer reviews supporting document evidence -> produces DOCUMENT_SUPPORTED', async () => {
      const res = await request(app)
        .patch(`/api/v1/verifications/${pendingVerificationId}/review`)
        .set('x-user-role', 'AUTHORITY_OFFICER')
        .send({
          action: 'CONFIRM',
          evidenceRef: 'AICTE-REVISED-EOA-2024-DOC-75.PDF',
          notes: 'Verified against stamped AICTE Approval Order for 75 seats.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationRecord.status).toBe('COMPLETED');
      expect(res.body.data.verificationRecord.label).toBe('DOCUMENT_SUPPORTED');
      expect(res.body.data.verificationRecord.method).toBe('DOCUMENT_REVIEW');
      expect(res.body.data.verificationRecord.evidenceRef).toBe('AICTE-REVISED-EOA-2024-DOC-75.PDF');
      expect(res.body.data.effectiveLabel.effectiveLabel).toBe('DOCUMENT_SUPPORTED');
      expect(res.body.data.effectiveLabel.displayBadge.text).toBe('Document Supported');
    });

    test('7. Institution user cannot review or approve verification evidence (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/verifications/${pendingVerificationId}/review`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          action: 'CONFIRM',
          evidenceRef: 'SELF_SIGNED_DOC.PDF'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('8. Auditor role cannot review or mutate verification evidence (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/verifications/${pendingVerificationId}/review`)
        .set('x-user-role', 'AUDITOR')
        .send({
          action: 'CONFIRM',
          evidenceRef: 'AUDITOR_DOC.PDF'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('3. Security, Privacy, and Institution Scoping', () => {
    test('9. Unauthenticated request to /verifications returns 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/v1/verifications');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('10. Institution user cannot request verification for another institution (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/verifications/request')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          subjectType: 'PROGRAMME_INTAKE',
          subjectId: 'instB-bucketKey',
          fieldPath: 'approvedIntake',
          connectorId: 'mock-authority-intake',
          institutionId: instBId.toString(), // Attempting cross-institution IDOR
          value: 60
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cannot request verification for another institution');
    });

    test('11. Institution user cannot query verification records of another institution', async () => {
      const res = await request(app)
        .get('/api/v1/verifications')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .query({
          institutionId: instBId.toString()
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('12. Auditor role cannot request a new verification (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/verifications/request')
        .set('x-user-role', 'AUDITOR')
        .send({
          subjectType: 'PROGRAMME_INTAKE',
          subjectId: bucketKey,
          fieldPath: 'approvedIntake',
          connectorId: 'mock-authority-intake',
          institutionId: instAId.toString(),
          value: 60
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('4. Connector Status Endpoint & Zero Secret Exposure', () => {
    test('13. GET /api/v1/connectors/status returns healthy connectors list with zero credentials', async () => {
      const res = await request(app)
        .get('/api/v1/connectors/status')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.connectors)).toBe(true);
      expect(res.body.data.connectors.length).toBeGreaterThanOrEqual(4);

      for (const connector of res.body.data.connectors) {
        expect(connector.id).toBeDefined();
        expect(connector.name).toBeDefined();
        expect(connector.mode).toBe('SIMULATED');
        expect(connector.isSimulated).toBe(true);
        expect(connector.status).toBeDefined();

        // Security check: no credentials or secrets leaked
        expect(connector.apiKey).toBeUndefined();
        expect(connector.secret).toBeUndefined();
        expect(connector.password).toBeUndefined();
        expect(connector.token).toBeUndefined();
      }
    });
  });

  describe('5. Canonical Audit Events Integration', () => {
    test('14. GET /api/v1/audit/events returns auditable verification actions', async () => {
      const res = await request(app)
        .get('/api/v1/audit/events')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .query({
          institutionId: instAId.toString()
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);

      const actions = res.body.data.items.map((it) => it.action);
      expect(actions).toContain('VERIFICATION_REQUESTED');
      expect(actions).toContain('VERIFICATION_REVIEWED');

      // Verify privacy: raw APAAR, passwords, or secret tokens are never retained
      for (const item of res.body.data.items) {
        expect(item.details.rawApaar).toBeUndefined();
        expect(item.details.password).toBeUndefined();
      }
    });
  });

  describe('6. Active Transfer Concurrency Safeguards', () => {
    test('15. Attempting duplicate concurrent active pending transfer cases triggers 409 DUPLICATE_TRANSFER_CASE', async () => {
      const studentToken = 'STOKEN_CONCUR_001';
      const keyVer = 1;

      // 1. First transfer initiates normally
      const res1 = await request(app)
        .post('/api/v1/transfers')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: studentToken,
          keyVersion: keyVer,
          sendingInstitutionId: instAId.toString(),
          receivingInstitutionId: instBId.toString(),
          programmeCode: 'CS',
          academicYear: '2024-25',
          seatCategory: 'GENERAL',
          proposedEffectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

      expect(res1.status).toBe(201);
      expect(res1.body.data.status).toBe('PENDING');

      // 2. Concurrent duplicate initiation attempt for same student & institutions
      const res2 = await request(app)
        .post('/api/v1/transfers')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: studentToken,
          keyVersion: keyVer,
          sendingInstitutionId: instAId.toString(),
          receivingInstitutionId: instBId.toString(),
          programmeCode: 'CS',
          academicYear: '2024-25',
          seatCategory: 'GENERAL',
          proposedEffectiveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

      // Must be rejected with 409 Conflict
      expect(res2.status).toBe(409);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error.code).toBe('DUPLICATE_TRANSFER_CASE');
    });
  });
});
