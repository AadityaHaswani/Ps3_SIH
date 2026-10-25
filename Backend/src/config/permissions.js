/**
 * Centralized Permission Matrix & Access Control Definitions.
 * Single source of truth for platform permissions, role mappings, and granular capabilities.
 *
 * CANONICAL ROLES:
 * - PLATFORM_ADMIN: System governance, user management, platform administration.
 * - AUTHORITY_ADMIN: Regulatory authority rules, scoring config, cross-institution approvals.
 * - AUTHORITY_OFFICER: Operational review, sampling inspection, transfer/overlap review, seal verification.
 * - AUDITOR: Strictly read-only oversight across all permitted dashboards and data streams.
 * - INSTITUTION_ADMIN: Institution data management, roster commit, transfer confirmations, correction requests.
 * - INSTITUTION_OPERATOR: Data entry, upload/preview, lifecycle drafts, discrepancy responses (no commit or transfer confirm).
 */

const ROLES = {
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  AUTHORITY_ADMIN: 'AUTHORITY_ADMIN',
  AUTHORITY_OFFICER: 'AUTHORITY_OFFICER',
  AUDITOR: 'AUDITOR',
  INSTITUTION_ADMIN: 'INSTITUTION_ADMIN',
  INSTITUTION_OPERATOR: 'INSTITUTION_OPERATOR'
};

const PERMISSIONS = {
  // User Management
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',

  // Institutions
  INSTITUTIONS_READ: 'institutions:read',

  // Roster Management
  ROSTERS_UPLOAD: 'rosters:upload',
  ROSTERS_PREVIEW: 'rosters:preview',
  ROSTERS_COMMIT: 'rosters:commit',

  // Seat Ledger & Intake Governance
  SEAT_LEDGER_READ: 'seat-ledger:read',
  SEAT_INTAKE_DECLARE: 'seat-intake:declare',
  SEAT_INTAKE_APPROVE: 'seat-intake:approve',
  SEAT_RULES_UPDATE: 'seat-rules:update',
  SEAT_LEDGER_AUDIT: 'seat-ledger:audit',

  // Reconciliation
  RECONCILIATION_RUN: 'reconciliation:run',
  RECONCILIATION_READ: 'reconciliation:read',
  FINDINGS_REVIEW: 'findings:review',
  CORRECTIONS_REQUEST: 'corrections:request',
  CORRECTIONS_APPROVE: 'corrections:approve',

  // Assurance Sampling
  SAMPLING_READ: 'sampling:read',
  SAMPLING_CREATE: 'sampling:create',
  SAMPLING_REVIEW: 'sampling:review',
  SAMPLING_CLOSE: 'sampling:close',

  // Institutional Reliability Scorecard
  SCORECARDS_READ: 'scorecards:read',
  SCORECARDS_RECALCULATE: 'scorecards:recalculate',
  SCORING_CONFIG_UPDATE: 'scoring-config:update',

  // Student Lifecycle
  LIFECYCLE_READ: 'lifecycle:read',
  LIFECYCLE_WRITE: 'lifecycle:write',

  // Student Transfers
  TRANSFERS_READ: 'transfers:read',
  TRANSFERS_CREATE: 'transfers:create',
  TRANSFERS_CONFIRM_OWN_SIDE: 'transfers:confirm-own-side',
  TRANSFERS_PROCESS_TIMEOUTS: 'transfers:process-timeouts',

  // Enrolment Overlap Resolution
  OVERLAP_READ: 'overlap:read',
  OVERLAP_RESOLVE: 'overlap:resolve',

  // Authority Verification & Labels
  VERIFICATION_READ: 'verification:read',
  VERIFICATION_REQUEST: 'verification:request',
  VERIFICATION_REVIEW: 'verification:review',

  // Sealed Roster Versions & Verification
  ROSTER_VERSIONS_READ: 'roster-versions:read',
  ROSTER_VERSIONS_VERIFY: 'roster-versions:verify',
  ROSTER_VERSIONS_REVALIDATE: 'roster-versions:revalidate',

  // Audit Logs
  AUDIT_READ: 'audit:read',

  // Connectors
  CONNECTORS_READ: 'connectors:read',
  CONNECTORS_CONFIGURE: 'connectors:configure'
};

