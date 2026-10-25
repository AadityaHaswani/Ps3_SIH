/**
 * Feature 5 Unit Tests: Student Lifecycle, Token Management, Transfer Handshake & Overlap Detection.
 * Pure unit and service-level tests without requiring full HTTP server overhead.
 */
const {
  canonicaliseApaar,
  generateApaarToken,
  deriveStudentToken
} = require('../src/utils/cryptoToken');
const {
  deriveCurrentState,
  validateTransition,
  ALLOWED_TRANSITIONS
} = require('../src/services/lifecycleService');
const {
  DEFAULT_CONFIRMATION_WINDOW_DAYS,
  DEFAULT_DATE_GAP_TOLERANCE_DAYS
} = require('../src/services/transferService');
const {
  DEFAULT_NEUTRAL_EXPLANATION,
  RESOLUTION_CODES
} = require('../src/models/overlapCase.model');

describe('Feature 5: Privacy-Preserving Token Service & Key Management', () => {
  const sampleApaar = '1234-5678-9012';

  test('1. Same canonical input and key version produces a stable token', () => {
    const token1 = generateApaarToken(sampleApaar, 'v1');
    const token2 = generateApaarToken(sampleApaar, 'v1');
    expect(token1).toBeDefined();
    expect(typeof token1).toBe('string');
    expect(token1.length).toBe(64); // SHA-256 hex digest
    expect(token1).toBe(token2);
  });

  test('2. Formatting variants canonicalise consistently (spaces, hyphens, case)', () => {
    const rawVariants = [
      '1234-5678-9012',
      ' 1234 5678 9012 ',
      '123456789012',
      '1234-5678-9012\t\n'
    ];
    const canonicals = rawVariants.map((v) => canonicaliseApaar(v));
    expect(new Set(canonicals).size).toBe(1);
    expect(canonicals[0]).toBe('123456789012');

    const tokens = rawVariants.map((v) => generateApaarToken(v, 'v1'));
    expect(new Set(tokens).size).toBe(1);
  });

  test('3. Different key versions produce different tokens for the same canonical input', () => {
    const tokenV1 = generateApaarToken(sampleApaar, 'v1');
    const tokenV2 = generateApaarToken(sampleApaar, 'v2');
    expect(tokenV1).not.toBe(tokenV2);
  });

  test('4. Previously supported Feature 1 token matching remains 100% compatible', () => {
    // Calling generateApaarToken without second arg defaults to 'v1'
    const legacyToken = generateApaarToken(sampleApaar);
    const v1Token = generateApaarToken(sampleApaar, 'v1');
    expect(legacyToken).toBe(v1Token);
  });

  test('5. Missing or blank identifiers produce explicit MISSING_IDENTIFIER status', () => {
    const resultNull = deriveStudentToken(null);
    expect(resultNull.status).toBe('MISSING_IDENTIFIER');
    expect(resultNull.token).toBeNull();

    const resultEmpty = deriveStudentToken('');
    expect(resultEmpty.status).toBe('MISSING_IDENTIFIER');
    expect(resultEmpty.token).toBeNull();

    const resultWhitespace = deriveStudentToken('   - -   ');
    expect(resultWhitespace.status).toBe('MISSING_IDENTIFIER');
  });

  test('6. deriveStudentToken returns opaque studentRef and preserves pseudonymity', () => {
    const instId = 'inst-alpha-123';
    const derived = deriveStudentToken(sampleApaar, 'v1', instId);
    expect(derived.status).toBe('GENERATED');
    expect(derived.token).toBeDefined();
    expect(derived.keyVersion).toBe('v1');
    expect(derived.studentRef).toMatch(/^STU-[A-F0-9]{12}$/);
    expect(derived.apaarLast4).toBe('9012');

    // Cross-institution studentRef scoping: different institution scope derives different studentRef
    const derivedBeta = deriveStudentToken(sampleApaar, 'v1', 'inst-beta-456');
    expect(derivedBeta.studentRef).not.toBe(derived.studentRef);
  });
});

