/**
 * Deterministic Matching Engine.
 * Implements candidate key precedence, attribute conflict detection, and duplicate discovery.
 * Strictly adheres to rule-based logic without opaque ML/LLM heuristics.
 */
const { deriveMatchingKeys, normaliseCategory, normaliseDate } = require('../utils/normalisation');

/**
 * Compares two records for attribute conflicts once a key match is established.
 * @param {object} rosterRecord 
 * @param {object} externalRecord 
 * @param {string} sourceName 
 * @returns {Array<object>} fieldDiffs
 */
function detectAttributeConflicts(rosterRecord, externalRecord, sourceName) {
  const diffs = [];

  // 1. Category comparison
  const rosterCat = normaliseCategory(rosterRecord.category);
  const extCat = normaliseCategory(externalRecord.category);
  if (rosterCat && extCat && rosterCat !== extCat) {
    diffs.push({
      field: 'category',
      rosterValue: rosterCat,
      sourceValue: extCat,
      source: sourceName
    });
  }

  // 2. Date of Birth comparison
  const rosterDob = normaliseDate(rosterRecord.dob);
  const extDob = normaliseDate(externalRecord.dob);
  if (rosterDob && extDob && rosterDob !== extDob) {
    diffs.push({
      field: 'dob',
      rosterValue: rosterDob,
      sourceValue: extDob,
      source: sourceName
    });
  }

  // 3. Gender comparison
  if (
    rosterRecord.gender &&
    externalRecord.gender &&
    rosterRecord.gender !== 'OTHER' &&
    externalRecord.gender !== 'OTHER' &&
    rosterRecord.gender.toUpperCase() !== externalRecord.gender.toUpperCase()
  ) {
    diffs.push({
      field: 'gender',
      rosterValue: rosterRecord.gender.toUpperCase(),
      sourceValue: externalRecord.gender.toUpperCase(),
      source: sourceName
    });
  }

  // 4. Programme Code comparison
  if (
    rosterRecord.programmeCode &&
    externalRecord.programmeCode &&
    rosterRecord.programmeCode.toUpperCase() !== externalRecord.programmeCode.toUpperCase()
  ) {
    diffs.push({
      field: 'programmeCode',
      rosterValue: rosterRecord.programmeCode.toUpperCase(),
      sourceValue: externalRecord.programmeCode.toUpperCase(),
      source: sourceName
    });
  }

  return diffs;
}

/**
 * Matches a single roster record against a collection of records from an external source.
 * @param {object} rosterRecord 
 * @param {Array<object>} sourceRecords 
 * @param {string} sourceName (e.g. 'ADMISSION', 'EXAM')
 * @returns {object} Match evaluation result
 */
function matchRosterRecordAgainstSource(rosterRecord, sourceRecords, sourceName) {
  const rosterKeys = deriveMatchingKeys(rosterRecord);

  let strongMatch = null;
  let candidateMatch = null;
  let matchKeyType = null;

  for (const ext of sourceRecords) {
    const extKeys = deriveMatchingKeys(ext);

    // K1 Match: Keyed APAAR Token (Strongest)
    if (rosterKeys.k1 && extKeys.k1 && rosterKeys.k1 === extKeys.k1) {
      strongMatch = ext;
      matchKeyType = 'K1_APAAR_TOKEN';
      break;
    }

    // K2 Match: Application No + Programme + Academic Year (Strong)
    if (rosterKeys.k2 && extKeys.k2 && rosterKeys.k2 === extKeys.k2) {
      strongMatch = ext;
      matchKeyType = 'K2_APPLICATION_PROGRAMME_YEAR';
      break;
    }

    // K3 Match: Normalised Name + DOB + Programme (Weak candidate)
    if (!candidateMatch && rosterKeys.k3 && extKeys.k3 && rosterKeys.k3 === extKeys.k3) {
      candidateMatch = ext;
      matchKeyType = 'K3_NAME_DOB_PROGRAMME';
    }
  }

  if (strongMatch) {
    const fieldDiffs = detectAttributeConflicts(rosterRecord, strongMatch, sourceName);
    return {
      status: fieldDiffs.length > 0 ? 'CONFLICT' : 'MATCHED',
      matchedRecord: strongMatch,
      matchKeyType,
      matchConfidence: 'STRONG',
      fieldDiffs
    };
  }

  if (candidateMatch) {
    const fieldDiffs = detectAttributeConflicts(rosterRecord, candidateMatch, sourceName);
    return {
      status: 'CANDIDATE_REVIEW',
      matchedRecord: candidateMatch,
      matchKeyType,
      matchConfidence: 'WEAK', // Weak matches must never auto-confirm
      fieldDiffs
    };
  }

  return {
    status: 'NOT_FOUND',
    matchedRecord: null,
    matchKeyType: null,
    matchConfidence: null,
    fieldDiffs: []
  };
}

/**
 * Detects duplicate candidates within a list of records based on K1 or K3 collisions.
 * @param {Array<object>} records 
 * @returns {Array<object>} duplicate candidate findings
 */
function detectDuplicateCandidates(records) {
  const k1Map = new Map();
  const k3Map = new Map();
  const duplicates = [];

  records.forEach((rec) => {
    const keys = deriveMatchingKeys(rec);

    if (keys.k1) {
      if (k1Map.has(keys.k1)) {
        duplicates.push({
          keyType: 'K1_APAAR_TOKEN',
          keyValue: keys.k1,
          firstRecord: k1Map.get(keys.k1),
          duplicateRecord: rec
        });
      } else {
        k1Map.set(keys.k1, rec);
      }
    }

    if (keys.k3) {
      if (k3Map.has(keys.k3)) {
        duplicates.push({
          keyType: 'K3_NAME_DOB_PROGRAMME',
          keyValue: keys.k3,
          firstRecord: k3Map.get(keys.k3),
          duplicateRecord: rec
        });
      } else {
        k3Map.set(keys.k3, rec);
      }
    }
  });

  return duplicates;
}

module.exports = {
  detectAttributeConflicts,
  matchRosterRecordAgainstSource,
  detectDuplicateCandidates
};
