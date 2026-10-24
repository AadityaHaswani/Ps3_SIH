/**
 * Comparability & Anonymisation Service.
 * Validates whether score snapshots across institutions are directly comparable.
 * Protects cross-institution confidentiality by anonymising peer institution identities
 * for institution-scoped users.
 */

/**
 * Validates comparability across a list of score snapshots.
 * @param {Array<Object>} snapshotsWithInstitution - Array of snapshots with populated institution info
 * @returns {Object} Comparability analysis with warnings
 */
function evaluateComparability(snapshotsWithInstitution) {
  const warnings = [];
  let isDirectlyComparable = true;

  if (!snapshotsWithInstitution || snapshotsWithInstitution.length < 2) {
    return {
      isDirectlyComparable: true,
      warnings: ['Provide at least two institutions to perform comparison.']
    };
  }

  const first = snapshotsWithInstitution[0];
  const baseType = first.institutionType || (first.institution && first.institution.type);
  const basePeriod = first.reportingPeriod;
  const baseFormula = first.configVersion;

  for (let i = 1; i < snapshotsWithInstitution.length; i++) {
    const item = snapshotsWithInstitution[i];
    const itemType = item.institutionType || (item.institution && item.institution.type);
    const itemPeriod = item.reportingPeriod;
    const itemFormula = item.configVersion;

    if (baseType && itemType && baseType !== itemType) {
      isDirectlyComparable = false;
      warnings.push(
        `Mismatched institution types (${baseType} vs ${itemType}). Different regulatory intake baselines and structures limit direct comparability.`
      );
    }

    if (basePeriod !== itemPeriod) {
      isDirectlyComparable = false;
      warnings.push(
        `Mismatched reporting periods (${basePeriod} vs ${itemPeriod}). Operational calendars and intake phases differ.`
      );
    }

    if (baseFormula !== itemFormula) {
      isDirectlyComparable = false;
      warnings.push(
        `Incompatible formula versions (${baseFormula} vs ${itemFormula}). Weighting or metric definitions changed between versions; scores are not numerically equivalent.`
      );
    }
  }

  return {
    isDirectlyComparable,
    warnings
  };
}

/**
 * Anonymises peer institution records for institution-level callers.
 * If user is an institution role, peer institution names and codes are masked.
 * @param {Array<Object>} comparisons - Comparison items
 * @param {Object} user - Authenticated user
 * @returns {Array<Object>} Sanitised comparison items
 */
function sanitizeForViewer(comparisons, user) {
  if (!user) return comparisons;

  const isInstitutionUser = user.role && user.role.startsWith('INSTITUTION_');
  const userInstId = user.institutionId ? String(user.institutionId) : null;

  if (!isInstitutionUser) {
    // Authority / Auditor / Platform Admin can see full institution details
    return comparisons;
  }

  // Anonymise any peer institution that does not match caller's institution
  return comparisons.map((item, index) => {
    const itemInstId = item.institutionId ? String(item.institutionId) : null;

    if (itemInstId && itemInstId === userInstId) {
      return {
        ...item,
        isOwnInstitution: true
      };
    }

    // Mask peer institution identity
    const safeType = item.institutionType || 'College';
    return {
      ...item,
      institutionId: `peer-${index + 1}`,
      institutionName: `Peer Institution ${String.fromCharCode(65 + index)} (${safeType})`,
      institutionCode: `PEER-${index + 1}`,
      isOwnInstitution: false
    };
  });
}

module.exports = {
  evaluateComparability,
  sanitizeForViewer
};
