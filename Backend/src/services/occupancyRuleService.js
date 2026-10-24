/**
 * Occupancy Rule Service.
 * Manages versioned occupancy accounting rules, category mappings, and warning thresholds.
 */
const OccupancyRule = require('../models/occupancyRule.model');

/**
 * Retrieves the applicable occupancy rule for a given scope.
 * Falls back to active global default rule if no institution-specific rule is defined.
 */
async function getActiveOccupancyRule({ institutionId = null, programmeCode = null, academicYear = null } = {}) {
  // 1. Try to find an institution and programme specific rule
  if (institutionId) {
    const specificRule = await OccupancyRule.findOne({
      institutionId,
      isActive: true,
      ...(programmeCode ? { programmeCode } : {}),
      ...(academicYear ? { academicYear } : {})
    }).sort({ createdAt: -1 }).lean();

    if (specificRule) return specificRule;

    // 2. Try institution-level general rule
    const instGeneralRule = await OccupancyRule.findOne({
      institutionId,
      programmeCode: null,
      isActive: true
    }).sort({ createdAt: -1 }).lean();

    if (instGeneralRule) return instGeneralRule;
  }

  // 3. Fall back to global system-wide default rule
  const globalRule = await OccupancyRule.findOne({
    institutionId: null,
    isActive: true
  }).sort({ createdAt: -1 }).lean();

  if (globalRule) return globalRule;

  // 4. In-memory baseline default if database has no rules seeded yet
  return {
    ruleVersion: 'occupancy-rules@default-v1',
    warningThresholdPct: 90,
    categoryMappings: [
      { category: 'GENERAL', countsAgainst: 'GENERAL', isSupernumerary: false },
      { category: 'OBC', countsAgainst: 'GENERAL', isSupernumerary: false },
      { category: 'SC', countsAgainst: 'GENERAL', isSupernumerary: false },
      { category: 'ST', countsAgainst: 'GENERAL', isSupernumerary: false },
      { category: 'EWS', countsAgainst: 'GENERAL', isSupernumerary: false }
    ],
    policySourceRef: 'AICTE_APH_2025_26',
    policyVerified: false,
    isActive: true
  };
}

/**
 * Creates or activates a versioned occupancy rule.
 */
async function createOccupancyRule(ruleData, user = {}) {
  const rule = await OccupancyRule.create({
    ...ruleData,
    policyVerified: ruleData.policyVerified === true, // Defaults to false
    warningThresholdPct: Number(ruleData.warningThresholdPct) || 90
  });

  return rule;
}

/**
 * Lists all active and historical occupancy rules.
 */
async function listOccupancyRules(filter = {}) {
  return OccupancyRule.find(filter).sort({ createdAt: -1 }).lean();
}

module.exports = {
  getActiveOccupancyRule,
  createOccupancyRule,
  listOccupancyRules
};
