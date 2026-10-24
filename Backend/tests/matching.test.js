/**
 * Unit tests for Data Normalisation, Cryptographic Tokenization, and Matching Logic.
 */
const {
  normaliseName,
  normaliseDate,
  normaliseAcademicYear,
  normaliseProgrammeCode,
  normaliseCategory,
  deriveMatchingKeys,
  sanitizeCsvValue
} = require('../src/utils/normalisation');
const {
  generateApaarToken,
  maskIdentifier,
  maskName,
  computeFileHash
} = require('../src/utils/cryptoToken');
const {
  matchRosterRecordAgainstSource,
  detectAttributeConflicts,
  detectDuplicateCandidates
} = require('../src/services/matchingService');

describe('Feature 1 Matching & Normalisation Unit Suite', () => {
  describe('1. Normalisation Edge Cases', () => {
    test('normaliseName should handle diacritics, punctuation, and extra whitespace', () => {
      expect(normaliseName('  Dr.  Renée   D\'Souza-Smith  ')).toBe('DR RENEE D SOUZA SMITH');
      expect(normaliseName('Aditya Sharma')).toBe('ADITYA SHARMA');
      expect(normaliseName('')).toBe('');
      expect(normaliseName(null)).toBe('');
    });

    test('normaliseDate should parse ISO and Indian DMY date formats', () => {
      expect(normaliseDate('2004-05-18')).toBe('2004-05-18');
      expect(normaliseDate('18/05/2004')).toBe('2004-05-18');
      expect(normaliseDate('18-05-2004')).toBe('2004-05-18');
      expect(normaliseDate('invalid-date')).toBeNull();
      expect(normaliseDate(null)).toBeNull();
    });

    test('normaliseAcademicYear should standardise YYYY-YYYY to YYYY-YY', () => {
      expect(normaliseAcademicYear('2025-2026')).toBe('2025-26');
      expect(normaliseAcademicYear('2025-26')).toBe('2025-26');
      expect(normaliseAcademicYear('')).toBe('');
    });

    test('normaliseProgrammeCode should uppercase and trim special characters', () => {
      expect(normaliseProgrammeCode('  b.tech-cse  ')).toBe('BTECH-CSE');
      expect(normaliseProgrammeCode('ece')).toBe('ECE');
    });

    test('normaliseCategory should map standard Indian reservation categories', () => {
      expect(normaliseCategory('obc-ncl')).toBe('OBC');
      expect(normaliseCategory('general')).toBe('GENERAL');
      expect(normaliseCategory('sc')).toBe('SC');
      expect(normaliseCategory('st')).toBe('ST');
      expect(normaliseCategory('ews')).toBe('EWS');
    });

    test('sanitizeCsvValue should defend against spreadsheet formula injection (CWE-1236)', () => {
      expect(sanitizeCsvValue('=cmd|"/C calc"!A0')).toBe('\'=cmd|"/C calc"!A0');
      expect(sanitizeCsvValue('+12345')).toBe('\'+12345');
      expect(sanitizeCsvValue('-100')).toBe('\'-100');
      expect(sanitizeCsvValue('@SUM(A1:A10)')).toBe('\'@SUM(A1:A10)');
      expect(sanitizeCsvValue('Standard Name')).toBe('Standard Name');
    });
  });

  describe('2. Keyed HMAC Tokenization and Privacy Masking', () => {
    test('generateApaarToken should produce deterministic HMAC tokens without persisting raw ID', () => {
      const rawApaar1 = '1234-5678-9012';
      const rawApaar2 = '123456789012';
      const token1 = generateApaarToken(rawApaar1);
      const token2 = generateApaarToken(rawApaar2);

      expect(token1).toBeDefined();
      expect(token1).toHaveLength(64); // SHA-256 hex
      expect(token1).toBe(token2); // Whitespace/hyphen invariant
      expect(token1).not.toContain('1234'); // Never reveals raw digits
    });

    test('maskIdentifier should mask leading characters leaving specified suffix visible', () => {
      expect(maskIdentifier('APP-2025-9988')).toBe('********9988');
      expect(maskIdentifier('1234')).toBe('1234');
      expect(maskIdentifier(null)).toBe('N/A');
    });

    test('maskName should preserve first initial while masking surname and middle names', () => {
      expect(maskName('Aditya Sharma')).toBe('A**** S****');
      expect(maskName('Raj')).toBe('R**');
      expect(maskName(null)).toBe('N/A');
    });

    test('computeFileHash should return SHA-256 digest of buffer', () => {
      const buffer = Buffer.from('test csv content for hash verification');
      const hash = computeFileHash(buffer);
      expect(hash).toHaveLength(64);
    });
  });

  describe('3. Matching Precedence & Key Derivation', () => {
    const rosterRecord = {
      apaarToken: 'token_hmac_sha256_student_1',
      applicationNo: 'APP-1001',
      name: 'Aditya Sharma',
      dob: '2004-05-18',
      programmeCode: 'CSE',
      academicYear: '2025-26',
      gender: 'MALE',
      category: 'GENERAL'
    };

    test('should derive K1, K2, and K3 matching keys correctly', () => {
      const keys = deriveMatchingKeys(rosterRecord);
      expect(keys.k1).toBe('token_hmac_sha256_student_1');
      expect(keys.k2).toBe('APP-1001__CSE__2025-26');
      expect(keys.k3).toBe('ADITYA SHARMA__2004-05-18__CSE');
    });

    test('should achieve MATCH_STRONG via exact K1 token match', () => {
      const externalRecords = [
        {
          _id: 'ext_1',
          apaarToken: 'token_hmac_sha256_student_1',
          applicationNo: 'DIFFERENT-APP-NO',
          candidateName: 'Aditya Sharma',
          dob: '2004-05-18',
          programmeCode: 'CSE',
          academicYear: '2025-26',
          category: 'GENERAL',
          gender: 'MALE'
        }
      ];

      const result = matchRosterRecordAgainstSource(rosterRecord, externalRecords, 'ADMISSION');
      expect(result.status).toBe('MATCHED');
      expect(result.matchConfidence).toBe('STRONG');
      expect(result.matchKeyType).toBe('K1_APAAR_TOKEN');
      expect(result.fieldDiffs).toHaveLength(0);
    });

    test('should achieve MATCH_STRONG via scoped K2 application reference match when token absent', () => {
      const recordWithoutToken = { ...rosterRecord, apaarToken: null };
      const externalRecords = [
        {
          _id: 'ext_2',
          apaarToken: null,
          applicationNo: 'APP-1001',
          candidateName: 'Aditya S',
          dob: '2004-05-18',
          programmeCode: 'CSE',
          academicYear: '2025-26',
          category: 'GENERAL',
          gender: 'MALE'
        }
      ];

      const result = matchRosterRecordAgainstSource(recordWithoutToken, externalRecords, 'ADMISSION');
      expect(result.status).toBe('MATCHED');
      expect(result.matchConfidence).toBe('STRONG');
      expect(result.matchKeyType).toBe('K2_APPLICATION_PROGRAMME_YEAR');
    });

    test('should classify K3 name+DOB match as WEAK CANDIDATE_REVIEW and NEVER auto-confirm', () => {
      const recordWithoutKeys = {
        ...rosterRecord,
        apaarToken: null,
        applicationNo: 'APP-UNKNOWN-999'
      };

      const externalRecords = [
        {
          _id: 'ext_3',
          apaarToken: null,
          applicationNo: 'APP-DIFFERENT-888',
          candidateName: 'Aditya Sharma',
          dob: '2004-05-18',
          programmeCode: 'CSE',
          academicYear: '2025-26',
          category: 'GENERAL',
          gender: 'MALE'
        }
      ];

      const result = matchRosterRecordAgainstSource(recordWithoutKeys, externalRecords, 'ADMISSION');
      expect(result.status).toBe('CANDIDATE_REVIEW');
      expect(result.matchConfidence).toBe('WEAK');
      expect(result.matchKeyType).toBe('K3_NAME_DOB_PROGRAMME');
    });

    test('should return NOT_FOUND when no keys match', () => {
      const externalRecords = [
        {
          _id: 'ext_4',
          apaarToken: 'different_token',
          applicationNo: 'APP-9999',
          candidateName: 'Priya Verma',
          dob: '2005-01-01',
          programmeCode: 'ECE',
          academicYear: '2025-26',
          category: 'SC',
          gender: 'FEMALE'
        }
      ];

      const result = matchRosterRecordAgainstSource(rosterRecord, externalRecords, 'ADMISSION');
      expect(result.status).toBe('NOT_FOUND');
      expect(result.matchedRecord).toBeNull();
    });
  });

  describe('4. Attribute Conflict Detection', () => {
    test('should detect category and DOB differences between matched records', () => {
      const rosterRecord = {
        category: 'GENERAL',
        dob: '2004-05-18',
        gender: 'MALE',
        programmeCode: 'CSE'
      };

      const externalRecord = {
        category: 'OBC',
        dob: '2004-05-20',
        gender: 'MALE',
        programmeCode: 'CSE'
      };

      const diffs = detectAttributeConflicts(rosterRecord, externalRecord, 'ADMISSION');
      expect(diffs).toHaveLength(2);
      expect(diffs.find((d) => d.field === 'category')).toBeDefined();
      expect(diffs.find((d) => d.field === 'dob')).toBeDefined();
    });

    test('should flag CONFLICT status when strong match contains attribute diffs', () => {
      const roster = {
        apaarToken: 'token_conflict_test',
        applicationNo: 'APP-1002',
        name: 'Rahul Kumar',
        dob: '2004-01-10',
        category: 'GENERAL',
        programmeCode: 'CSE',
        academicYear: '2025-26',
        gender: 'MALE'
      };

      const ext = [
        {
          _id: 'ext_conflict',
          apaarToken: 'token_conflict_test',
          applicationNo: 'APP-1002',
          candidateName: 'Rahul Kumar',
          dob: '2004-01-10',
          category: 'OBC', // Conflict!
          programmeCode: 'CSE',
          academicYear: '2025-26',
          gender: 'MALE'
        }
      ];

      const result = matchRosterRecordAgainstSource(roster, ext, 'ADMISSION');
      expect(result.status).toBe('CONFLICT');
      expect(result.fieldDiffs).toHaveLength(1);
      expect(result.fieldDiffs[0].field).toBe('category');
      expect(result.fieldDiffs[0].rosterValue).toBe('GENERAL');
      expect(result.fieldDiffs[0].sourceValue).toBe('OBC');
    });
  });

  describe('5. Duplicate Candidate Discovery', () => {
    test('should detect K1 and K3 collision duplicates within records', () => {
      const records = [
        {
          rowKey: 'row_1',
          apaarToken: 'token_duplicate_1',
          applicationNo: 'APP-1',
          name: 'Ananya Roy',
          dob: '2004-02-14',
          programmeCode: 'CSE'
        },
        {
          rowKey: 'row_2',
          apaarToken: 'token_duplicate_1', // Duplicate K1
          applicationNo: 'APP-2',
          name: 'Ananya Roy',
          dob: '2004-02-14',
          programmeCode: 'CSE'
        }
      ];

      const duplicates = detectDuplicateCandidates(records);
      expect(duplicates).toHaveLength(2); // Collision detected on K1 and K3
      expect(duplicates.some((d) => d.keyType === 'K1_APAAR_TOKEN')).toBe(true);
      expect(duplicates.some((d) => d.keyType === 'K3_NAME_DOB_PROGRAMME')).toBe(true);
    });
  });
});