// Explicit mapping of each permission to permitted roles (Deny by default)
const PERMISSION_ROLE_MAP = {
  [PERMISSIONS.USERS_READ]: [ROLES.PLATFORM_ADMIN, ROLES.AUTHORITY_ADMIN],
  [PERMISSIONS.USERS_CREATE]: [ROLES.PLATFORM_ADMIN],
  [PERMISSIONS.USERS_UPDATE]: [ROLES.PLATFORM_ADMIN],

  [PERMISSIONS.INSTITUTIONS_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],

  [PERMISSIONS.ROSTERS_UPLOAD]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.ROSTERS_PREVIEW]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  // STRICT BOUNDARY: Operators cannot commit rosters
  [PERMISSIONS.ROSTERS_COMMIT]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.INSTITUTION_ADMIN
  ],

  [PERMISSIONS.SEAT_LEDGER_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.SEAT_INTAKE_DECLARE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.INSTITUTION_ADMIN
  ],
  [PERMISSIONS.SEAT_INTAKE_APPROVE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN
  ],
  [PERMISSIONS.SEAT_RULES_UPDATE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN
  ],
  [PERMISSIONS.SEAT_LEDGER_AUDIT]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUDITOR
  ],

  [PERMISSIONS.RECONCILIATION_RUN]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.INSTITUTION_ADMIN
  ],
  [PERMISSIONS.RECONCILIATION_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.FINDINGS_REVIEW]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],
  [PERMISSIONS.CORRECTIONS_REQUEST]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.INSTITUTION_ADMIN
  ],
  [PERMISSIONS.CORRECTIONS_APPROVE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN
  ],

  [PERMISSIONS.SAMPLING_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  // STRICT: Auditors are read-only and cannot create or mutate sampling runs
  [PERMISSIONS.SAMPLING_CREATE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],
  [PERMISSIONS.SAMPLING_REVIEW]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],
  [PERMISSIONS.SAMPLING_CLOSE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],

  [PERMISSIONS.SCORECARDS_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  // STRICT: Auditors and Operators cannot trigger recalculation
  [PERMISSIONS.SCORECARDS_RECALCULATE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.INSTITUTION_ADMIN
  ],
  [PERMISSIONS.SCORING_CONFIG_UPDATE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN
  ],

  [PERMISSIONS.LIFECYCLE_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.LIFECYCLE_WRITE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],

  [PERMISSIONS.TRANSFERS_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.TRANSFERS_CREATE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.INSTITUTION_ADMIN
  ],
  // STRICT: Operators cannot confirm or reject transfers
  [PERMISSIONS.TRANSFERS_CONFIRM_OWN_SIDE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.INSTITUTION_ADMIN
  ],
  [PERMISSIONS.TRANSFERS_PROCESS_TIMEOUTS]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],

  [PERMISSIONS.OVERLAP_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.OVERLAP_RESOLVE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],

  [PERMISSIONS.VERIFICATION_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.VERIFICATION_REQUEST]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.VERIFICATION_REVIEW]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],

  [PERMISSIONS.ROSTER_VERSIONS_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.ROSTER_VERSIONS_VERIFY]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN
  ],
  [PERMISSIONS.ROSTER_VERSIONS_REVALIDATE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.INSTITUTION_ADMIN
  ],

  [PERMISSIONS.AUDIT_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN
  ],

  [PERMISSIONS.CONNECTORS_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR
  ],
  [PERMISSIONS.CONNECTORS_CONFIGURE]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN
  ]
};

/**
 * Checks whether a given role possesses a specific permission.
 *
 * @param {string} role - Role enum string
 * @param {string} permission - Permission enum string
 * @returns {boolean} True if authorized
 */
function hasPermission(role, permission) {
  if (!role || !permission) return false;
  const allowed = PERMISSION_ROLE_MAP[permission];
  return Array.isArray(allowed) && allowed.includes(role);
}

/**
 * Returns the complete list of authorized permissions for a specific role.
 * Exposed in GET /api/v1/auth/me for frontend UI control.
 *
 * @param {string} role - Role enum string
 * @returns {string[]} Array of granted permission strings
 */
function getPermissionsForRole(role) {
  if (!role) return [];
  const permissions = [];
  for (const [perm, allowedRoles] of Object.entries(PERMISSION_ROLE_MAP)) {
    if (allowedRoles.includes(role)) {
      permissions.push(perm);
    }
  }
  return permissions;
}

module.exports = {
  ROLES,
  PERMISSIONS,
  PERMISSION_ROLE_MAP,
  hasPermission,
  getPermissionsForRole
};
