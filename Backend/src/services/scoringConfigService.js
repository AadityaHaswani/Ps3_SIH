/**
 * Scoring Configuration Service.
 * Manages versioned scoring formulas, parameter updates, and active configuration resolution.
 * Strictly preserves old formula versions so historical snapshots remain verifiable.
 */
const ScoringConfig = require('../models/scoringConfig.model');

const DEFAULT_CONFIG_VERSION = 'v1.0';

/**
 * Retrieves the current active scoring configuration, seeding v1.0 if none exists.
 */
async function getActiveConfig() {
  let activeConfig = await ScoringConfig.findOne({ isActive: true }).sort({ createdAt: -1 });

  if (!activeConfig) {
    // If default config already exists in database, reactivate it
    activeConfig = await ScoringConfig.findOne({ configVersion: DEFAULT_CONFIG_VERSION });
    if (activeConfig) {
      activeConfig.isActive = true;
      await activeConfig.save();
      return activeConfig;
    }

    // Otherwise seed default prototype v1.0 configuration
    try {
      activeConfig = await ScoringConfig.create({
        configVersion: DEFAULT_CONFIG_VERSION,
        name: 'Prototype Reliability Scoring Formula',
        description:
          'Baseline versioned prototype formula with 40% Completeness, 30% Discrepancies, and 30% Timeliness. Corrections disabled in score.',
        isActive: true,
      weights: {
        m1Completeness: 0.40,
        m2Discrepancies: 0.30,
        m3Timeliness: 0.30,
        m4Corrections: 0.00
      },
      m4EnabledInScore: false,
      parameters: {
        m1: {
          requiredFields: [
            'applicationNo',
            'apaarToken',
            'name',
            'dob',
            'gender',
            'category',
            'programmeCode',
            'academicYear'
          ],
          minRecords: 30,
          ruleVersion: 'roster-req-fields@1'
        },
        m2: {
          rateCeilingPer1000: 50.0,
          ageingBucketsDays: [7, 30],
          minRecords: 30,
          contributingTypes: [
            'UNMATCHED',
            'CONFLICT',
            'CANDIDATE_REVIEW',
            'DUPLICATE_CANDIDATE',
            'MISSING_FROM_ROSTER',
            'COUNT_MISMATCH'
          ]
        },
        m3: {
          lagCeilingDays: 30,
          onTimeWindowDays: 15,
          minDatedEvents: 20
        },
        m4: {
          turnaroundCeilingDays: 14,
          repeatCorrectionThresholdPct: 15
        },
        thresholds: {
          minRecordsForInstitutionScore: 50,
          minMetricsRequired: 2
        }
      },
      bands: {
        strongMin: 85.0,
        adequateMin: 70.0,
        needsSupportMin: 50.0
      },
      isOfficialPolicy: false,
      createdBy: {
        userId: 'system',
        role: 'SYSTEM',
        email: 'system@aicte.gov.in'
      }
    });
    } catch (err) {
      if (err.code === 11000) {
        activeConfig = await ScoringConfig.findOne({ configVersion: DEFAULT_CONFIG_VERSION });
        if (activeConfig) {
          activeConfig.isActive = true;
          await activeConfig.save();
          return activeConfig;
        }
      }
      throw err;
    }
  }

  return activeConfig;
}

/**
 * Retrieves a scoring configuration by its unique version string.
 * @param {string} version 
 */
async function getConfigByVersion(version) {
  if (!version) return getActiveConfig();
  const config = await ScoringConfig.findOne({ configVersion: version });
  if (!config) {
    return getActiveConfig();
  }
  return config;
}

/**
 * Creates a new versioned scoring configuration.
 * Only callable by authorised authority users.
 * @param {Object} data 
 * @param {Object} user 
 */
async function createConfigVersion(data, user) {
  if (!data.configVersion || !data.configVersion.trim()) {
    const error = new Error('configVersion is required (e.g. v1.1, v2.0).');
    error.statusCode = 400;
    throw error;
  }

  const existing = await ScoringConfig.findOne({ configVersion: data.configVersion.trim() });
  if (existing) {
    const error = new Error(`Scoring configuration version '${data.configVersion}' already exists.`);
    error.statusCode = 409;
    throw error;
  }

  // Deactivate prior active configs if the new one is marked active (default true)
  const makeActive = data.isActive !== false;
  if (makeActive) {
    await ScoringConfig.updateMany({ isActive: true }, { $set: { isActive: false } });
  }

  const newConfig = await ScoringConfig.create({
    configVersion: data.configVersion.trim(),
    name: data.name || `Scoring Configuration ${data.configVersion}`,
    description: data.description || 'Versioned institutional reliability scoring parameters',
    isActive: makeActive,
    weights: {
      m1Completeness:
        data.weights && data.weights.m1Completeness !== undefined ? data.weights.m1Completeness : 0.40,
      m2Discrepancies:
        data.weights && data.weights.m2Discrepancies !== undefined ? data.weights.m2Discrepancies : 0.30,
      m3Timeliness:
        data.weights && data.weights.m3Timeliness !== undefined ? data.weights.m3Timeliness : 0.30,
      m4Corrections:
        data.weights && data.weights.m4Corrections !== undefined ? data.weights.m4Corrections : 0.00
    },
    m4EnabledInScore: data.m4EnabledInScore === true,
    parameters: data.parameters || {
      m1: { minRecords: 30 },
      m2: { rateCeilingPer1000: 50.0, minRecords: 30 },
      m3: { lagCeilingDays: 30, onTimeWindowDays: 15, minDatedEvents: 20 },
      m4: { turnaroundCeilingDays: 14, repeatCorrectionThresholdPct: 15 },
      thresholds: { minRecordsForInstitutionScore: 50, minMetricsRequired: 2 }
    },
    bands: data.bands || {
      strongMin: 85.0,
      adequateMin: 70.0,
      needsSupportMin: 50.0
    },
    isOfficialPolicy: data.isOfficialPolicy === true,
    createdBy: {
      userId: user ? user.id : 'unknown',
      role: user ? user.role : 'UNKNOWN',
      email: user ? user.email : null
    }
  });

  return newConfig;
}

/**
 * Lists all historical scoring configuration versions.
 */
async function listConfigVersions() {
  return ScoringConfig.find().sort({ createdAt: -1 });
}

module.exports = {
  getActiveConfig,
  getConfigByVersion,
  createConfigVersion,
  listConfigVersions
};