describe('Feature 5: Student Lifecycle State Machine', () => {
  test('8. Valid lifecycle transitions pass validation', () => {
    expect(() => validateTransition('ADMITTED', 'ENROLLED')).not.toThrow();
    expect(() => validateTransition('ENROLLED', 'TRANSFER_PENDING')).not.toThrow();
    expect(() => validateTransition('ENROLLED', 'WITHDRAWN')).not.toThrow();
    expect(() => validateTransition('ENROLLED', 'COMPLETED')).not.toThrow();
    expect(() => validateTransition('TRANSFER_PENDING', 'TRANSFER_CONFIRMED')).not.toThrow();
    expect(() => validateTransition('TRANSFER_PENDING', 'TRANSFER_REJECTED')).not.toThrow();
    expect(() => validateTransition('TRANSFER_PENDING', 'NEEDS_REVIEW')).not.toThrow();
    expect(() => validateTransition('TRANSFER_CONFIRMED', 'ENROLLED')).not.toThrow();
    expect(() => validateTransition('TRANSFER_REJECTED', 'ENROLLED')).not.toThrow();
    expect(() => validateTransition('NEEDS_REVIEW', 'TRANSFER_CONFIRMED')).not.toThrow();
  });

  test('9. Invalid transitions throw HTTP 422 with explanation and allowed transitions', () => {
    // Cannot jump from ADMITTED directly to COMPLETED
    try {
      validateTransition('ADMITTED', 'COMPLETED');
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('INVALID_LIFECYCLE_TRANSITION');
      expect(err.currentState).toBe('ADMITTED');
      expect(err.attemptedTransition).toBe('COMPLETED');
    }

    // Terminal states cannot transition further
    try {
      validateTransition('WITHDRAWN', 'ENROLLED');
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.currentState).toBe('WITHDRAWN');
    }

    try {
      validateTransition('COMPLETED', 'TRANSFER_PENDING');
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.currentState).toBe('COMPLETED');
    }
  });

  test('10 & 11. deriveCurrentState reflects valid events and ignores superseded events', () => {
    const events = [
      { type: 'ADMITTED', status: 'VALID', effectiveDate: new Date('2024-07-01') },
      { type: 'ENROLLED', status: 'SUPERSEDED', effectiveDate: new Date('2024-07-15') },
      { type: 'ENROLLED', status: 'VALID', effectiveDate: new Date('2024-07-20') },
      { type: 'WITHDRAWN', status: 'SUPERSEDED', effectiveDate: new Date('2024-08-01') }
    ];

    const state = deriveCurrentState(events);
    // Because WITHDRAWN was superseded, current state should be ENROLLED
    expect(state).toBe('ENROLLED');
  });

  test('12. Unknown or empty events sequence returns UNKNOWN', () => {
    expect(deriveCurrentState([])).toBe('UNKNOWN');
    expect(deriveCurrentState(null)).toBe('UNKNOWN');
  });
});

describe('Feature 5: Transfer Handshake Logic & Overlap Neutrality', () => {
  test('18 & 19. Default configuration parameters for transfer window and date gap', () => {
    expect(DEFAULT_CONFIRMATION_WINDOW_DAYS).toBe(30);
    expect(DEFAULT_DATE_GAP_TOLERANCE_DAYS).toBe(7);
  });

  test('29. Overlap model uses strictly neutral, non-punitive default explanation', () => {
    expect(DEFAULT_NEUTRAL_EXPLANATION).toBe(
      'Overlap may be legitimate (e.g., permitted arrangements, pending paperwork). Applicable policy must be verified.'
    );
  });

  test('30. Permitted review resolution codes conform to canonical specification', () => {
    expect(RESOLUTION_CODES).toEqual(
      expect.arrayContaining([
        'LEGITIMATE_TRANSFER',
        'DATA_ENTRY_ERROR_CORRECTED',
        'PERMITTED_PARALLEL',
        'REFERRED_FOR_POLICY_REVIEW',
        'NO_ACTION'
      ])
    );
  });
});
