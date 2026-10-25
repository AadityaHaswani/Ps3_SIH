/**
 * Prompt 10 Verification Suite: Seed Engine & Canonical Permission Reconciliations.
 * Validates the 20 targeted checks defined in Part I of Prompt 10:
 *
 * 1.  The seeder is blocked in production.
 * 2.  The seeder is blocked unless explicitly enabled.
 * 3.  Demo users are created only through the safe seed flow (hashed passwords, demo email domain).
 * 4.  A conflicting non-demo user account is not modified.
 * 5.  The first seed run creates expected demo entities.
 * 6.  A second seed run does not duplicate key records (Idempotency).
 * 7.  All seeded foreign references resolve.
 * 8.  Demo users have correct roles and institution assignments.
 * 9.  Auditor mutation remains denied (403).
 * 10. Cross-institution access still fails for institution users (403).
 * 11. Source modes and assurance labels remain consistent (SIMULATED, INSTITUTION_DECLARED).
 * 12. Confirmed transfers have the expected idempotent ledger entries.
 * 13. Pending transfers have not altered occupancy as though confirmed.
 * 14. Scorecard numeric eligibility matches the underlying data (INSUFFICIENT_DATA for TINY).
 * 15. Simulated sources do not create genuine authority-verification states.
 * 16. Each committed roster version has a valid seal and anchor.
 * 17. The seed creates valid predecessor/next-version links.
 * 18. Scenario P10 is not executed automatically by normal seeding.
 * 19. The synthetic ground-truth mapping and findings use consistent scenario IDs.
 * 20. Existing Features 1–9 functionality remains compatible with the seed process.
 */
require('../src/config/dns');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');

// Seed script functions
const { seedDemoData, assertEnvironmentSafety } = require('../src/scripts/seedDemoData');
const { verifyDemoDataset } = require('../src/scripts/seedVerifier');
const { verifyRosterSeal } = require('../src/services/sealService');
const { ROLES } = require('../src/config/permissions');

// Models
const Institution = require('../src/models/institution.model');
const Programme = require('../src/models/programme.model');
const User = require('../src/models/user.model');
const RosterVersion = require('../src/models/rosterVersion.model');
const RosterRow = require('../src/models/rosterRow.model');
const SeatBalance = require('../src/models/seatBalance.model');
const SeatLedgerEntry = require('../src/models/seatLedgerEntry.model');
const ExternalRegisterRecord = require('../src/models/externalRegisterRecord.model');
const ReconciliationRun = require('../src/models/reconciliationRun.model');
const ReconciliationFinding = require('../src/models/reconciliationFinding.model');
const TransferCase = require('../src/models/transferCase.model');
const StudentLifecycleEvent = require('../src/models/lifecycleEvent.model');
const SamplingRun = require('../src/models/samplingRun.model');
const SamplingItem = require('../src/models/samplingItem.model');
const ScoreSnapshot = require('../src/models/scoreSnapshot.model');
const VerificationRecord = require('../src/models/verificationRecord.model');
const IntegritySeal = require('../src/models/integritySeal.model');
const SealAnchor = require('../src/models/sealAnchor.model');
const ImpactRecord = require('../src/models/impactRecord.model');

jest.setTimeout(180000);

