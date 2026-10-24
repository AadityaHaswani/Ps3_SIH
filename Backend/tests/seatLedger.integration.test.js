/**
 * End-to-End Integration Tests for Feature 2:
 * Seat Ledger & Academic Mass-Balance Engine.
 *
 * Verifies:
 * - Append-only ledger entries and derived balance calculations
 * - Roster commitment synchronization without double-counting (58 -> 61, delta +3, not 119)
 * - Idempotent sync replays
 * - Intake governance and role-based access control (Institution vs Authority)
 * - Cross-institution data isolation enforcement
 * - Ledger drift and integrity auditing
 * - Academic mass-balance cohort carryover calculations
 * - Preservation of Feature 1 Reconciliation
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
const SeatBalance = require('../src/models/seatBalance.model');
const SeatLedgerEntry = require('../src/models/seatLedgerEntry.model');
const SeatBalanceSnapshot = require('../src/models/seatBalanceSnapshot.model');
const OccupancyRule = require('../src/models/occupancyRule.model');
const ReconciliationRun = require('../src/models/reconciliationRun.model');
const ReconciliationFinding = require('../src/models/reconciliationFinding.model');

const {
  processRosterUpload,
  commitRosterVersion
} = require('../src/services/rosterService');
const { buildBucketKey } = require('../src/services/seatLedgerService');

describe('Feature 2: Seat Ledger & Mass-Balance Integration Suite', () => {
  const institutionId = new mongoose.Types.ObjectId();
  const otherInstitutionId = new mongoose.Types.ObjectId();
  const academicYear = '2024-25';
  const programmeCode = 'CSE';
  const seatCategory = 'GENERAL';

  let testBucketKey;
  let version2Id;

  beforeAll(async () => {
    await connectDB();

    try {
      await SeatLedgerEntry.collection.dropIndex('idempotencyKey_1');
    } catch (err) {
      // index might not exist or already updated
    }
    await SeatLedgerEntry.syncIndexes();

    testBucketKey = buildBucketKey(institutionId, programmeCode, academicYear, seatCategory);

    // 1. Create Target Institution
    await Institution.create({
      _id: institutionId,
      code: `SIT_LEDGER_${Date.now()}`,
      name: 'Ledger Institute of Technology (DEMO)',
      type: 'ENGINEERING',
      state: 'Maharashtra',
      status: 'ACTIVE'
    });

    // 2. Create Second Institution for Scoping Security Test
    await Institution.create({
      _id: otherInstitutionId,
      code: `OTHER_LEDGER_${Date.now()}`,
      name: 'Other Autonomous Engineering College',
      type: 'ENGINEERING',
      state: 'Maharashtra',
      status: 'ACTIVE'
    });

    // 3. Create Programme Master with Approved Intake = 60
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
  });

  afterAll(async () => {
    // Clean up created test data
    await Institution.deleteMany({ _id: { $in: [institutionId, otherInstitutionId] } });
    await Programme.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await RosterUpload.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await RosterVersion.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await RosterRow.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await SeatBalance.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await SeatLedgerEntry.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await SeatBalanceSnapshot.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await ReconciliationRun.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await ReconciliationFinding.deleteMany({ institutionId: { $in: [institutionId, otherInstitutionId] } });
    await OccupancyRule.deleteMany({ ruleVersion: 'TEST-RULE-V1' });
    await disconnectDB();
  });

  describe('1. Roster Commitment Sync & Non-Double-Counting', () => {
    let version1Id;

    test('first committed roster (58 rows) sets ledger occupancy to 58', async () => {
      // Build synthetic CSV with 58 valid student rows
      let csvLines = ['applicationNo,apaarId,name,dob,gender,category,programmeCode,academicYear'];
      for (let i = 1; i <= 58; i++) {
        const appNo = `APP-2024-${String(i).padStart(3, '0')}`;
        const apaar = `9000${String(i).padStart(8, '0')}`;
        csvLines.push(`${appNo},${apaar},Student Name ${i},2005-01-01,MALE,GENERAL,${programmeCode},${academicYear}`);
      }
      const csvBuffer = Buffer.from(csvLines.join('\n'), 'utf8');

      // Process upload
      const upload1 = await processRosterUpload({
        institutionId,
        academicYear,
        programmeCode,
        file: { buffer: csvBuffer, originalname: 'roster_v1.csv' },
        user: { id: 'test-admin', role: 'INSTITUTION_ADMIN', email: 'admin@sit.edu' }
      });

      expect(upload1.rowCount).toBe(58);

      // Commit roster version 1 -> triggers ledger synchronization
      const committed1 = await commitRosterVersion(upload1._id, {
        id: 'test-admin',
        role: 'INSTITUTION_ADMIN',
        email: 'admin@sit.edu'
      });

      version1Id = committed1._id;

      // Verify SeatBalance bucket state
      const balance = await SeatBalance.findOne({ bucketKey: testBucketKey });
      expect(balance).not.toBeNull();
      expect(balance.reportedOccupancy).toBe(58);
      expect(balance.approvedIntake).toBe(60);
      expect(balance.headroom).toBe(2);
      expect(balance.utilisationPct).toBe(96.7);
      expect(balance.status).toBe('WARNING'); // >= 90% threshold

      // Verify SeatLedgerEntry
      const entries = await SeatLedgerEntry.find({ bucketKey: testBucketKey });
      expect(entries.length).toBe(1);
      expect(entries[0].type).toBe('ROSTER_SYNC_ADJUSTMENT');
      expect(entries[0].delta).toBe(58);
      expect(entries[0].balanceAfter.reportedOccupancy).toBe(58);
    });

    test('second committed roster (61 rows) adjusts occupancy to 61 without double-counting', async () => {
      // Build synthetic CSV with 61 valid student rows (net delta = +3)
      let csvLines = ['applicationNo,apaarId,name,dob,gender,category,programmeCode,academicYear'];
      for (let i = 1; i <= 61; i++) {
        const appNo = `APP-2024-${String(i).padStart(3, '0')}`;
        const apaar = `9000${String(i).padStart(8, '0')}`;
        csvLines.push(`${appNo},${apaar},Student Name ${i},2005-01-01,MALE,GENERAL,${programmeCode},${academicYear}`);
      }
      const csvBuffer = Buffer.from(csvLines.join('\n'), 'utf8');

      const upload2 = await processRosterUpload({
        institutionId,
        academicYear,
        programmeCode,
        file: { buffer: csvBuffer, originalname: 'roster_v2.csv' },
        user: { id: 'test-admin', role: 'INSTITUTION_ADMIN', email: 'admin@sit.edu' }
      });

      expect(upload2.rowCount).toBe(61);

      // Commit roster version 2
      const committed2 = await commitRosterVersion(upload2._id, {
        id: 'test-admin',
        role: 'INSTITUTION_ADMIN',
        email: 'admin@sit.edu'
      });

      version2Id = committed2._id;

      // Verify SeatBalance bucket state: occupancy must be 61 (NOT 58 + 61 = 119)
      const balance = await SeatBalance.findOne({ bucketKey: testBucketKey });
      expect(balance.reportedOccupancy).toBe(61);
      expect(balance.approvedIntake).toBe(60);
      expect(balance.headroom).toBe(-1);
      expect(balance.utilisationPct).toBe(101.7);
      expect(balance.status).toBe('OVER_CAP_DISCREPANCY');
      expect(balance.flags).toContain('OVER_CAP_ALERT');

      // Verify entries: exactly two entries, second delta is +3
      const entries = await SeatLedgerEntry.find({ bucketKey: testBucketKey }).sort({ createdAt: 1 });
      expect(entries.length).toBe(2);
      expect(entries[1].type).toBe('ROSTER_SYNC_ADJUSTMENT');
      expect(entries[1].delta).toBe(3); // Reconciles 58 -> 61
      expect(entries[1].balanceAfter.reportedOccupancy).toBe(61);

      // Verify sum of deltas equals current reported occupancy
      const deltaSum = entries.reduce((acc, curr) => acc + curr.delta, 0);
      expect(deltaSum).toBe(61);
    });

    test('replaying sync with same idempotency key does not create duplicate entries', async () => {
      const { syncRosterCommitToLedger } = require('../src/services/seatLedgerService');
      const version2 = await RosterVersion.findById(version2Id);

      // Call sync again with same version
      await syncRosterCommitToLedger(version2, { id: 'test-admin', role: 'INSTITUTION_ADMIN' });

      const entries = await SeatLedgerEntry.find({ bucketKey: testBucketKey });
      expect(entries.length).toBe(2); // Still 2, no duplicate inserted
    });
  });

  describe('2. Ledger Query APIs & Snapshots', () => {
    test('GET /api/v1/seat-ledger/balances retrieves paginated balances', async () => {
      const res = await request(app)
        .get('/api/v1/seat-ledger/balances')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString())
        .query({ academicYear, programmeCode });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      const match = res.body.data.items.find((b) => b.bucketKey === testBucketKey);
      expect(match).toBeDefined();
      expect(match.reportedOccupancy).toBe(61);
      expect(match.status).toBe('OVER_CAP_DISCREPANCY');
    });

    test('GET /api/v1/seat-ledger/balances/:id/entries retrieves audit trail for bucket', async () => {
      const balance = await SeatBalance.findOne({ bucketKey: testBucketKey });

      const res = await request(app)
        .get(`/api/v1/seat-ledger/balances/${balance._id}/entries`)
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString());

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.items[0].type).toBe('ROSTER_SYNC_ADJUSTMENT');
    });

    test('GET /api/v1/seat-ledger/history retrieves trendline snapshots', async () => {
      const res = await request(app)
        .get('/api/v1/seat-ledger/history')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString())
        .query({ bucketKey: testBucketKey });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.history.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('3. Intake Governance & Role Permissions', () => {
    test('institution user declares intake -> sets INTAKE_UNVERIFIED and INSTITUTION_DECLARED', async () => {
      const res = await request(app)
        .post('/api/v1/seat-ledger/intake-declarations')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString())
        .send({
          institutionId: institutionId.toString(),
          programmeCode: 'MECH',
          academicYear: '2024-25',
          seatCategory: 'GENERAL',
          declaredIntake: 60
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bucket.approvedIntake).toBe(60);
      expect(res.body.data.bucket.intakeSourceMode).toBe('INSTITUTION_DECLARED');
      expect(res.body.data.bucket.intakeVerificationStatus).toBe('INTAKE_UNVERIFIED');
    });

    test('institution user cannot configure authority-approved intake (403 Forbidden)', async () => {
      const res = await request(app)
        .put('/api/v1/seat-ledger/intake')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString())
        .send({
          institutionId: institutionId.toString(),
          programmeCode: 'MECH',
          academicYear: '2024-25',
          approvedIntake: 120
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('authority admin sets approved intake -> sets AUTHORITY_VERIFIED and syncs Programme', async () => {
      const res = await request(app)
        .put('/api/v1/seat-ledger/intake')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          institutionId: institutionId.toString(),
          programmeCode: programmeCode,
          academicYear: academicYear,
          seatCategory: seatCategory,
          approvedIntake: 65,
          sourceRef: 'AICTE/2024/APP-REV-001',
          verificationStatus: 'AUTHORITY_VERIFIED',
          sourceMode: 'SIMULATED'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bucket.approvedIntake).toBe(65);
      expect(res.body.data.bucket.intakeVerificationStatus).toBe('AUTHORITY_VERIFIED');
      expect(res.body.data.bucket.headroom).toBe(4); // 65 - 61 = 4
      expect(res.body.data.bucket.status).toBe('WARNING'); // 61 / 65 = 93.8% >= 90%

      // Verify Programme model embedded record was synchronized
      const prog = await Programme.findOne({ institutionId, code: programmeCode });
      const intakeRec = prog.intakeByYear.find((iy) => iy.academicYear === academicYear);
      expect(intakeRec).toBeDefined();
      expect(intakeRec.approvedIntake).toBe(65);
    });
  });

  describe('4. Cross-Institution Security Scoping', () => {
    test('institution user cannot declare intake for another institution (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/seat-ledger/intake-declarations')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString())
        .send({
          institutionId: otherInstitutionId.toString(), // Mismatched institution
          programmeCode: 'CIVIL',
          academicYear: '2024-25',
          declaredIntake: 30
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Cross-institution access is strictly prohibited');
    });
  });

  describe('5. Ledger Integrity Auditing API', () => {
    test('POST /api/v1/seat-ledger/verify-integrity returns ok: true when ledger is intact', async () => {
      const res = await request(app)
        .post('/api/v1/seat-ledger/verify-integrity')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({ institutionId: institutionId.toString(), academicYear });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ok).toBe(true);
      expect(res.body.data.driftsCount).toBe(0);
    });

    test('POST /api/v1/seat-ledger/verify-integrity detects deliberate drift between balance and ledger', async () => {
      // Deliberately tamper with cached balance in database
      const balance = await SeatBalance.findOne({ bucketKey: testBucketKey });
      const originalOccupancy = balance.reportedOccupancy;
      balance.reportedOccupancy = 999;
      await balance.save();

      const res = await request(app)
        .post('/api/v1/seat-ledger/verify-integrity')
        .set('x-user-role', 'AUDITOR')
        .send({ institutionId: institutionId.toString(), academicYear });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(false);
      expect(res.body.data.driftsCount).toBeGreaterThan(0);
      const drift = res.body.data.drifts.find((d) => d.bucketKey === testBucketKey);
      expect(drift).toBeDefined();
      expect(drift.cachedOccupancy).toBe(999);
      expect(drift.computedFromLedger).toBe(61);
      expect(drift.drift).toBe(999 - 61);

      // Restore balance
      balance.reportedOccupancy = originalOccupancy;
      await balance.save();
    });
  });

  describe('6. Academic Mass-Balance Cohort API', () => {
    beforeAll(async () => {
      // Seed a historical previous year bucket (2023-24) with occupancy = 60
      const prevBucketKey = buildBucketKey(institutionId, programmeCode, '2023-24', seatCategory);
      await SeatBalance.create({
        bucketKey: prevBucketKey,
        institutionId,
        programmeId: institutionId,
        programmeCode,
        academicYear: '2023-24',
        seatCategory,
        approvedIntake: 60,
        reportedOccupancy: 60,
        headroom: 0,
        utilisationPct: 100,
        status: 'OK'
      });
    });

    test('reconciles cohort carryover when expected matches reported current count', async () => {
      // Previous: 60, Entrants: 1, Exits: 0, Retention: 1.0 -> Expected: 61, Current: 61
      const res = await request(app)
        .get('/api/v1/seat-ledger/mass-balance')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString())
        .query({
          institutionId: institutionId.toString(),
          programmeCode,
          academicYear: '2024-25',
          previousAcademicYear: '2023-24',
          entrants: 1,
          exits: 0,
          retentionRate: 1.0
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('RECONCILED');
      expect(res.body.data.expectedContinuingCount).toBe(61);
      expect(res.body.data.reportedCurrentCount).toBe(61);
      expect(res.body.data.discrepancyDelta).toBe(0);
      expect(res.body.data.explanation).toContain('matches expected continuing count');
    });

    test('flags COHORT_CARRYOVER_MISMATCH with clear explanation when counts diverge', async () => {
      // Previous: 60, Entrants: 0, Exits: 0, Retention: 1.0 -> Expected: 60, Current: 61 -> Discrepancy: +1
      const res = await request(app)
        .get('/api/v1/seat-ledger/mass-balance')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString())
        .query({
          institutionId: institutionId.toString(),
          programmeCode,
          academicYear: '2024-25',
          previousAcademicYear: '2023-24',
          entrants: 0,
          exits: 0
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COHORT_CARRYOVER_MISMATCH');
      expect(res.body.data.discrepancyDelta).toBe(1);
      expect(res.body.data.explanation).toContain('Discrepancy delta: +1');
    });

    test('unknown programme rules do not trigger an invented violation', async () => {
      const res = await request(app)
        .get('/api/v1/seat-ledger/mass-balance')
        .set('x-user-role', 'INSTITUTION_ADMIN')
        .set('x-user-institution', institutionId.toString())
        .query({
          institutionId: institutionId.toString(),
          programmeCode: 'UNKNOWN_PROG_XYZ',
          academicYear: '2024-25'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UNKNOWN_PROGRAMME_RULES');
      expect(res.body.data.isProvisional).toBe(true);
      expect(res.body.data.explanation).toContain('not configured in the institutional programme master');
    });
  });

  describe('7. Feature 1 Backward Compatibility', () => {
    test('triggering Feature 1 reconciliation on committed roster executes with SIMULATED intake sourceMode', async () => {
      const res = await request(app)
        .post('/api/v1/reconciliations')
        .set('x-user-role', 'AUTHORITY_ADMIN')
        .send({
          institutionId: institutionId.toString(),
          academicYear,
          rosterVersionId: version2Id.toString(),
          sources: ['ROSTER', 'INTAKE']
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sourceModes.INTAKE).toBe('SIMULATED'); // Inherited risk correction verified!
      expect(res.body.data.status).toBe('COMPLETED');
    });
  });
});

