/**
 * Label Resolution Service.
 * Implements deterministic assurance label calculation, evidence precedence,
 * simulation isolation, conflict detection, and history preservation.
 *
 * PRECEDENCE OF EVIDENCE:
 * 1. AUTHORITY_VERIFIED (LIVE authoritative source or authenticated live officer review)
 * 2. AUTHORITY_VERIFIED_SIMULATED (Simulated regulatory approval; explicitly marked SIMULATED)
 * 3. DOCUMENT_SUPPORTED (Authorized officer review with recorded supporting evidence)
 * 4. CROSS_REGISTER_CONFIRMED (Strong match against qualifying independent register)
 * 5. INSTITUTION_DECLARED (Baseline default for institution-submitted values)
 * 6. VERIFICATION_PENDING (Unresolved verification or conflicting evidence)
 * 7. UNABLE_TO_VERIFY (Upstream source unavailable; not a negative match or failure verdict)
 */
const VerificationRecord = require('../models/verificationRecord.model');

const LABEL_RANKS = {
  AUTHORITY_VERIFIED: 7,
  AUTHORITY_VERIFIED_SIMULATED: 6,
  DOCUMENT_SUPPORTED: 5,
  CROSS_REGISTER_CONFIRMED: 4,
  INSTITUTION_DECLARED: 3,
  VERIFICATION_PENDING: 2,
  UNABLE_TO_VERIFY: 1
};

const BADGE_CONFIG = {
  AUTHORITY_VERIFIED: {
    text: 'Authority Verified',
    variant: 'success',
    isSimulated: false,
    confidenceScore: 1.0
  },
  AUTHORITY_VERIFIED_SIMULATED: {
    text: 'Authority Verified (Simulated)',
    variant: 'warning',
    isSimulated: true,
    confidenceScore: 0.85
  },
  DOCUMENT_SUPPORTED: {
    text: 'Document Supported',
    variant: 'info',
    isSimulated: false,
    confidenceScore: 0.8
  },
  CROSS_REGISTER_CONFIRMED: {
    text: 'Cross-Register Confirmed',
    variant: 'info',
    isSimulated: true, // Prototype registers are simulated
    confidenceScore: 0.75
  },
  INSTITUTION_DECLARED: {
    text: 'Institution Declared',
    variant: 'neutral',
    isSimulated: false,
    confidenceScore: 0.5
  },
  VERIFICATION_PENDING: {
    text: 'Verification Pending',
    variant: 'warning',
    isSimulated: false,
    confidenceScore: 0.3
  },
  UNABLE_TO_VERIFY: {
    text: 'Unable to Verify',
    variant: 'neutral',
    isSimulated: false,
    confidenceScore: 0.2
  }
};

/**
 * Resolves the effective assurance label for a given subject and field.
 *
 * @param {Object} params
 * @param {string} params.subjectType - e.g. 'PROGRAMME_INTAKE', 'ROSTER_RECORD'
 * @param {string} params.subjectId - e.g. bucketKey or roster row ID
 * @param {string} params.fieldPath - e.g. 'approvedIntake'
 * @param {*} [params.currentValue] - current active value; records matching old values are superseded
 * @param {*} [params.currentValue] - current active value; records matching old values are superseded
 * @param {string} [params.requiredSourceVersion] - optional required minimum/active source version; stale versions are excluded
 * @param {Array<Object>} [params.records] - optional pre-loaded verification records
 * @returns {Promise<Object>} Effective label resolution summary
 */