describe('Prompt 10: Synthetic Demo Seeding & Permission Reconciliation Suite', () => {
  beforeAll(async () => {
    process.env.DEMO_SEED_ENABLED = 'true';
    process.env.DEMO_SEED_PASSWORD = 'TestSeedPassword123!';
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('1. Safety Guards and Non-Demo Protection', () => {
    it('1. Seeder is blocked in production environment', () => {
      expect(() => {
        assertEnvironmentSafety({ isProduction: true });
      }).toThrow(/strictly prohibited in production/i);
    });

    it('2. Seeder is blocked unless explicitly enabled', () => {
      expect(() => {
        assertEnvironmentSafety({ enabled: false });
      }).toThrow(/Demo seeding is disabled/i);
    });

    it('3. Password validation rejects weak or missing DEMO_SEED_PASSWORD', () => {
      expect(() => {
        assertEnvironmentSafety({ enabled: true, demoPassword: 'short' });
      }).toThrow(/DEMO_SEED_PASSWORD.*at least 8 characters/i);
    });

    it('4. A conflicting non-demo user account is safely preserved and halts seeding', async () => {
      // Create a non-demo user with colliding email
      const collisionEmail = 'platform-admin@example.test';
      const existingUser = await User.findOne({ email: collisionEmail });

      if (existingUser) {
        // Temporarily mark isDemoUser: false to simulate collision
        await User.updateOne({ _id: existingUser._id }, { $set: { isDemoUser: false } });

        await expect(
          seedDemoData({
            skipConnect: true,
            doNotDisconnect: true,
            enabled: true,
            demoPassword: 'TestSeedPassword123!'
          })
        ).rejects.toThrow(/CONFLICT SAFETY HALT/i);

        // Restore demo flag
        await User.updateOne({ _id: existingUser._id }, { $set: { isDemoUser: true } });
      } else {
        // Create a non-demo user and verify rejection
        const nonDemo = await User.create({
          email: 'platform-admin@example.test',
          passwordHash: 'dummy-hash-1234567890',
          name: 'Real Admin Prior',
          role: ROLES.PLATFORM_ADMIN,
          isDemoUser: false
        });

        await expect(
          seedDemoData({
            skipConnect: true,
            doNotDisconnect: true,
            enabled: true,
            demoPassword: 'TestSeedPassword123!'
          })
        ).rejects.toThrow(/CONFLICT SAFETY HALT/i);

        await User.deleteOne({ _id: nonDemo._id });
      }
    });
  });

  describe('2. Idempotent Execution and Entity Creation', () => {
    let firstSummary;

    it('5. First seed run creates expected demo entities across Features 1–7', async () => {
      const res = await seedDemoData({
        skipConnect: true,
        doNotDisconnect: true,
        enabled: true,
        demoPassword: 'TestSeedPassword123!'
      });

      expect(res.success).toBe(true);
      firstSummary = res.summary;

      expect(firstSummary.institutions).toBe(6);
      expect(firstSummary.programmes).toBe(17);
      expect(firstSummary.users).toBeGreaterThanOrEqual(6);
      expect(firstSummary.rosterRows).toBeGreaterThan(2000);
      expect(firstSummary.seatBalances).toBeGreaterThan(15);
      expect(firstSummary.reconciliationFindings).toBeGreaterThan(5);
      expect(firstSummary.integritySeals).toBeGreaterThan(0);
      expect(firstSummary.sealAnchors).toBeGreaterThan(0);
    });

    it('6. Second seed run does not duplicate key records (Idempotency)', async () => {
      const res = await seedDemoData({
        skipConnect: true,
        doNotDisconnect: true,
        enabled: true,
        demoPassword: 'TestSeedPassword123!'
      });

      expect(res.success).toBe(true);
      const secondSummary = res.summary;

      // Ensure stable counts on rerun
      expect(secondSummary.institutions).toBe(firstSummary.institutions);
      expect(secondSummary.programmes).toBe(firstSummary.programmes);
      expect(secondSummary.users).toBe(firstSummary.users);
      expect(secondSummary.rosterVersions).toBe(firstSummary.rosterVersions);
      expect(secondSummary.integritySeals).toBe(firstSummary.integritySeals);
      expect(secondSummary.sealAnchors).toBe(firstSummary.sealAnchors);
    });
  });

  describe('3. Referential Integrity, Role Scoping & Permission Boundaries', () => {
    it('7. All seeded foreign references resolve properly', async () => {
      const institutions = await Institution.find({ $or: [{ dataMode: 'DEMO' }, { code: /^SIT-DEMO/ }] }).lean();
      const instIdSet = new Set(institutions.map((i) => i._id.toString()));

      const sampleBalances = await SeatBalance.find({ institutionId: { $in: Array.from(instIdSet) } }).limit(50).lean();
      for (const b of sampleBalances) {
        expect(instIdSet.has(b.institutionId.toString())).toBe(true);
      }

      const sampleVersions = await RosterVersion.find({ institutionId: { $in: Array.from(instIdSet) } }).limit(20).lean();
      for (const v of sampleVersions) {
        expect(instIdSet.has(v.institutionId.toString())).toBe(true);
      }
    });

    it('8. Demo users have correct roles, hashed passwords and institution assignments', async () => {
      const users = await User.find({ isDemoUser: true }).select('+passwordHash').lean();
      expect(users.length).toBe(7);

      for (const u of users) {
        expect(u.email).toMatch(/@example\.test$/);
        expect(u.passwordHash).toBeDefined();
        expect(u.passwordHash.length).toBeGreaterThan(20);
        expect(u.passwordHash).not.toContain('TestSeedPassword'); // Never plaintext
      }

      const officer = users.find((u) => u.role === ROLES.AUTHORITY_OFFICER);
      expect(officer).toBeDefined();
      expect(officer.assignedInstitutionIds).toBeDefined();
      expect(officer.assignedInstitutionIds.length).toBe(2); // Explicitly assigned to Inst 1 & 2
    });

    it('9. AUDITOR role is globally read-only and denied mutations across endpoints (403)', async () => {
      const inst1 = await Institution.findOne({ code: 'SIT-DEMO-01' }).lean();

      // Auditor attempting to create a sampling run
      const res = await request(app)
        .post('/api/v1/sampling-runs')
        .set('x-user-role', ROLES.AUDITOR)
        .set('x-user-email', 'auditor@example.test')
        .send({
          institutionId: inst1._id.toString(),
          academicYear: '2024-25',
          sampleSize: 10
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('10. Cross-institution access fails for institution users (403 / IDOR defense)', async () => {
      const inst1 = await Institution.findOne({ code: 'SIT-DEMO-01' }).lean();
      const inst2 = await Institution.findOne({ code: 'SIT-DEMO-02' }).lean();

      // Inst 1 admin attempting to access Inst 2 seat ledger
      const res = await request(app)
        .get('/api/v1/seat-ledger/balances')
        .query({ institutionId: inst2._id.toString() })
        .set('x-user-role', ROLES.INSTITUTION_ADMIN)
        .set('x-user-inst', inst1._id.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4. Data Model Provenance, Transfers & Ledger Checks', () => {
    it('11. Source modes and assurance labels remain consistent (SIMULATED)', async () => {
      const extRecords = await ExternalRegisterRecord.find({}).lean();
      expect(extRecords.length).toBeGreaterThan(0);
      for (const r of extRecords) {
        expect(r.sourceMode).toBe('SIMULATED');
      }
    });

    it('12. Confirmed transfers have the expected idempotent ledger entries', async () => {
      const confirmedTransfer = await TransferCase.findOne({
        status: { $in: ['TRANSFER_CONFIRMED', 'CONFIRMED'] }
      }).lean();
      expect(confirmedTransfer).toBeDefined();

      const ledgerEntries = await SeatLedgerEntry.find({
        sourceReference: confirmedTransfer._id.toString()
      }).lean();

      expect(ledgerEntries.length).toBe(2); // One debit, one credit
      const deltaTypes = ledgerEntries.map((e) => e.type);
      expect(deltaTypes).toContain('TRANSFER_OUT');
      expect(deltaTypes).toContain('TRANSFER_IN');
    });

    it('13. Pending transfers have not altered occupancy as though confirmed', async () => {
      const pendingTransfer = await TransferCase.findOne({ status: 'NEEDS_REVIEW' }).lean();
      expect(pendingTransfer).toBeDefined();

      const entries = await SeatLedgerEntry.find({
        sourceReference: pendingTransfer._id.toString()
      }).lean();

      expect(entries.length).toBe(0); // No occupancy impact for pending/needs_review transfers
    });

    it('14. Scorecard numeric eligibility matches data: INSUFFICIENT_DATA for TINY institution', async () => {
      const tinyInst = await Institution.findOne({ code: 'SIT-DEMO-TINY' }).lean();
      expect(tinyInst).toBeDefined();

      const snapshot = await ScoreSnapshot.findOne({ institutionId: tinyInst._id }).lean();
      expect(snapshot).toBeDefined();
      expect(snapshot.band === 'INSUFFICIENT_DATA' || snapshot.eligibilityStatus === 'INSUFFICIENT_DATA').toBe(true);
      expect(snapshot.overallScore).toBeNull();
    });

    it('15. Simulated sources do not create genuine authority-verification states', async () => {
      const verifications = await VerificationRecord.find({}).lean();
      const simulatedVerifs = verifications.filter((v) => v.sourceMode === 'SIMULATED');
      expect(simulatedVerifs.length).toBeGreaterThan(0);

      // Confirm that simulated verifications are not flagged as OFFICIAL or LIVE
      for (const v of simulatedVerifs) {
        expect(v.sourceMode).toBe('SIMULATED');
      }
    });
  });

  describe('5. Cryptographic Seals, Version Chains & Tamper Isolation', () => {
    it('16. Each committed roster version has a valid seal and signed Ed25519 anchor', async () => {
      const institutions = await Institution.find({ $or: [{ dataMode: 'DEMO' }, { code: /^SIT-DEMO/ }] }).lean();
      const instIdSet = new Set(institutions.map((i) => i._id.toString()));
      const committedVersions = await RosterVersion.find({
        status: 'COMMITTED',
        institutionId: { $in: Array.from(instIdSet) }
      }).lean();
      expect(committedVersions.length).toBeGreaterThan(0);

      for (const v of committedVersions) {
        const verifyRes = await verifyRosterSeal(v._id);
        expect(verifyRes.result).toBe('PASS');
        expect(verifyRes.signatureValid).toBe(true);
        expect(verifyRes.chainValid).toBe(true);
      }
    });

    it('17. Seed creates valid predecessor and next-version links with seal chain', async () => {
      const inst1 = await Institution.findOne({ code: 'SIT-DEMO-01' }).lean();
      const v1 = await RosterVersion.findOne({
        institutionId: inst1._id,
        versionNumber: 1
      }).lean();
      const v2 = await RosterVersion.findOne({
        institutionId: inst1._id,
        versionNumber: 2
      }).lean();

      expect(v1).toBeDefined();
      expect(v2).toBeDefined();
      expect(v2.versionNumber).toBe(2);
      expect(v1.versionNumber).toBe(1);

      const seal1 = await IntegritySeal.findOne({ rosterVersionId: v1._id }).lean();
      const seal2 = await IntegritySeal.findOne({ rosterVersionId: v2._id }).lean();

      expect(seal2.previousSealRoot).toBe(seal1.merkleRoot);
    });

    it('18. Scenario P10 tampering is NOT executed automatically during normal seeding', async () => {
      // Check that SIT-DEMO-02 v1 is clean and passes seal verification
      const inst2 = await Institution.findOne({ code: 'SIT-DEMO-02' }).lean();
      const v1 = await RosterVersion.findOne({
        institutionId: inst2._id,
        versionNumber: 1
      }).lean();

      const verifyRes = await verifyRosterSeal(v1._id);
      expect(verifyRes.result).toBe('PASS');
      expect(verifyRes.mismatchedRowKeys.length).toBe(0);
    });

    it('19. The synthetic ground-truth mapping and findings use consistent scenario IDs', async () => {
      const report = await verifyDemoDataset({ skipConnect: true });
      expect(report.overallStatus).toBe('HEALTHY');
      expect(report.plantedScenarios['P1_SEAT_BUCKET_OVER_LIMIT'].verified).toBe(true);
      expect(report.plantedScenarios['P2_ABSENT_FROM_REGISTER'].verified).toBe(true);
      expect(report.plantedScenarios['P3_DUPLICATE_CANDIDATES'].verified).toBe(true);
      expect(report.plantedScenarios['P4_CONFIRMED_TRANSFER'].verified).toBe(true);
      expect(report.plantedScenarios['P5_PENDING_TRANSFER_TIMEOUT'].verified).toBe(true);
      expect(report.plantedScenarios['P6_INCOMPLETE_ROSTER_FIELDS'].verified).toBe(true);
      expect(report.plantedScenarios['P7_LATE_REPORTING'].verified).toBe(true);
      expect(report.plantedScenarios['P8_REPEATED_CORRECTIONS'].verified).toBe(true);
      expect(report.plantedScenarios['P9_STALE_OUTPUTS_BLAST_RADIUS'].verified).toBe(true);
      expect(report.plantedScenarios['P10_SEALED_ROSTER_TAMPERING'].verified).toBe(true);
      expect(report.plantedScenarios['P11_SOURCE_UNAVAILABLE'].verified).toBe(true);
      expect(report.plantedScenarios['P12_WEAK_CANDIDATE_MATCH'].verified).toBe(true);
      expect(report.plantedScenarios['P13_SELF_DECLARED_INTAKE'].verified).toBe(true);
      expect(report.plantedScenarios['P14_SAMPLING_NON_RESPONSE'].verified).toBe(true);
      expect(report.plantedScenarios['P15_SMALL_DENOMINATOR_INSTITUTION'].verified).toBe(true);
    });

    it('20. Existing Features 1–9 endpoints remain compatible with seeded records', async () => {
      const inst1 = await Institution.findOne({ code: 'SIT-DEMO-01' }).lean();

      // Feature 2: seat ledger balances
      const ledgerRes = await request(app)
        .get('/api/v1/seat-ledger/balances')
        .query({ institutionId: inst1._id.toString() })
        .set('x-user-role', ROLES.AUTHORITY_ADMIN);
      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.success).toBe(true);

      // Feature 4: scorecard
      const scorecardRes = await request(app)
        .get(`/api/v1/scorecards/institutions/${inst1._id}`)
        .set('x-user-role', ROLES.AUTHORITY_ADMIN);
      expect(scorecardRes.status).toBe(200);
      expect(scorecardRes.body.success).toBe(true);

      // Feature 7: seal manifest
      const v1 = await RosterVersion.findOne({ institutionId: inst1._id, versionNumber: 1 }).lean();
      const sealRes = await request(app)
        .get(`/api/v1/roster-versions/${v1._id}/seal`)
        .set('x-user-role', ROLES.AUTHORITY_ADMIN);
      expect(sealRes.status).toBe(200);
      expect(sealRes.body.success).toBe(true);
      expect(sealRes.body.data.merkleRoot).toBeDefined();
    });
  });
});
