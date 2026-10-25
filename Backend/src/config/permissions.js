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
  // User Management: PLATFORM_ADMIN manages system users; AUTHORITY_ADMIN can inspect users
  [PERMISSIONS.USERS_READ]: [ROLES.PLATFORM_ADMIN, ROLES.AUTHORITY_ADMIN],
  [PERMISSIONS.USERS_CREATE]: [ROLES.PLATFORM_ADMIN],
  [PERMISSIONS.USERS_UPDATE]: [ROLES.PLATFORM_ADMIN],

  // Institutions: All authenticated roles may read institution directory (scoped where applicable)
  [PERMISSIONS.INSTITUTIONS_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],

  // Roster Management: Institutional workflow. PLATFORM_ADMIN does not upload or commit rosters.
  [PERMISSIONS.ROSTERS_UPLOAD]: [
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
  // STRICT BOUNDARY: Operators and Platform Admins cannot commit rosters. Only Institution Admins commit.
  [PERMISSIONS.ROSTERS_COMMIT]: [
    ROLES.INSTITUTION_ADMIN
  ],

  // Seat Ledger & Intake Governance
  [PERMISSIONS.SEAT_LEDGER_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  // Institution self-declared intake capacity
  [PERMISSIONS.SEAT_INTAKE_DECLARE]: [
    ROLES.INSTITUTION_ADMIN
  ],
  // Regulatory Authority approved intake configuration
  [PERMISSIONS.SEAT_INTAKE_APPROVE]: [
    ROLES.AUTHORITY_ADMIN
  ],
  // Regulatory occupancy rules
  [PERMISSIONS.SEAT_RULES_UPDATE]: [
    ROLES.AUTHORITY_ADMIN
  ],
  // Read-only ledger consistency audit
  [PERMISSIONS.SEAT_LEDGER_AUDIT]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUDITOR
  ],

  // Reconciliation: Authority operational functions. Institution users view results but do not execute runs.
  [PERMISSIONS.RECONCILIATION_RUN]: [
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
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
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],
  [PERMISSIONS.CORRECTIONS_REQUEST]: [
    ROLES.INSTITUTION_ADMIN
  ],
  [PERMISSIONS.CORRECTIONS_APPROVE]: [
    ROLES.AUTHORITY_ADMIN
  ],

  // Assurance Sampling: Authority reviewers execute and evaluate; Auditor is strictly read-only.
  [PERMISSIONS.SAMPLING_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.SAMPLING_CREATE]: [
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],
  [PERMISSIONS.SAMPLING_REVIEW]: [
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],
  [PERMISSIONS.SAMPLING_CLOSE]: [
    ROLES.AUTHORITY_ADMIN
  ],

  // Institutional Reliability Scorecard
  [PERMISSIONS.SCORECARDS_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  // Recalculation: Authority Admin and Institution Admin (for own institution). Officers/Auditors/Operators cannot recalculate.
  [PERMISSIONS.SCORECARDS_RECALCULATE]: [
    ROLES.AUTHORITY_ADMIN,
    ROLES.INSTITUTION_ADMIN
  ],
  [PERMISSIONS.SCORING_CONFIG_UPDATE]: [
    ROLES.AUTHORITY_ADMIN
  ],

  // Student Lifecycle: Institution data entry
  [PERMISSIONS.LIFECYCLE_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.LIFECYCLE_WRITE]: [
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],

  // Student Transfers: Handshake between institutions; Authority officers process timeouts
  [PERMISSIONS.TRANSFERS_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.TRANSFERS_CREATE]: [
    ROLES.INSTITUTION_ADMIN
  ],
  // STRICT: Two-sided confirmation by Institution Admins of respective sending/receiving sides
  [PERMISSIONS.TRANSFERS_CONFIRM_OWN_SIDE]: [
    ROLES.INSTITUTION_ADMIN
  ],
  [PERMISSIONS.TRANSFERS_PROCESS_TIMEOUTS]: [
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],

  // Enrolment Overlap Resolution
  [PERMISSIONS.OVERLAP_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.OVERLAP_RESOLVE]: [
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],

  // Authority Verification & Labels
  [PERMISSIONS.VERIFICATION_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.VERIFICATION_REQUEST]: [
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.INSTITUTION_ADMIN,
    ROLES.INSTITUTION_OPERATOR
  ],
  [PERMISSIONS.VERIFICATION_REVIEW]: [
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER
  ],

  // Sealed Roster Versions & Verification
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
    ROLES.AUTHORITY_ADMIN,
    ROLES.INSTITUTION_ADMIN
  ],

  // Audit Logs
  [PERMISSIONS.AUDIT_READ]: [
    ROLES.PLATFORM_ADMIN,
    ROLES.AUTHORITY_ADMIN,
    ROLES.AUTHORITY_OFFICER,
    ROLES.AUDITOR,
    ROLES.INSTITUTION_ADMIN
  ],

  // Connectors
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
