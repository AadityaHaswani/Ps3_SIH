/**
 * Feature 5 Integration Test Suite:
 * Privacy-Preserving Student Lifecycle, Transfer Handshake & Overlap Review.
 */
require('../src/config/dns');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');

const Institution = require('../src/models/institution.model');
const Programme = require('../src/models/programme.model');
const StudentLifecycleEvent = require('../src/models/lifecycleEvent.model');
const TransferCase = require('../src/models/transferCase.model');
const OverlapCase = require('../src/models/overlapCase.model');
const SeatLedgerEntry = require('../src/models/seatLedgerEntry.model');
const SeatBalance = require('../src/models/seatBalance.model');
const ScoreSnapshot = require('../src/models/scoreSnapshot.model');
const ReconciliationRun = require('../src/models/reconciliationRun.model');
const RosterVersion = require('../src/models/rosterVersion.model');

const { generateApaarToken } = require('../src/utils/cryptoToken');
const { DEFAULT_NEUTRAL_EXPLANATION } = require('../src/models/overlapCase.model');

describe('Feature 5: Student Lifecycle & Transfer Handshake Integration Suite', () => {
  const instAId = new mongoose.Types.ObjectId();
  const instBId = new mongoose.Types.ObjectId();
  const instCId = new mongoose.Types.ObjectId(); // Unrelated institution for staleness tests
  const academicYear = '2024-25';
  const programmeCode = 'BTECH_CSE';

  const rawApaar1 = '8888-0000-1111';
  const rawApaar2 = '8888-0000-2222';
  const token1 = generateApaarToken(rawApaar1, 'v1');
  const token2 = generateApaarToken(rawApaar2, 'v1');

  beforeAll(async () => {
    await connectDB();

    // 1. Create Institutions
    await Institution.create([
      {
        _id: instAId,
        code: `INST_A_${Date.now()}`,
        name: 'Alpha Engineering Institute',
        type: 'ENGINEERING',
        state: 'DELHI'
      },
      {
        _id: instBId,
        code: `INST_B_${Date.now()}`,
        name: 'Beta University Institute',
        type: 'ENGINEERING',
        state: 'KARNATAKA'
      },
      {
        _id: instCId,
        code: `INST_C_${Date.now()}`,
        name: 'Gamma Technical College',
        type: 'ENGINEERING',
        state: 'MAHARASHTRA'
      }
    ]);

    // 2. Create Programmes with Approved Intake
    await Programme.create([
      {
        institutionId: instAId,
        code: programmeCode,
        name: 'Computer Science and Engineering',
        level: 'UG',
        durationYears: 4,
        intakeByYear: [{ academicYear, approvedIntake: 60, isApproved: true }]
      },
      {
        institutionId: instBId,
        code: programmeCode,
        name: 'Computer Science and Engineering',
        level: 'UG',
        durationYears: 4,
        intakeByYear: [{ academicYear, approvedIntake: 60, isApproved: true }]
      }
    ]);

    // 3. Create initial ScoreSnapshots for instA and instC to test targeted staleness
    await ScoreSnapshot.create([
      {
        institutionId: instAId,
        reportingPeriod: academicYear,
        configVersion: 'v1.0',
        overallScore: 85,
        isStale: false,
        staleReason: null,
        metrics: {
          m1Completeness: { status: 'AVAILABLE', overallScore: 90 },
          m2Discrepancies: { status: 'AVAILABLE', overallScore: 80 },
          m3Timeliness: { status: 'AVAILABLE', overallScore: 85 },
          m4Corrections: { status: 'AVAILABLE', overallScore: 85 },
          dataCoverage: { coveragePct: 100 }
        }
      },
      {
        institutionId: instCId,
        reportingPeriod: academicYear,
        configVersion: 'v1.0',
        overallScore: 92,
        isStale: false,
        staleReason: null,
        metrics: {
          m1Completeness: { status: 'AVAILABLE', overallScore: 95 },
          m2Discrepancies: { status: 'AVAILABLE', overallScore: 90 },
          m3Timeliness: { status: 'AVAILABLE', overallScore: 90 },
          m4Corrections: { status: 'AVAILABLE', overallScore: 90 },
          dataCoverage: { coveragePct: 100 }
        }
      }
    ]);
  });

  afterAll(async () => {
    await StudentLifecycleEvent.deleteMany({
      institutionId: { $in: [instAId, instBId, instCId] }
    });
    await TransferCase.deleteMany({
      $or: [{ sendingInstitutionId: instAId }, { receivingInstitutionId: instAId }]
    });
    await OverlapCase.deleteMany({
      'institutions.institutionId': { $in: [instAId, instBId, instCId] }
    });
    await SeatLedgerEntry.deleteMany({
      institutionId: { $in: [instAId, instBId, instCId] }
    });
    await SeatBalance.deleteMany({
      institutionId: { $in: [instAId, instBId, instCId] }
    });
    await ScoreSnapshot.deleteMany({
      institutionId: { $in: [instAId, instBId, instCId] }
    });
    await Programme.deleteMany({
      institutionId: { $in: [instAId, instBId, instCId] }
    });
    await Institution.deleteMany({
      _id: { $in: [instAId, instBId, instCId] }
    });
    await disconnectDB();
  });

  // =========================================================================
  // 1. LIFECYCLE EVENT RECORDING & TIMELINE
  // =========================================================================
  describe('1. Lifecycle Event Recording & State Transitions', () => {
    let admittedEventId;

    test('POST /api/v1/lifecycle/events records ADMITTED event', async () => {
      const res = await request(app)
        .post('/api/v1/lifecycle/events')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          rawApaar: rawApaar1,
          institutionId: instAId.toString(),
          type: 'ADMITTED',
          effectiveDate: '2024-07-01',
          programmeCode,
          academicYear,
          reason: 'Direct central counselling admission'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.event).toBeDefined();
      expect(res.body.data.event.type).toBe('ADMITTED');
      expect(res.body.data.event.status).toBe('VALID');
      expect(res.body.data.event.studentTokenId).toBe(token1);
      // Raw APAAR must never be persisted
      expect(res.body.data.event.rawApaar).toBeUndefined();

      admittedEventId = res.body.data.event._id;
    });

    test('Valid transition ADMITTED -> ENROLLED succeeds', async () => {
      const res = await request(app)
        .post('/api/v1/lifecycle/events')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: token1,
          institutionId: instAId.toString(),
          type: 'ENROLLED',
          effectiveDate: '2024-07-15',
          programmeCode,
          academicYear,
          reason: 'Fee paid and documents verified'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.event.type).toBe('ENROLLED');
    });

    test('Illegal transition returns HTTP 422 with explanation and allowed transitions', async () => {
      // Trying to transition from ENROLLED directly to ADMITTED is illegal
      const res = await request(app)
        .post('/api/v1/lifecycle/events')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: token1,
          institutionId: instAId.toString(),
          type: 'ADMITTED',
          effectiveDate: '2024-07-20',
          programmeCode,
          academicYear
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_LIFECYCLE_TRANSITION');
    });

    test('Idempotent replay returns existing event without creating duplicate', async () => {
      const idempotencyKey = `idem_lifecycle_${Date.now()}`;
      const rawApaarIdem = '8888-0000-4444';
      const tokenIdem = generateApaarToken(rawApaarIdem, 'v1');

      const res1 = await request(app)
        .post('/api/v1/lifecycle/events')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: tokenIdem,
          institutionId: instAId.toString(),
          type: 'ADMITTED',
          effectiveDate: '2024-07-05',
          idempotencyKey
        });

      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post('/api/v1/lifecycle/events')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: tokenIdem,
          institutionId: instAId.toString(),
          type: 'ADMITTED',
          effectiveDate: '2024-07-05',
          idempotencyKey
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.isReplay).toBe(true);
    });

    test('Non-destructive correction creates new CORRECTED event and marks prior event SUPERSEDED', async () => {
      const res = await request(app)
        .post('/api/v1/lifecycle/events')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: token1,
          institutionId: instAId.toString(),
          type: 'CORRECTED',
          supersedesEventId: admittedEventId,
          effectiveDate: '2024-07-02',
          reason: 'Corrected admission date based on physical counselling voucher'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.event.type).toBe('CORRECTED');
      expect(res.body.data.event.supersedesEventId).toBe(admittedEventId);

      // Verify prior event is now marked SUPERSEDED
      const supersededEvent = await StudentLifecycleEvent.findById(admittedEventId);
      expect(supersededEvent.status).toBe('SUPERSEDED');
    });

    test('GET /api/v1/lifecycle/students/:tokenId/events returns opaque studentRef and timeline', async () => {
      const res = await request(app)
        .get(`/api/v1/lifecycle/students/${token1}/events`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.studentRef).toMatch(/^STU-[A-F0-9]{12}$/);
      expect(res.body.data.currentState).toBe('ENROLLED');
      expect(Array.isArray(res.body.data.events)).toBe(true);
      expect(res.body.data.events.length).toBeGreaterThanOrEqual(2);

      // Full cross-institution token must not be disclosed to institution callers
      expect(res.body.data.events[0].studentTokenId).toBeUndefined();
    });

    test('Cross-institution student timeline access is prohibited for foreign institutions', async () => {
      const res = await request(app)
        .get(`/api/v1/lifecycle/students/${token1}/events`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instCId.toString());

      expect(res.status).toBe(200);
      // Student has no events at instC, so totalEvents is 0
      expect(res.body.data.totalEvents).toBe(0);
      expect(res.body.data.currentState).toBe('UNKNOWN');
    });
  });

  // =========================================================================
  // 2. TWO-SIDED TRANSFER HANDSHAKE & SEAT LEDGER INTEGRATION
  // =========================================================================
  describe('2. Two-Sided Transfer Handshake & Ledger Integration', () => {
    let transferId;
    const transferEffectiveDate = '2024-08-10';

    test('POST /api/v1/transfers creates pending transfer case', async () => {
      const res = await request(app)
        .post('/api/v1/transfers')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: token1,
          sendingInstitutionId: instAId.toString(),
          receivingInstitutionId: instBId.toString(),
          programmeCode,
          academicYear,
          seatCategory: 'GENERAL',
          proposedEffectiveDate: transferEffectiveDate
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.sendingConfirmation.status).toBe('PENDING');
      expect(res.body.data.receivingConfirmation.status).toBe('PENDING');

      transferId = res.body.data._id;
    });

    test('Duplicate active transfer for same student & institutions returns 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/transfers')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: token1,
          sendingInstitutionId: instAId.toString(),
          receivingInstitutionId: instBId.toString(),
          programmeCode,
          academicYear,
          proposedEffectiveDate: transferEffectiveDate
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    test('Sending Institution Admin confirms sending side; case remains PENDING', async () => {
      const res = await request(app)
        .patch(`/api/v1/transfers/${transferId}/confirm`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          side: 'SENDING',
          effectiveDate: transferEffectiveDate,
          reasonCode: 'STUDENT_MIGRATION_NOC_ISSUED',
          notes: 'No objection certificate issued following parent relocation'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.sendingConfirmation.status).toBe('CONFIRMED');
      expect(res.body.data.receivingConfirmation.status).toBe('PENDING');
      expect(res.body.data.status).toBe('PENDING');
    });

    test('Wrong institution cannot confirm receiving side (returns 403 Forbidden)', async () => {
      // Inst A (sending) tries to confirm the receiving side
      const res = await request(app)
        .patch(`/api/v1/transfers/${transferId}/confirm`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          side: 'RECEIVING',
          effectiveDate: transferEffectiveDate,
          reasonCode: 'ADMISSION_APPROVED_VACANCY',
          notes: 'Fraudulent confirmation attempt on wrong side'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('AUDITOR role cannot mutate transfer data (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/transfers/${transferId}/confirm`)
        .set('x-user-role', 'AUDITOR')
        .send({
          effectiveDate: transferEffectiveDate,
          reasonCode: 'ADMISSION_APPROVED_VACANCY',
          notes: 'Auditor mutation attempt'
        });

      expect(res.status).toBe(403);
    });

    test('Receiving Institution Admin confirms receiving side; case transitions to TRANSFER_CONFIRMED & syncs Seat Ledger', async () => {
      const res = await request(app)
        .patch(`/api/v1/transfers/${transferId}/confirm`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instBId.toString())
        .send({
          effectiveDate: transferEffectiveDate,
          reasonCode: 'ADMISSION_APPROVED_VACANCY',
          notes: 'Candidate accepted against vacant regular seat'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('TRANSFER_CONFIRMED');
      expect(res.body.data.ledgerSynced).toBe(true);
      expect(res.body.data.ledgerEntries.length).toBe(2);

      // Verify SeatLedgerEntry for sending institution (TRANSFER_OUT: delta -1)
      const outEntry = await SeatLedgerEntry.findOne({
        institutionId: instAId,
        type: 'TRANSFER_OUT',
        sourceReference: transferId.toString()
      });
      expect(outEntry).toBeDefined();
      expect(outEntry.delta).toBe(-1);

      // Verify SeatLedgerEntry for receiving institution (TRANSFER_IN: delta +1)
      const inEntry = await SeatLedgerEntry.findOne({
        institutionId: instBId,
        type: 'TRANSFER_IN',
        sourceReference: transferId.toString()
      });
      expect(inEntry).toBeDefined();
      expect(inEntry.delta).toBe(1);

      // Confirm re-running confirmation does NOT duplicate ledger entries
      const resRetry = await request(app)
        .patch(`/api/v1/transfers/${transferId}/confirm`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instBId.toString())
        .send({
          side: 'RECEIVING',
          effectiveDate: transferEffectiveDate,
          reasonCode: 'ADMISSION_APPROVED_VACANCY',
          notes: 'Retry confirmation'
        });

      expect(resRetry.status).toBe(200);
      const totalEntries = await SeatLedgerEntry.countDocuments({
        sourceReference: transferId.toString()
      });
      expect(totalEntries).toBe(2);
    });
  });

  // =========================================================================
  // 3. TRANSFER REJECTION & DATE-GAP TOLERANCE
  // =========================================================================
  describe('3. Transfer Date-Gap Conflict & Rejection', () => {
    test('Date-gap exceeding tolerance (> 7 days) routes transfer to NEEDS_REVIEW', async () => {
      // Create transfer case
      const createRes = await request(app)
        .post('/api/v1/transfers')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: token2,
          sendingInstitutionId: instAId.toString(),
          receivingInstitutionId: instBId.toString(),
          programmeCode,
          academicYear,
          proposedEffectiveDate: '2024-09-01'
        });

      const tcId = createRes.body.data._id;

      // Sending side confirms on Sept 01
      await request(app)
        .patch(`/api/v1/transfers/${tcId}/confirm`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          effectiveDate: '2024-09-01',
          reasonCode: 'STUDENT_MIGRATION_NOC_ISSUED',
          notes: 'Sending confirmed'
        });

      // Receiving side confirms with 20 days gap (Sept 21) -> exceeds 7 days tolerance!
      const recvRes = await request(app)
        .patch(`/api/v1/transfers/${tcId}/confirm`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instBId.toString())
        .send({
          effectiveDate: '2024-09-21',
          reasonCode: 'ADMISSION_APPROVED_VACANCY',
          notes: 'Receiving confirmed with significant date divergence'
        });

      expect(recvRes.status).toBe(200);
      expect(recvRes.body.data.status).toBe('NEEDS_REVIEW');
      expect(recvRes.body.data.dateGapDays).toBe(20);
      expect(recvRes.body.data.ledgerSynced).toBe(false);
    });

    test('Transfer rejection transitions case to TRANSFER_REJECTED and does NOT alter ledger', async () => {
      const rawApaar3 = '8888-0000-3333';
      const token3 = generateApaarToken(rawApaar3, 'v1');

      const createRes = await request(app)
        .post('/api/v1/transfers')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: token3,
          sendingInstitutionId: instAId.toString(),
          receivingInstitutionId: instBId.toString(),
          programmeCode,
          academicYear,
          proposedEffectiveDate: '2024-09-05'
        });

      const tcId = createRes.body.data._id;

      const rejectRes = await request(app)
        .patch(`/api/v1/transfers/${tcId}/reject`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instBId.toString())
        .send({
          reasonCode: 'INELIGIBLE_ACADEMIC_CREDITS',
          notes: 'Insufficient prerequisite credits from sending programme'
        });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('TRANSFER_REJECTED');
      expect(rejectRes.body.data.ledgerSynced).toBe(false);

      const ledgerEntries = await SeatLedgerEntry.countDocuments({ transferCaseId: tcId });
      expect(ledgerEntries).toBe(0);
    });

    test('POST /api/v1/transfers/process-timeouts moves expired pending transfers to NEEDS_REVIEW', async () => {
      // Create a transfer with past deadline
      const pastDeadline = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const expiredCase = await TransferCase.create({
        studentTokenId: token1,
        keyVersion: 'v1',
        sendingInstitutionId: instAId,
        receivingInstitutionId: instBId,
        programmeCode,
        academicYear,
        proposedEffectiveDate: new Date(),
        status: 'PENDING',
        deadline: pastDeadline,
        dateGapDays: 0,
        ledgerSynced: false
      });

      const timeoutRes = await request(app)
        .post('/api/v1/transfers/process-timeouts')
        .set('x-user-role', 'AUTHORITY_ADMIN');

      expect(timeoutRes.status).toBe(200);
      expect(timeoutRes.body.data.timedOutCount).toBeGreaterThanOrEqual(1);

      const updatedExpired = await TransferCase.findById(expiredCase._id);
      expect(updatedExpired.status).toBe('NEEDS_REVIEW');
    });
  });

  // =========================================================================
  // 4. CROSS-INSTITUTION OVERLAP DETECTION & REVIEW RESOLUTION
  // =========================================================================
  describe('4. Enrolment Overlap Detection & Authority Review Resolution', () => {
    let overlapCaseId;
    const overlapStudentApaar = '9999-7777-1111';
    const overlapStudentToken = generateApaarToken(overlapStudentApaar, 'v1');

    test('Concurrent active enrolments across two institutions generate an OverlapCase with neutral explanation', async () => {
      // 1. Enrol at Inst A from 2024-07-01 (ongoing)
      await request(app)
        .post('/api/v1/lifecycle/events')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          studentTokenId: overlapStudentToken,
          institutionId: instAId.toString(),
          type: 'ENROLLED',
          effectiveDate: '2024-07-01',
          programmeCode,
          academicYear
        });

      // 2. Enrol at Inst B from 2024-08-01 (concurrent / overlapping!)
      await request(app)
        .post('/api/v1/lifecycle/events')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instBId.toString())
        .send({
          studentTokenId: overlapStudentToken,
          institutionId: instBId.toString(),
          type: 'ENROLLED',
          effectiveDate: '2024-08-01',
          programmeCode,
          academicYear
        });

      // Verify OverlapCase was detected and created
      const cases = await OverlapCase.find({
        studentTokenId: overlapStudentToken
      });
      expect(cases.length).toBe(1);
      const ovCase = cases[0];
      expect(ovCase.status).toBe('OPEN');
      expect(ovCase.severity).toBe('INFO');
      expect(ovCase.explanation).toBe(DEFAULT_NEUTRAL_EXPLANATION);
      expect(ovCase.policyVerified).toBe(false);

      overlapCaseId = ovCase.caseId;
    });

    test('GET /api/v1/overlap-cases lists cases scoped by institution', async () => {
      const res = await request(app)
        .get('/api/v1/overlap-cases')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      // Institution user must not see raw token
      expect(res.body.data[0].studentTokenId).toBeUndefined();
      expect(res.body.data[0].studentRef).toBeDefined();
    });

    test('Institution user cannot resolve an overlap case (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/overlap-cases/${overlapCaseId}/resolve`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', instAId.toString())
        .send({
          code: 'LEGITIMATE_TRANSFER',
          notes: 'Institution attempting unauthorized resolution'
        });

      expect(res.status).toBe(403);
    });

    test('Designated Authority Officer resolves overlap case with append-only history', async () => {
      const res = await request(app)
        .patch(`/api/v1/overlap-cases/${overlapCaseId}/resolve`)
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .set('x-user-email', 'director@aicte.gov.in')
        .send({
          code: 'LEGITIMATE_TRANSFER',
          notes: 'Parent submitted inter-state transfer migration approval certificate dated 2024-08-15.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('RESOLVED');
      expect(res.body.data.resolution.code).toBe('LEGITIMATE_TRANSFER');
      expect(res.body.data.resolutionHistory.length).toBe(1);
      expect(res.body.data.resolutionHistory[0].code).toBe('LEGITIMATE_TRANSFER');
    });
  });

  // =========================================================================
  // 5. SCORECARD & STALENESS INTEGRATION
  // =========================================================================
  describe('5. Scorecard Staleness & Reconciliation Completion Hooks', () => {
    test('Reconciliation completion marks affected institution snapshot stale while unrelated institution remains fresh', async () => {
      // Ensure clean fresh baseline for both snapshots before reconciliation
      await ScoreSnapshot.updateOne(
        { institutionId: instAId, reportingPeriod: academicYear },
        { isStale: false, staleReason: null }
      );
      await ScoreSnapshot.updateOne(
        { institutionId: instCId, reportingPeriod: academicYear },
        { isStale: false, staleReason: null }
      );

      const snapBeforeA = await ScoreSnapshot.findOne({
        institutionId: instAId,
        reportingPeriod: academicYear
      });
      const snapBeforeC = await ScoreSnapshot.findOne({
        institutionId: instCId,
        reportingPeriod: academicYear
      });

      // Verify both are fresh initially
      expect(snapBeforeA.isStale).toBe(false);
      expect(snapBeforeC.isStale).toBe(false);

      // Create a committed RosterVersion for instA
      const rosterVer = await RosterVersion.create({
        institutionId: instAId,
        academicYear,
        versionNumber: 1,
        uploadId: new mongoose.Types.ObjectId(),
        fileSha256: 'a'.repeat(64),
        status: 'COMMITTED',
        committedAt: new Date()
      });

      // Trigger reconciliation for instA
      const reconciliationService = require('../src/services/reconciliationService');
      await reconciliationService.runReconciliation({
        institutionId: instAId,
        academicYear,
        rosterVersionId: rosterVer._id,
        sources: ['ROSTER', 'ADMISSION'],
        programmeCodes: [programmeCode],
        user: { id: 'admin1', role: 'AUTHORITY_ADMIN' }
      });

      // Verify instA snapshot is now marked stale
      const snapAfterA = await ScoreSnapshot.findOne({
        institutionId: instAId,
        reportingPeriod: academicYear
      });
      expect(snapAfterA.isStale).toBe(true);
      expect(snapAfterA.staleReason).toBe('RECONCILIATION_RUN_COMPLETED');

      // Unrelated institution instC MUST remain fresh!
      const snapAfterC = await ScoreSnapshot.findOne({
        institutionId: instCId,
        reportingPeriod: academicYear
      });
      expect(snapAfterC.isStale).toBe(false);
    });

    test('M3 Timeliness incorporates valid lifecycle event reporting lag without inventing missing dates', async () => {
      const metricCalculators = require('../src/services/scorecard/metricCalculators');

      // Calculate timeliness for instA where lifecycle events were recorded
      const timeliness = await metricCalculators.calculateTimeliness(
        instAId,
        academicYear,
        { parameters: { m3: { minDatedEvents: 2, onTimeWindowDays: 15, lagCeilingDays: 30 } } }
      );

      // Since we recorded events for instA, eligibleEventCount should be > 0 and status AVAILABLE
      expect(timeliness.eligibleEventCount).toBeGreaterThanOrEqual(2);
      expect(timeliness.status).toBe('AVAILABLE');
      expect(typeof timeliness.onTimePct).toBe('number');
      expect(typeof timeliness.medianLagDays).toBe('number');
      expect(typeof timeliness.subScore).toBe('number');
    });
  });
});
