/**
 * Integration tests for Roster CSV Upload, Validation Preview, and Version Commitment.
 */
require('../src/config/dns');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');
const Institution = require('../src/models/institution.model');
const RosterUpload = require('../src/models/rosterUpload.model');
const RosterVersion = require('../src/models/rosterVersion.model');
const RosterRow = require('../src/models/rosterRow.model');

describe('Roster Upload & Commitment Integration Suite', () => {
  let testInstitution;
  const testInstId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await connectDB();
    testInstitution = await Institution.create({
      _id: testInstId,
      code: `INST_TEST_${Date.now()}`,
      name: 'Sample Institute of Engineering (Test)',
      type: 'ENGINEERING',
      state: 'Maharashtra',
      status: 'ACTIVE'
    });
  }, 30000);

  afterAll(async () => {
    try {
      const uploadIds = await RosterUpload.find({ institutionId: testInstId }).distinct('_id');
      await RosterRow.deleteMany({ rosterUploadId: { $in: uploadIds } });
      await RosterVersion.deleteMany({ institutionId: testInstId });
      await RosterUpload.deleteMany({ institutionId: testInstId });
      await Institution.deleteOne({ _id: testInstId });
    } catch (_) {}
    await disconnectDB();
  }, 30000);

  describe('1. CSV Upload & Ingestion', () => {
    test('should reject upload when no file is attached', async () => {
      const res = await request(app)
        .post('/api/v1/rosters/upload')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', testInstId.toString())
        .field('academicYear', '2025-26');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should reject upload when mandatory headers are missing from CSV', async () => {
      const badCsv = 'student_name,gender\nAditya,MALE';

      const res = await request(app)
        .post('/api/v1/rosters/upload')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', testInstId.toString())
        .field('academicYear', '2025-26')
        .attach('file', Buffer.from(badCsv), 'bad.csv');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('missing mandatory headers');
    });

    test('should successfully upload and parse a valid student roster CSV', async () => {
      const validCsv = [
        'applicationNo,name,dob,gender,category,programmeCode,academicYear,admissionQuota,admissionDate,apaarId',
        'APP-001,Aditya Sharma,2004-05-18,MALE,GENERAL,CSE,2025-26,STATE_MERIT,2025-07-15,123456789012',
        'APP-002,Priya Patel,2004-09-22,FEMALE,OBC,CSE,2025-26,STATE_MERIT,2025-07-16,987654321098'
      ].join('\n');

      const res = await request(app)
        .post('/api/v1/rosters/upload')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', testInstId.toString())
        .field('academicYear', '2025-26')
        .field('programmeCode', 'CSE')
        .attach('file', Buffer.from(validCsv), 'valid_roster.csv');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rowCount).toBe(2);
      expect(res.body.data.validation.errors).toBe(0);
      expect(res.body.data.fileSha256).toBeDefined();

      const uploadId = res.body.data.id;

      // 2. Test Preview Endpoint
      const previewRes = await request(app)
        .get(`/api/v1/rosters/${uploadId}/preview`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', testInstId.toString());

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.success).toBe(true);
      expect(previewRes.body.meta.total).toBe(2);
      expect(previewRes.body.meta.rows[0].studentNameMasked).toContain('A****');
      expect(previewRes.body.meta.rows[0].apaarTokenMasked).toBeDefined();
      expect(previewRes.body.meta.rows[0].validationStatus).toBe('VALID');

      // 3. Test Commit Endpoint
      const commitRes = await request(app)
        .post(`/api/v1/rosters/${uploadId}/commit`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', testInstId.toString());

      expect(commitRes.status).toBe(201);
      expect(commitRes.body.success).toBe(true);
      expect(commitRes.body.data.versionNumber).toBe(1);
      expect(commitRes.body.data.status).toBe('COMMITTED');

      // 4. Test Double-Commit Prevention
      const retryCommitRes = await request(app)
        .post(`/api/v1/rosters/${uploadId}/commit`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', testInstId.toString());

      expect(retryCommitRes.status).toBe(409);
      expect(retryCommitRes.body.success).toBe(false);
      expect(retryCommitRes.body.error.code).toBe('CONFLICT');
    });

    test('should prevent cross-institution access when institutionId does not match user', async () => {
      const otherInstId = new mongoose.Types.ObjectId().toString();
      const validCsv = 'applicationNo,name,dob,programmeCode\nAPP-9,Rahul,2004-01-01,CSE';

      const res = await request(app)
        .post('/api/v1/rosters/upload')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', testInstId.toString())
        .field('institutionId', otherInstId) // Malicious cross-institution attempt
        .field('academicYear', '2025-26')
        .attach('file', Buffer.from(validCsv), 'test.csv');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