async function resolveEffectiveLabel({
  subjectType,
  subjectId,
  fieldPath,
  currentValue = null,
  requiredSourceVersion = null,
  records = null
}) {
  let activeRecords = records;

  if (!activeRecords) {
    activeRecords = await VerificationRecord.find({
      subjectType,
      subjectId,
      fieldPath
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  // Baseline if no records exist at all
  if (!activeRecords || activeRecords.length === 0) {
    const badge = BADGE_CONFIG.INSTITUTION_DECLARED;
    return {
      effectiveLabel: 'INSTITUTION_DECLARED',
      sourceMode: 'INSTITUTION_DECLARED',
      isSimulated: false,
      status: 'COMPLETED',
      displayBadge: badge,
      confidenceScore: badge.confidenceScore,
      lastVerifiedAt: null,
      provenanceList: [],
      hasConflict: false,
      conflictReason: null,
      notes: 'Default baseline: value reported by institution without independent qualification.'
    };
  }

  const now = new Date();
  const qualifyingRecords = [];
  let hasConflict = false;
  let conflictReason = null;
  let hasUnavailable = false;
  let hasPending = false;

  for (const record of activeRecords) {
    // 1. Exclude explicitly superseded records
    if (record.status === 'SUPERSEDED') {
      continue;
    }

    // 2. Exclude expired records
    if (record.expiresAt && new Date(record.expiresAt) < now) {
      continue;
    }

    // 3. Exclude records invalidated by a source-version change
    if (
      requiredSourceVersion &&
      record.ruleOrSourceVersion &&
      record.ruleOrSourceVersion !== requiredSourceVersion
    ) {
      continue;
    }

    // 4. Local Invalidation on Value Change:
    // If the record was verified against a different valueSnapshot, it cannot verify currentValue
    if (
      currentValue !== null &&
      currentValue !== undefined &&
      record.valueSnapshot !== null &&
      record.valueSnapshot !== undefined &&
      String(record.valueSnapshot) !== String(currentValue)
    ) {
      continue;
    }

    // 5. Check status
    if (record.status === 'CONFLICT') {
      hasConflict = true;
      conflictReason = record.notes || 'Conflicting verification evidence recorded.';
    } else if (record.status === 'UNABLE_TO_VERIFY' || record.label === 'UNABLE_TO_VERIFY') {
      hasUnavailable = true;
    } else if (record.status === 'PENDING') {
      hasPending = true;
    }

    // Eligible qualifying record
    qualifyingRecords.push(record);
  }

  // Build full provenance list from all qualifying records
  const provenanceList = qualifyingRecords.map((r) => ({
    verificationId: r._id,
    label: r.label,
    sourceMode: r.sourceMode,
    method: r.method,
    status: r.status,
    sourceRef: r.sourceRef,
    connectorId: r.connectorId,
    evidenceRef: r.evidenceRef,
    verifiedAt: r.verifiedAt || r.createdAt,
    reviewer: r.reviewer,
    isSimulated: r.sourceMode === 'SIMULATED' || r.label.includes('SIMULATED')
  }));

  // Conflict state takes precedence over normal resolution
  if (hasConflict) {
    const badge = BADGE_CONFIG.VERIFICATION_PENDING;
    return {
      effectiveLabel: 'VERIFICATION_PENDING',
      sourceMode: 'SIMULATED',
      isSimulated: true,
      status: 'CONFLICT',
      displayBadge: {
        text: 'Conflict Detected',
        variant: 'danger',
        isSimulated: true,
        confidenceScore: 0.1
      },
      confidenceScore: 0.1,
      lastVerifiedAt: null,
      provenanceList,
      hasConflict: true,
      conflictReason,
      notes: conflictReason
    };
  }

  // Filter completed verified records
  const verifiedRecords = qualifyingRecords.filter(
    (r) => r.status === 'COMPLETED' && r.label !== 'UNABLE_TO_VERIFY'
  );

  if (verifiedRecords.length === 0) {
    if (hasPending) {
      const badge = BADGE_CONFIG.VERIFICATION_PENDING;
      return {
        effectiveLabel: 'VERIFICATION_PENDING',
        sourceMode: 'SIMULATED',
        isSimulated: false,
        status: 'PENDING',
        displayBadge: badge,
        confidenceScore: badge.confidenceScore,
        lastVerifiedAt: null,
        provenanceList,
        hasConflict: false,
        conflictReason: null,
        notes: 'Verification is currently in-flight or awaiting manual evidence review.'
      };
    }

    if (hasUnavailable) {
      const badge = BADGE_CONFIG.UNABLE_TO_VERIFY;
      return {
        effectiveLabel: 'UNABLE_TO_VERIFY',
        sourceMode: 'SIMULATED',
        isSimulated: true,
        status: 'UNABLE_TO_VERIFY',
        displayBadge: badge,
        confidenceScore: badge.confidenceScore,
        lastVerifiedAt: null,
        provenanceList,
        hasConflict: false,
        conflictReason: null,
        notes: 'Upstream verification source unavailable or returned no usable record.'
      };
    }

    // Default to institution declared
    const badge = BADGE_CONFIG.INSTITUTION_DECLARED;
    return {
      effectiveLabel: 'INSTITUTION_DECLARED',
      sourceMode: 'INSTITUTION_DECLARED',
      isSimulated: false,
      status: 'COMPLETED',
      displayBadge: badge,
      confidenceScore: badge.confidenceScore,
      lastVerifiedAt: null,
      provenanceList,
      hasConflict: false,
      conflictReason: null,
      notes: 'No qualifying external or regulatory verification active for this value.'
    };
  }

  // Sort qualifying verified records by highest rank
  verifiedRecords.sort((a, b) => {
    const rankA = LABEL_RANKS[a.label] || 0;
    const rankB = LABEL_RANKS[b.label] || 0;
    return rankB - rankA;
  });

  const bestRecord = verifiedRecords[0];

  // STRICT RULE: Never produce genuine AUTHORITY_VERIFIED if sourceMode is SIMULATED
  let effectiveLabel = bestRecord.label;
  const isSimulated = bestRecord.sourceMode === 'SIMULATED' || effectiveLabel.includes('SIMULATED');

  if (isSimulated && effectiveLabel === 'AUTHORITY_VERIFIED') {
    effectiveLabel = 'AUTHORITY_VERIFIED_SIMULATED';
  }

  const badge = BADGE_CONFIG[effectiveLabel] || BADGE_CONFIG.INSTITUTION_DECLARED;

  return {
    effectiveLabel,
    sourceMode: bestRecord.sourceMode,
    isSimulated,
    status: 'COMPLETED',
    displayBadge: {
      ...badge,
      isSimulated
    },
    confidenceScore: badge.confidenceScore,
    lastVerifiedAt: bestRecord.verifiedAt || bestRecord.createdAt,
    bestRecordId: bestRecord._id,
    provenanceList,
    hasConflict: false,
    conflictReason: null,
    notes: bestRecord.notes || null
  };
}

module.exports = {
  resolveEffectiveLabel,
  LABEL_RANKS,
  BADGE_CONFIG
};
