/**
 * End-to-End Integration Tests for Feature 4:
 * Institutional Data Reliability Scorecard.
 *
 * Verifies:
 * - Scorecard calculation, retrieval, and mandatory disclaimer
 * - Detailed metrics breakdown (M1, M2, M3, M4)
 * - Insufficient data handling (population < 50 => band: INSUFFICIENT_DATA, score: null, never 0)
 * - Discrepancy metric excludes SOURCE_UNAVAILABLE findings
 * - On-demand score recalculation
 * - Staleness tracking and clearing upon recalculation
 * - Multi-institution comparison with comparability warnings
 * - Peer institution anonymisation for institution callers
 * - Scoring configuration creation and version immutability
 * - Role-based permissions (Auditor & Institution User blocked from mutating config)
 * - Cross-institution security scoping (403 Forbidden)
 * - Historical snapshot preservation and trend time series
 * - Correction volume invariance under disabled M4 weight
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
const ReconciliationFinding = require('../src/models/reconciliationFinding.model');
const ReconciliationRun = require('../src/models/reconciliationRun.model');
const ExternalRegisterRecord = require('../src/models/externalRegisterRecord.model');
const ScoringConfig = require('../src/models/scoringConfig.model');
const ScoreSnapshot = require('../src/models/scoreSnapshot.model');
const DataCorrectionEvent = require('../src/models/correctionEvent.model');
const { MANDATORY_DISCLAIMER } = require('../src/models/scoreSnapshot.model');

const {
  processRosterUpload,
  commitRosterVersion
} = require('../src/services/rosterService');

describe('Feature 4: Institutional Reliability Scorecard Integration Suite', () => {
  const inst1Id = new mongoose.Types.ObjectId();
  const inst2Id = new mongoose.Types.ObjectId();
  const smallInstId = new mongoose.Types.ObjectId();
  const academicYear = '2024-25';

  let inst1VersionId;
  let inst2VersionId;

  beforeAll(async () => {
    await connectDB();

    // 1. Create Institutions
    await Institution.create([
      {
        _id: inst1Id,
        code: `APEX_ENG_${Date.now()}`,
        name: 'Apex Institute of Engineering (DEMO)',
        type: 'ENGINEERING',
        state: 'Maharashtra',
        status: 'ACTIVE'
      },
      {
        _id: inst2Id,
        code: `BEACON_MGMT_${Date.now()}`,
        name: 'Beacon School of Management (DEMO)',
        type: 'MANAGEMENT',
        state: 'Maharashtra',
        status: 'ACTIVE'
      },
      {
        _id: smallInstId,
        code: `SMALL_POLY_${Date.now()}`,
        name: 'Small Rural Polytechnic (DEMO)',
        type: 'POLYTECHNIC',
        state: 'Maharashtra',
        status: 'ACTIVE'
      }
    ]);

    await Programme.create([
      {
        institutionId: inst1Id,
        code: 'CSE',
        name: 'Computer Science and Engineering',
        level: 'UG',
        approvedIntake: 100,
        academicYear
      },
      {
        institutionId: inst2Id,
        code: 'MBA',
        name: 'Master of Business Administration',
        level: 'PG',
        approvedIntake: 60,
        academicYear
      },
      {
        institutionId: smallInstId,
        code: 'DCE',
        name: 'Diploma in Civil Engineering',
        level: 'DIPLOMA',
        approvedIntake: 30,
        academicYear
      }
    ]);

    // 2. Build 60 rows for Inst1 (55 complete with admissionDate, 5 missing apaarToken)
    const recentAdmDate1 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let inst1Csv = 'ApplicationNo,ApaarId,StudentName,DOB,Gender,Category,ProgrammeCode,AcademicYear,Quota,AdmissionDate\n';
    for (let i = 1; i <= 60; i++) {
      const appNo = `APP-APEX-${1000 + i}`;
      const apaar = i <= 55 ? `9999-0000-${String(i).padStart(4, '0')}` : '';
      const name = `Apex Student ${i}`;
      const dob = '2004-05-15';
      inst1Csv += `${appNo},${apaar},${name},${dob},MALE,GENERAL,CSE,${academicYear},STATE_MERIT,${recentAdmDate1}\n`;
    }

    const upload1 = await processRosterUpload({
      institutionId: inst1Id,
      academicYear,
      programmeCode: 'CSE',
      file: { buffer: Buffer.from(inst1Csv, 'utf-8'), originalname: 'apex_roster.csv' },
      user: { id: 'admin-1', role: 'INSTITUTION_ADMIN', email: 'admin@apex.edu' }
    });

    const v1 = await commitRosterVersion(
      upload1._id,
      { id: 'admin-1', role: 'INSTITUTION_ADMIN', email: 'admin@apex.edu' }
    );
    inst1VersionId = v1._id;

    // 3. Build 55 rows for Inst2
    const recentAdmDate2 = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let inst2Csv = 'ApplicationNo,ApaarId,StudentName,DOB,Gender,Category,ProgrammeCode,AcademicYear,Quota,AdmissionDate\n';
    for (let i = 1; i <= 55; i++) {
      const appNo = `APP-BEACON-${2000 + i}`;
      const apaar = `8888-0000-${String(i).padStart(4, '0')}`;
      const name = `Beacon Student ${i}`;
      const dob = '2001-08-20';
      inst2Csv += `${appNo},${apaar},${name},${dob},FEMALE,OBC,MBA,${academicYear},STATE_MERIT,${recentAdmDate2}\n`;
    }

    const upload2 = await processRosterUpload({
      institutionId: inst2Id,
      academicYear,
      programmeCode: 'MBA',
      file: { buffer: Buffer.from(inst2Csv, 'utf-8'), originalname: 'beacon_roster.csv' },
      user: { id: 'admin-2', role: 'INSTITUTION_ADMIN', email: 'admin@beacon.edu' }
    });

    const v2 = await commitRosterVersion(
      upload2._id,
      { id: 'admin-2', role: 'INSTITUTION_ADMIN', email: 'admin@beacon.edu' }
    );
    inst2VersionId = v2._id;

    // 4. Build 20 rows for Small Rural Polytechnic (below threshold 50)
    const recentAdmDateSmall = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let smallCsv = 'ApplicationNo,ApaarId,StudentName,DOB,Gender,Category,ProgrammeCode,AcademicYear,Quota,AdmissionDate\n';
    for (let i = 1; i <= 20; i++) {
      const appNo = `APP-POLY-${3000 + i}`;
      const apaar = `7777-0000-${String(i).padStart(4, '0')}`;
      const name = `Poly Student ${i}`;
      const dob = '2005-02-10';
      smallCsv += `${appNo},${apaar},${name},${dob},MALE,SC,DCE,${academicYear},STATE_MERIT,${recentAdmDateSmall}\n`;
    }

    const uploadSmall = await processRosterUpload({
      institutionId: smallInstId,
      academicYear,
      programmeCode: 'DCE',
      file: { buffer: Buffer.from(smallCsv, 'utf-8'), originalname: 'small_roster.csv' },
      user: { id: 'admin-small', role: 'INSTITUTION_ADMIN', email: 'admin@smallpoly.edu' }
    });

    await commitRosterVersion(
      uploadSmall._id,
      { id: 'admin-small', role: 'INSTITUTION_ADMIN', email: 'admin@smallpoly.edu' }
    );

    // 5. Seed Findings for Inst1: 2 open discrepancies + 1 SOURCE_UNAVAILABLE
    await ReconciliationFinding.create([
      {
        runId: `RUN-${Date.now()}-1`,
        institutionId: inst1Id,
        type: 'CONFLICT',
        severity: 'HIGH',
        reviewStatus: 'PENDING',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days old
      },
      {
        runId: `RUN-${Date.now()}-1`,
        institutionId: inst1Id,
        type: 'UNMATCHED',
        severity: 'MEDIUM',
        reviewStatus: 'PENDING',
        createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000) // 12 days old
      },
      {
        // SOURCE_UNAVAILABLE must NOT contribute to discrepancy metric
        runId: `RUN-${Date.now()}-1`,
        institutionId: inst1Id,
        type: 'SOURCE_UNAVAILABLE',
        severity: 'INFO',
        reviewStatus: 'PENDING',
        sourceRefs: [{ source: 'NATIONAL_APAAR_REGISTRY' }],
        createdAt: new Date()
      }
    ]);

    // 6. Seed External Registers for Coverage
    await ExternalRegisterRecord.create([
      {
        institutionId: inst1Id,
        programmeCode: 'CSE',
        academicYear,
        sourceType: 'ALLOTMENT',
        sourceMode: 'SIMULATED',
        sourceIdentifier: 'CENTRAL_ALLOTMENT_REG_01',
        candidateName: 'Apex Student 1',
        normalisedName: 'APEX STUDENT 1',
        dob: '2004-05-15',
        apaarToken: 'apaar-token-001',
        applicationNo: 'APP-APEX-1001'
      },
      {
        institutionId: inst1Id,
        programmeCode: 'CSE',
        academicYear,
        sourceType: 'EXAM',
        sourceMode: 'SIMULATED',
        sourceIdentifier: 'STATE_BOARD_EXAM_REG_01',
        candidateName: 'Apex Student 2',
        normalisedName: 'APEX STUDENT 2',
        dob: '2004-05-15',
        apaarToken: 'apaar-token-002',
        applicationNo: 'APP-APEX-1002'
      }
    ]);
  });

  afterAll(async () => {
    await Institution.deleteMany({ _id: { $in: [inst1Id, inst2Id, smallInstId] } });
    await Programme.deleteMany({ institutionId: { $in: [inst1Id, inst2Id, smallInstId] } });
    await RosterUpload.deleteMany({ institutionId: { $in: [inst1Id, inst2Id, smallInstId] } });
    await RosterVersion.deleteMany({ institutionId: { $in: [inst1Id, inst2Id, smallInstId] } });
    await RosterRow.deleteMany({ institutionId: { $in: [inst1Id, inst2Id, smallInstId] } });
    await ReconciliationFinding.deleteMany({ institutionId: { $in: [inst1Id, inst2Id, smallInstId] } });
    await ExternalRegisterRecord.deleteMany({ institutionId: { $in: [inst1Id, inst2Id, smallInstId] } });
    await ScoreSnapshot.deleteMany({ institutionId: { $in: [inst1Id, inst2Id, smallInstId] } });
    await DataCorrectionEvent.deleteMany({ institutionId: { $in: [inst1Id, inst2Id, smallInstId] } });
    await ScoringConfig.deleteMany({ configVersion: { $in: ['v2.0-test', 'v2.1-test'] } });
    await disconnectDB();
  });

  describe('1. Scorecard Retrieval & Mandatory Disclaimer', () => {
    test('GET /api/v1/scorecards/institutions/:institutionId returns complete scorecard snapshot', async () => {
      const res = await request(app)
        .get(`/api/v1/scorecards/institutions/${inst1Id}`)
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .query({ reportingPeriod: academicYear });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.institutionId).toBe(inst1Id.toString());
      expect(data.reportingPeriod).toBe(academicYear);
      expect(data.inScopeRecordCount).toBe(60);
      expect(data.isEligibleForScore).toBe(true);
      expect(typeof data.overallScore).toBe('number');
      expect(['STRONG', 'ADEQUATE', 'NEEDS_SUPPORT']).toContain(data.band);

      // Verify verbatim disclaimer
      expect(data.disclaimer).toBe(MANDATORY_DISCLAIMER);
      expect(data.disclaimer).toContain('It is not a misconduct verdict or a measure of overall institutional quality.');

      // Verify SOURCE_UNAVAILABLE was excluded from unresolved discrepancy count (2 open, not 3)
      expect(data.unresolvedCount).toBe(2);

      // Verify data coverage is independent
      expect(data.dataCoverage).toBeDefined();
      expect(data.dataCoverage.coveragePct).toBeGreaterThan(0);
      expect(data.dataCoverage.expectedSources).toContain('INSTITUTION_ROSTER');

      // Verify support suggestions are present
      expect(Array.isArray(data.supportSuggestions)).toBe(true);
      expect(data.supportSuggestions.length).toBeGreaterThan(0);
    });

    test('verifies that no punitive labels are present in the response', async () => {
      const res = await request(app)
        .get(`/api/v1/scorecards/institutions/${inst1Id}`)
        .set('x-user-role', 'AUTHORITY_ADMIN');

      const responseText = JSON.stringify(res.body).toLowerCase();
      expect(responseText).not.toContain('fraudulent');
      expect(responseText).not.toContain('dishonest');
      expect(responseText).not.toContain('low-quality');
      expect(responseText).not.toContain('bad institution');
    });
  });

  describe('2. Detailed Metrics Breakdown API', () => {
    test('GET /api/v1/scorecards/institutions/:institutionId/metrics returns M1, M2, M3, M4 breakdown', async () => {
      const res = await request(app)
        .get(`/api/v1/scorecards/institutions/${inst1Id}/metrics`)
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .query({ reportingPeriod: academicYear });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { metrics, dataCoverage } = res.body.data;

      // M1 Completeness
      expect(metrics.m1Completeness.status).toBe('AVAILABLE');
      expect(metrics.m1Completeness.inScopeRecords).toBe(60);
      expect(metrics.m1Completeness.missingFieldsCount.apaarToken).toBe(5);
      expect(metrics.m1Completeness.completenessPct).toBeGreaterThan(90);

      // M2 Discrepancies
      expect(metrics.m2Discrepancies.status).toBe('AVAILABLE');
      expect(metrics.m2Discrepancies.openDiscrepancies).toBe(2);
      expect(metrics.m2Discrepancies.ageingBuckets['0_to_7_days']).toBe(1);
      expect(metrics.m2Discrepancies.ageingBuckets['8_to_30_days']).toBe(1);
      expect(metrics.m2Discrepancies.subScore).toBeGreaterThan(0);

      // M3 Timeliness
      expect(metrics.m3Timeliness.status).toBe('AVAILABLE');
      expect(metrics.m3Timeliness.eligibleEventCount).toBe(60);
      expect(metrics.m3Timeliness.onTimePct).toBe(100);

      // M4 Corrections (disabled in score by default)
      expect(metrics.m4Corrections.enabledInScore).toBe(false);
      expect(metrics.m4Corrections.weightConfigured).toBe(0.00);

      // Coverage
      expect(dataCoverage.coveragePct).toBe(100);
    });
  });

  describe('3. Minimum Data Safeguards & Insufficient Data Behaviour', () => {
    test('institution with 20 records (<50) returns band: INSUFFICIENT_DATA and overallScore: null', async () => {
      const res = await request(app)
        .get(`/api/v1/scorecards/institutions/${smallInstId}`)
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .query({ reportingPeriod: academicYear });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.isEligibleForScore).toBe(false);
      expect(data.ineligibleReason).toContain('below the minimum required threshold of 50 records');
      expect(data.overallScore).toBeNull();
      expect(data.overallScore).not.toBe(0);
      expect(data.band).toBe('INSUFFICIENT_DATA');
    });
  });

  describe('4. Score Recalculation & Staleness Tracking', () => {
    test('POST /api/v1/scorecards/recalculate recalculates score and clears stale flag', async () => {
      // Ensure baseline snapshot exists
      await request(app)
        .get(`/api/v1/scorecards/institutions/${inst1Id}`)
        .set('x-user-role', 'AUTHORITY_ADMIN');

      // First, artificially mark snapshot stale
      await ScoreSnapshot.updateMany({ institutionId: inst1Id }, { $set: { isStale: true, staleReason: 'ROSTER_COMMITTED' } });

      const staleCheck = await ScoreSnapshot.findOne({ institutionId: inst1Id });
      expect(staleCheck).not.toBeNull();
      expect(staleCheck.isStale).toBe(true);

      const res = await request(app)
        .post('/api/v1/scorecards/recalculate')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          institutionId: inst1Id.toString(),
          reportingPeriod: academicYear
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isStale).toBe(false);
      expect(res.body.data.staleReason).toBeNull();
    });

    test('institution user cannot trigger recalculation for another institution (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/scorecards/recalculate')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', inst1Id.toString())
        .send({
          institutionId: inst2Id.toString(),
          reportingPeriod: academicYear
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('5. Multi-Institution Comparison & Privacy Anonymisation', () => {
    test('GET /api/v1/scorecards/compare returns comparison with comparability warning for mismatched types', async () => {
      const res = await request(app)
        .get('/api/v1/scorecards/compare')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .query({
          institutions: `${inst1Id},${inst2Id}`,
          reportingPeriod: academicYear
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { isDirectlyComparable, comparabilityWarnings, institutions } = res.body.data;
      expect(isDirectlyComparable).toBe(false);
      expect(comparabilityWarnings.some((w) => w.includes('Mismatched institution types'))).toBe(true);
      expect(institutions.length).toBe(2);

      // Authority user sees real names
      expect(institutions[0].institutionName).toBe('Apex Institute of Engineering (DEMO)');
      expect(institutions[1].institutionName).toBe('Beacon School of Management (DEMO)');
    });

    test('anonymises peer institution for institution-scoped caller', async () => {
      const res = await request(app)
        .get('/api/v1/scorecards/compare')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', inst1Id.toString())
        .query({
          institutions: `${inst1Id},${inst2Id}`,
          reportingPeriod: academicYear
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { institutions } = res.body.data;

      // Caller's own institution is visible
      const own = institutions.find((i) => i.isOwnInstitution);
      expect(own).toBeDefined();
      expect(own.institutionName).toBe('Apex Institute of Engineering (DEMO)');

      // Peer institution is masked
      const peer = institutions.find((i) => !i.isOwnInstitution);
      expect(peer).toBeDefined();
      expect(peer.institutionName).toContain('Peer Institution');
      expect(peer.institutionName).not.toContain('Beacon School of Management');
      expect(peer.institutionCode).toContain('PEER-');
    });

    test('rejects comparison request with fewer than 2 institutions with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .get('/api/v1/scorecards/compare')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .query({ institutions: inst1Id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('6. Scoring Configuration Lifecycle & Permissions', () => {
    test('GET /api/v1/scorecards/config returns active configuration', async () => {
      const res = await request(app)
        .get('/api/v1/scorecards/config')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', inst1Id.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.configVersion).toBeDefined();
      expect(res.body.data.weights.m1Completeness).toBe(0.40);
      expect(res.body.data.weights.m2Discrepancies).toBe(0.30);
    });

    test('AUTHORITY_ADMIN can create a new versioned scoring configuration (POST /config)', async () => {
      const res = await request(app)
        .post('/api/v1/scorecards/config')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          configVersion: 'v2.0-test',
          name: 'Updated Weights Formula v2.0',
          weights: {
            m1Completeness: 0.50,
            m2Discrepancies: 0.25,
            m3Timeliness: 0.25,
            m4Corrections: 0.00
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.configVersion).toBe('v2.0-test');
      expect(res.body.data.weights.m1Completeness).toBe(0.50);
    });

    test('INSTITUTION_ADMIN is forbidden from creating scoring configuration (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/scorecards/config')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', inst1Id.toString())
        .send({ configVersion: 'v2.1-unauth' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('AUDITOR role is read-only and forbidden from creating scoring configuration (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/scorecards/config')
        .set('x-user-role', 'AUDITOR')
        .send({ configVersion: 'v2.1-unauth' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('7. Historical Snapshot Preservation & Trend API', () => {
    test('GET /api/v1/scorecards/institutions/:institutionId/trend returns historical series', async () => {
      const res = await request(app)
        .get(`/api/v1/scorecards/institutions/${inst1Id}/trend`)
        .set('x-user-role', 'AUTHORITY_ADMIN');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataPoints).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.data.trend)).toBe(true);

      const pt = res.body.data.trend[0];
      expect(pt.reportingPeriod).toBe(academicYear);
      expect(pt.configVersion).toBeDefined();
    });

    test('GET /api/v1/scorecards/institutions/:institutionId/history returns paginated snapshots', async () => {
      const res = await request(app)
        .get(`/api/v1/scorecards/institutions/${inst1Id}/history`)
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.meta.pagination).toBeDefined();
      expect(res.body.meta.pagination.page).toBe(1);
    });
  });

  describe('8. Correction Volume Invariance under Default Configuration', () => {
    test('logging correction events does not alter overall score when M4 is disabled', async () => {
      // 1. Recalculate baseline score under active config
      const initial = await request(app)
        .post('/api/v1/scorecards/recalculate')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({ institutionId: inst1Id.toString(), reportingPeriod: academicYear });

      const initialScore = initial.body.data.overallScore;

      // 2. Log 10 correction events
      for (let i = 1; i <= 10; i++) {
        await DataCorrectionEvent.create({
          institutionId: inst1Id,
          reportingPeriod: academicYear,
          recordId: `ROW-${i}`,
          fieldCorrected: 'apaarToken',
          isRepeatCorrection: i % 3 === 0,
          isSelfInitiated: true,
          turnaroundHours: 24
        });
      }

      // 3. Recalculate scorecard
      const recalculated = await request(app)
        .post('/api/v1/scorecards/recalculate')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({ institutionId: inst1Id.toString(), reportingPeriod: academicYear });

      expect(recalculated.status).toBe(200);
      const newScore = recalculated.body.data.overallScore;

      // Score must remain identical
      expect(newScore).toBe(initialScore);

      // But M4 metrics must reflect the real corrections
      const m4 = recalculated.body.data.metrics.m4Corrections;
      expect(m4.totalCorrections).toBeGreaterThanOrEqual(10);
      expect(m4.enabledInScore).toBe(false);
    });
  });

  describe('9. Cross-Institution Security Scoping', () => {
    test('institution user cannot access scorecard of another institution (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/scorecards/institutions/${inst2Id}`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', inst1Id.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('institution user cannot access metrics of another institution (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/scorecards/institutions/${inst2Id}/metrics`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', inst1Id.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
