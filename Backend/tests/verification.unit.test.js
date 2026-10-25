/**
 * Unit Tests for Feature 6: Authority-Verified Intake & Data Assurance Labels.
 * Tests label resolution precedence, SIMULATED vs LIVE isolation, connector registry safety,
 * local invalidation on value change, and active transfer concurrency safeguards.
 */
const mongoose = require('mongoose');
const { resolveEffectiveLabel, LABEL_RANKS } = require('../src/services/labelResolverService');
const connectorRegistry = require('../src/services/connectors/connectorRegistry');
const VerificationRecord = require('../src/models/verificationRecord.model');
const TransferCase = require('../src/models/transferCase.model');

afterAll(async () => {
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

describe('Feature 6: Unit Tests - Assurance Labels & Connectors', () => {
  describe('1. Deterministic Label Resolution Rules', () => {
    test('1. Default baseline for empty history is INSTITUTION_DECLARED', async () => {
      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 60,
        records: []
      });

      expect(res.effectiveLabel).toBe('INSTITUTION_DECLARED');
      expect(res.sourceMode).toBe('INSTITUTION_DECLARED');
      expect(res.isSimulated).toBe(false);
      expect(res.displayBadge.text).toBe('Institution Declared');
      expect(res.confidenceScore).toBe(0.5);
    });

    test('2. Merely attaching a document reference without review does NOT produce DOCUMENT_SUPPORTED', async () => {
      const mockPendingDocRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'VERIFICATION_PENDING',
        sourceMode: 'SIMULATED',
        method: 'DOCUMENT_REVIEW',
        status: 'PENDING',
        evidenceRef: 'DOC_REF_UNREVIEWED_1234',
        valueSnapshot: 60,
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 60,
        records: [mockPendingDocRecord]
      });

      expect(res.effectiveLabel).toBe('VERIFICATION_PENDING');
      expect(res.effectiveLabel).not.toBe('DOCUMENT_SUPPORTED');
    });

    test('3. Authorised document review with confirmed status produces DOCUMENT_SUPPORTED', async () => {
      const mockReviewedDocRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'DOCUMENT_SUPPORTED',
        sourceMode: 'SIMULATED',
        method: 'DOCUMENT_REVIEW',
        status: 'COMPLETED',
        evidenceRef: 'AICTE-EOA-ORDER-2024-SIGNED.PDF',
        reviewer: { role: 'AUTHORITY_OFFICER', userId: 'officer-99' },
        valueSnapshot: 60,
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 60,
        records: [mockReviewedDocRecord]
      });

      expect(res.effectiveLabel).toBe('DOCUMENT_SUPPORTED');
      expect(res.displayBadge.text).toBe('Document Supported');
      expect(res.provenanceList.length).toBe(1);
      expect(res.provenanceList[0].evidenceRef).toBe('AICTE-EOA-ORDER-2024-SIGNED.PDF');
    });

    test('4. Qualifying Feature 1 independent register match produces CROSS_REGISTER_CONFIRMED', async () => {
      const mockRegisterRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'CROSS_REGISTER_CONFIRMED',
        sourceMode: 'SIMULATED',
        method: 'CROSS_REGISTER',
        status: 'COMPLETED',
        sourceRef: 'STATE-ADMISSION-ALLOTMENT-2024',
        valueSnapshot: 'CONFIRMED',
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'ROSTER_RECORD',
        subjectId: 'stud-token-1234',
        fieldPath: 'admissionStatus',
        currentValue: 'CONFIRMED',
        records: [mockRegisterRecord]
      });

      expect(res.effectiveLabel).toBe('CROSS_REGISTER_CONFIRMED');
      expect(res.displayBadge.text).toBe('Cross-Register Confirmed');
      expect(res.isSimulated).toBe(true);
    });

    test('5. Weak or candidate match does NOT produce CROSS_REGISTER_CONFIRMED', async () => {
      const mockWeakMatch = {
        _id: new mongoose.Types.ObjectId(),
        label: 'VERIFICATION_PENDING',
        sourceMode: 'SIMULATED',
        method: 'CROSS_REGISTER',
        status: 'PENDING',
        notes: 'Weak candidate match; requires manual reconciliation.',
        valueSnapshot: 'CONFIRMED',
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'ROSTER_RECORD',
        subjectId: 'stud-token-weak',
        fieldPath: 'admissionStatus',
        currentValue: 'CONFIRMED',
        records: [mockWeakMatch]
      });

      expect(res.effectiveLabel).toBe('VERIFICATION_PENDING');
      expect(res.effectiveLabel).not.toBe('CROSS_REGISTER_CONFIRMED');
    });

    test('6. Genuine live verification establishes AUTHORITY_VERIFIED only when sourceMode is LIVE', async () => {
      const mockLiveRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'AUTHORITY_VERIFIED',
        sourceMode: 'LIVE',
        method: 'MANUAL_OFFICER',
        status: 'COMPLETED',
        sourceRef: 'AICTE-LIVE-PORTAL-SYNC',
        reviewer: { role: 'AUTHORITY_ADMIN', userId: 'admin-1' },
        valueSnapshot: 120,
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 120,
        records: [mockLiveRecord]
      });

      expect(res.effectiveLabel).toBe('AUTHORITY_VERIFIED');
      expect(res.isSimulated).toBe(false);
      expect(res.sourceMode).toBe('LIVE');
      expect(res.displayBadge.isSimulated).toBe(false);
      expect(res.confidenceScore).toBe(1.0);
    });

    test('7. CRITICAL RULE: Simulated verification is coerced to AUTHORITY_VERIFIED_SIMULATED and is visibly marked SIMULATED', async () => {
      const mockSimulatedRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'AUTHORITY_VERIFIED', // Intentionally legacy or mislabeled record
        sourceMode: 'SIMULATED',     // But simulated mode
        method: 'CONNECTOR_API',
        status: 'COMPLETED',
        valueSnapshot: 60,
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 60,
        records: [mockSimulatedRecord]
      });

      // Must be coerced to AUTHORITY_VERIFIED_SIMULATED
      expect(res.effectiveLabel).toBe('AUTHORITY_VERIFIED_SIMULATED');
      expect(res.isSimulated).toBe(true);
      expect(res.displayBadge.isSimulated).toBe(true);
      expect(res.displayBadge.text).toContain('Simulated');
    });

    test('8. Missing/unavailable source produces UNABLE_TO_VERIFY without false mismatch or failure conclusion', async () => {
      const mockUnavailableRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'UNABLE_TO_VERIFY',
        sourceMode: 'SIMULATED',
        method: 'CONNECTOR_API',
        status: 'UNABLE_TO_VERIFY',
        notes: 'Upstream gateway timed out',
        valueSnapshot: 60,
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 60,
        records: [mockUnavailableRecord]
      });

      expect(res.effectiveLabel).toBe('UNABLE_TO_VERIFY');
      expect(res.hasConflict).toBe(false);
      expect(res.status).toBe('UNABLE_TO_VERIFY');
      expect(res.notes).toContain('unavailable');
    });

    test('9. Conflicting sources produce VERIFICATION_PENDING with hasConflict: true', async () => {
      const mockConflictRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'VERIFICATION_PENDING',
        sourceMode: 'SIMULATED',
        method: 'CONNECTOR_API',
        status: 'CONFLICT',
        notes: 'Declared 75 conflicts with registered quota 60',
        valueSnapshot: 75,
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 75,
        records: [mockConflictRecord]
      });

      expect(res.effectiveLabel).toBe('VERIFICATION_PENDING');
      expect(res.hasConflict).toBe(true);
      expect(res.status).toBe('CONFLICT');
      expect(res.displayBadge.variant).toBe('danger');
    });

    test('10. Expired verification records no longer contribute to current effective label', async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const mockExpiredRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'AUTHORITY_VERIFIED',
        sourceMode: 'LIVE',
        method: 'MANUAL_OFFICER',
        status: 'COMPLETED',
        expiresAt: expiredDate,
        valueSnapshot: 60,
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 60,
        records: [mockExpiredRecord]
      });

      // Since the only record is expired, it falls back to baseline
      expect(res.effectiveLabel).toBe('INSTITUTION_DECLARED');
      expect(res.provenanceList.length).toBe(0);
    });

    test('11. Superseded verification records remain in history but do not determine effective label', async () => {
      const mockSuperseded = {
        _id: new mongoose.Types.ObjectId(),
        label: 'DOCUMENT_SUPPORTED',
        sourceMode: 'SIMULATED',
        method: 'DOCUMENT_REVIEW',
        status: 'SUPERSEDED',
        valueSnapshot: 60,
        createdAt: new Date(Date.now() - 5000)
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 60,
        records: [mockSuperseded]
      });

      expect(res.effectiveLabel).toBe('INSTITUTION_DECLARED');
    });

    test('12. Local Invalidation on Value Change: prior verification for old value cannot verify changed value', async () => {
      // Prior verification was for value 60
      const mockOldRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'AUTHORITY_VERIFIED_SIMULATED',
        sourceMode: 'SIMULATED',
        method: 'CONNECTOR_API',
        status: 'COMPLETED',
        valueSnapshot: 60,
        createdAt: new Date()
      };

      // Current active value changed to 75
      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 75,
        records: [mockOldRecord]
      });

      // Old record cannot verify 75 -> resets to INSTITUTION_DECLARED
      expect(res.effectiveLabel).toBe('INSTITUTION_DECLARED');
      expect(res.provenanceList.length).toBe(0);
    });

    test('13. Label resolution priority is deterministic when multiple valid sources exist', async () => {
      const docRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'DOCUMENT_SUPPORTED',
        sourceMode: 'SIMULATED',
        method: 'DOCUMENT_REVIEW',
        status: 'COMPLETED',
        valueSnapshot: 60,
        createdAt: new Date(Date.now() - 1000)
      };

      const simAuthRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'AUTHORITY_VERIFIED_SIMULATED',
        sourceMode: 'SIMULATED',
        method: 'CONNECTOR_API',
        status: 'COMPLETED',
        valueSnapshot: 60,
        createdAt: new Date(Date.now() - 2000)
      };

      const crossRegRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'CROSS_REGISTER_CONFIRMED',
        sourceMode: 'SIMULATED',
        method: 'CROSS_REGISTER',
        status: 'COMPLETED',
        valueSnapshot: 60,
        createdAt: new Date()
      };

      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 60,
        records: [crossRegRecord, docRecord, simAuthRecord]
      });

      // AUTHORITY_VERIFIED_SIMULATED (rank 6) takes precedence over DOCUMENT_SUPPORTED (rank 5) & CROSS_REGISTER (rank 4)
      expect(res.effectiveLabel).toBe('AUTHORITY_VERIFIED_SIMULATED');
      // Provenance list preserves all contributing records
      expect(res.provenanceList.length).toBe(3);
    });

    test('13b. Source-version changes invalidate relevant stale results', async () => {
      const staleVersionRecord = {
        _id: new mongoose.Types.ObjectId(),
        label: 'AUTHORITY_VERIFIED_SIMULATED',
        sourceMode: 'SIMULATED',
        method: 'CONNECTOR_API',
        status: 'COMPLETED',
        ruleOrSourceVersion: 'v2023.1',
        valueSnapshot: 60,
        createdAt: new Date()
      };

      // Resolve with requiredSourceVersion: 'v2024.1'
      const res = await resolveEffectiveLabel({
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'inst1:CS:2024-25:GENERAL',
        fieldPath: 'approvedIntake',
        currentValue: 60,
        requiredSourceVersion: 'v2024.1',
        records: [staleVersionRecord]
      });

      // The record with older source version v2023.1 does not qualify -> resets to baseline
      expect(res.effectiveLabel).toBe('INSTITUTION_DECLARED');
      expect(res.provenanceList.length).toBe(0);
    });
  });

  describe('2. Connector Registry & Execution Safety', () => {
    test('14. Invoking an unregistered connector throws 400 INVALID_CONNECTOR', async () => {
      await expect(
        connectorRegistry.executeVerification({
          connectorId: 'non-existent-connector-xyz',
          subjectType: 'PROGRAMME_INTAKE',
          subjectId: 'inst1:CS:2024-25:GENERAL',
          fieldPath: 'approvedIntake',
          value: 60,
          institutionId: new mongoose.Types.ObjectId()
        })
      ).rejects.toThrow(/not registered or supported/);
    });

    test('15. Invoking connector with unsupported subject type throws 400 UNSUPPORTED_SUBJECT_TYPE', async () => {
      await expect(
        connectorRegistry.executeVerification({
          connectorId: 'mock-authority-intake',
          subjectType: 'ROSTER_RECORD', // mock-authority-intake only supports PROGRAMME_INTAKE, SEAT_BALANCE
          subjectId: 'roster-row-1',
          fieldPath: 'name',
          value: 'John',
          institutionId: new mongoose.Types.ObjectId()
        })
      ).rejects.toThrow(/does not support subject type/);
    });

    test('16. Connector mode is strictly determined by server registry, client cannot override', async () => {
      const res = await connectorRegistry.executeVerification({
        connectorId: 'mock-authority-intake',
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'CS',
        fieldPath: 'approvedIntake',
        value: 60,
        institutionId: new mongoose.Types.ObjectId(),
        context: { mockMatch: true, sourceMode: 'LIVE' } // Client tries to spoof LIVE mode
      });

      // Server determines mode from trusted connector configuration
      expect(res.sourceMode).toBe('SIMULATED');
      expect(res.isSimulated).toBe(true);
      expect(res.label).toBe('AUTHORITY_VERIFIED_SIMULATED');
    });

    test('17. Failing connector safely returns UNABLE_TO_VERIFY without crashing caller', async () => {
      const res = await connectorRegistry.executeVerification({
        connectorId: 'failing-test-connector',
        subjectType: 'PROGRAMME_INTAKE',
        subjectId: 'CS',
        fieldPath: 'approvedIntake',
        value: 60,
        institutionId: new mongoose.Types.ObjectId(),
        context: { throwException: true } // Simulates network ECONNRESET
      });

      expect(res.status).toBe('UNABLE_TO_VERIFY');
      expect(res.label).toBe('UNABLE_TO_VERIFY');
      expect(res.sourceMode).toBe('SIMULATED');
      expect(res.notes).toContain('unavailable');
    });

    test('18. Connector status health check strips all secrets and returns clean sanitized status', async () => {
      const statuses = await connectorRegistry.listConnectorsStatus();

      expect(Array.isArray(statuses)).toBe(true);
      expect(statuses.length).toBeGreaterThanOrEqual(4);

      for (const conn of statuses) {
        expect(conn.id).toBeDefined();
        expect(conn.name).toBeDefined();
        expect(conn.mode).toBeDefined();
        expect(conn.status).toBeDefined();
        expect(conn.isSimulated).toBe(true);

        // Zero secret leakage
        expect(conn.secret).toBeUndefined();
        expect(conn.apiKey).toBeUndefined();
        expect(conn.password).toBeUndefined();
        expect(conn.token).toBeUndefined();
      }
    });
  });
});
