/**
 * Source-verified Domain Model interfaces.
 */
import {
  Role,
  DataMode,
  InstitutionType,
  InstitutionStatus,
  ScoreBand,
  MetricStatus,
  ScoreTriggerReason,
  Freshness,
  RevalidationStatus,
  SeatBalanceStatus,
  IntakeVerificationStatus,
  IntakeSourceMode,
  SeatLedgerEntryType,
  ReconciliationSource,
  ReconciliationFindingType,
  FindingSeverity,
  FindingReviewStatus,
  RosterUploadStatus,
  RosterVersionStatus,
  TransferStatus,
  TransferConfirmationStatus,
  OverlapStatus,
  OverlapSeverity,
  OverlapCaseType,
  OverlapResolutionCode,
  SamplingRunStatus,
  SamplingItemVerificationStatus,
  SamplingItemVerificationMethod,
  SamplingStratum,
  VerificationLabel,
  VerificationMethod,
  VerificationStatus,
  VerificationSubjectType,
  StudentLifecycleEventType,
  StudentLifecycleStatus,
  ConnectorHealthStatus,
} from './enums';

export interface User {
  _id: string;
  email: string;
  name: string;
  role: Role;
  institutionId?: string | null;
  assignedInstitutionIds?: string[];
  isActive: boolean;
  isActivated: boolean;
  emailVerified: boolean;
  isDemoUser?: boolean;
  dataMode?: DataMode;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  permissions: string[];
}

export interface Institution {
  _id: string;
  code: string;
  name: string;
  type: InstitutionType;
  state: string;
  status: InstitutionStatus;
  dataMode: DataMode;
}

export interface ScoreSnapshot {
  _id: string;
  institutionId: string;
  reportingPeriod: string;
  institutionType?: InstitutionType;
  programmeCode?: string;
  overallScore: number | null; // null if INSUFFICIENT_DATA, NEVER 0
  band: ScoreBand;
  isEligibleForScore: boolean;
  ineligibleReason?: string;
  inScopeRecordCount: number;
  unresolvedCount?: number;
  metrics: {
    m1Completeness: {
      status: MetricStatus;
      completenessPct?: number;
      subScore: number | null;
      weightConfigured?: number;
      weightUsed: number | null;
      missingFieldBreakdown?: Array<{
        fieldName: string;
        missingCount: number;
        populatedCount: number;
      }>;
    };
    m2Discrepancies: {
      status: MetricStatus;
      openDiscrepancies?: number;
      unresolvedRatePer1000?: number;
      subScore: number | null;
      weightConfigured?: number;
      weightUsed: number | null;
      ageingDistribution?: Array<{
        bucket: '0-7 days' | '8-30 days' | '31+ days';
        count: number;
        severity?: Record<string, number>;
      }>;
    };
    m3Timeliness: {
      status: MetricStatus;
      medianLagDays?: number;
      onTimePct?: number;
      subScore: number | null;
      weightConfigured?: number;
      weightUsed: number | null;
      timelinessDistribution?: Array<{
        category: 'On-Time (<=15d)' | 'Late (>15d)';
        count: number;
        pct: number;
      }>;
    };
    m4Corrections: {
      status: MetricStatus;
      enabledInScore?: boolean;
      subScore: number | null;
      weightUsed: number | null;
      monthlyTrend?: Array<{
        month: string;
        totalCorrections: number;
        selfInitiatedCount: number;
        medianTurnaroundDays: number;
      }>;
    };
  };
  dataCoverage?: {
    coveragePct: number;
    expectedSources: string[];
    availableSources: string[];
    missingSources: string[];
    sourceModes?: Record<string, string>;
    sourceFreshness?: Record<string, string>;
  };
  freshness: Freshness;
  revalidationStatus?: RevalidationStatus;
  supportSuggestions?: Array<{
    area: string;
    suggestion: string;
    rationale?: string;
  }>;
  disclaimer: string; // Mandatory non-punitive constant
  calculatedAt: string;
  triggerReason: ScoreTriggerReason;
  configVersion?: string;
  isStale?: boolean;
}

export interface ScorecardTrendPoint {
  calculatedAt: string;
  overallScore: number | null;
  band: ScoreBand;
  configVersion: string;
  reportingPeriod: string;
  formulaChanged?: boolean;
  isStale?: boolean;
  m1SubScore?: number | null;
  m2SubScore?: number | null;
  m3SubScore?: number | null;
  m4SubScore?: number | null;
  completenessPct?: number;
  unresolvedRatePer1000?: number;
  onTimePct?: number;
}

export interface ScorecardCompareItem {
  institutionId: string;
  institutionName: string;
  institutionType: InstitutionType;
  isMaskedPeer?: boolean;
  overallScore: number | null;
  band: ScoreBand;
  m1SubScore: number | null;
  m2SubScore: number | null;
  m3SubScore: number | null;
  m4SubScore: number | null;
  comparabilityWarning?: string | null;
}

export interface ScoringConfig {
  _id: string;
  configVersion: string;
  name: string;
  description?: string;
  isActive: boolean;
  weights: {
    m1Completeness: number;
    m2Discrepancies: number;
    m3Timeliness: number;
    m4Corrections: number;
  };
  thresholds: {
    strongMin: number;
    adequateMin: number;
    needsSupportMin: number;
  };
  timelinessWindowDays: number;
  createdAt: string;
}

export interface SeatBalance {
  _id: string;
  bucketKey: string;
  institutionId: string;
  programmeId?: string;
  programmeCode: string;
  academicYear: string;
  seatCategory: string;
  approvedIntake: number | null;
  reportedOccupancy: number;
  headroom: number | null;
  utilisationPct: number | null;
  warningThresholdPct: number;
  status: SeatBalanceStatus;
  intakeVerificationStatus: IntakeVerificationStatus;
  intakeSourceMode: IntakeSourceMode;
  isSimulated?: boolean;
  intakeSourceRef?: string | null;
  verificationMethod?: string | null;
  verificationEvidenceRef?: string | null;
  freshness: Freshness;
  staleReason?: string | null;
  flags?: string[];
  lastEntryAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SeatLedgerEntry {
  _id: string;
  bucketKey: string;
  institutionId: string;
  programmeCode: string;
  academicYear: string;
  seatCategory: string;
  type: SeatLedgerEntryType;
  delta: number;
  intakeDelta: number;
  balanceAfter: {
    approvedIntake: number | null;
    reportedOccupancy: number;
    headroom: number | null;
    utilisationPct: number | null;
  };
  effectiveDate: string;
  sourceReference?: string;
  sourceMode: string;
  verificationStatus?: string | null;
  verificationMethod?: string | null;
  actor?: {
    userId: string;
    role: Role | string;
    email: string;
  };
  reason?: string;
  idempotencyKey?: string;
  createdAt?: string;
}

export interface MassBalanceResult {
  institutionId?: string;
  programmeCode: string;
  academicYear: string;
  previousAcademicYear?: string | null;
  durationYears?: number | null;
  baselinePreviousCohortCount?: number | null;
  entrants: number;
  exits: number;
  retentionRate: number;
  expectedContinuingCount?: number | null;
  reportedCurrentCount?: number | null;
  discrepancyDelta?: number | null;
  status:
    | 'RECONCILED'
    | 'COHORT_CARRYOVER_MISMATCH'
    | 'INSUFFICIENT_HISTORICAL_DATA'
    | 'INSUFFICIENT_CURRENT_DATA'
    | 'UNKNOWN_PROGRAMME_RULES'
    | string;
  isProvisional: boolean;
  explanation: string;
  evaluatedAt: string;
}

export interface LedgerIntegrityReport {
  ok: boolean;
  totalBucketsChecked: number;
  driftsCount: number;
  drifts: Array<{
    bucketKey: string;
    institutionId: string;
    programmeCode: string;
    academicYear: string;
    seatCategory: string;
    cachedOccupancy: number;
    computedFromLedger: number;
    drift: number;
  }>;
}

export interface OccupancyRule {
  _id: string;
  ruleVersion: string;
  name: string;
  warningThresholdPct: number;
  description?: string;
  countingStrategy?: string;
  policySourceRef?: string;
  effectiveFrom?: string;
  isActive: boolean;
}

export interface ReconciliationRun {
  _id?: string;
  id?: string;
  runId: string;
  institutionId: string;
  academicYear: string;
  rosterVersionId: string;
  programmeCodes?: string[];
  sources: ReconciliationSource[];
  sourceModes?: Record<string, string>;
  sourceFreshness?: Record<string, string>;
  ruleVersion?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  summary: {
    rosterRecords: number;
    confirmed3Way: number;
    confirmedPartial: number;
    unmatched: number;
    conflicts: number;
    candidateReview: number;
    duplicateCandidates: number;
    missingFromRoster: number;
    countMismatches: number;
    sourceUnavailable: number;
  };
  freshness?: Freshness;
  revalidationStatus?: RevalidationStatus;
  idempotencyKey?: string;
  createdAt: string;
}

export interface FieldDiff {
  field: string;
  rosterValue?: string;
  sourceValue?: string;
  source?: string;
  expected?: unknown;
  observed?: unknown;
}

export interface ReconciliationFinding {
  _id: string;
  runId: string;
  institutionId: string;
  type: ReconciliationFindingType;
  severity: FindingSeverity;
  recordRef: {
    rowKey?: string;
    applicationNo?: string;
    apaarTokenMasked?: string;
    studentNameMasked?: string;
    programmeCode?: string;
    category?: string;
  };
  sourceRefs?: Array<{
    source: ReconciliationSource | string;
    sourceRecordId?: string;
    identifier?: string;
    identifierMasked?: string;
    attributes?: Record<string, unknown>;
    sourceMode?: string;
  }>;
  fieldDiffs?: FieldDiff[];
  matchConfidence?: 'STRONG' | 'MODERATE' | 'WEAK';
  reviewStatus: FindingReviewStatus;
  reviewHistory?: Array<{
    by: string;
    role: Role | string;
    action: string;
    note: string;
    at: string;
  }>;
  explanation: {
    expected: string;
    observed: string;
    sourcesCompared: ReconciliationSource[] | string[];
    ruleApplied?: string;
    nextAction?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ReconciliationSummaryData {
  runId: string;
  status: string;
  ruleVersion?: string;
  academicYear: string;
  sources: string[];
  sourceModes?: Record<string, string>;
  sourceFreshness?: Record<string, string>;
  summary: {
    rosterRecords: number;
    confirmed3Way: number;
    confirmedPartial: number;
    unmatched: number;
    conflicts: number;
    candidateReview: number;
    duplicateCandidates: number;
    missingFromRoster: number;
    countMismatches: number;
    sourceUnavailable: number;
  };
  metrics: {
    reconciliationRatePct: number;
    unresolvedCount: number;
    coveragePct: number;
  };
  chartBreakdown: Array<{
    label: string;
    count: number;
    status: string;
  }>;
}

export interface RosterUpload {
  id: string;
  _id?: string;
  institutionId: string;
  academicYear: string;
  programmeCode?: string;
  filename: string;
  fileSha256: string;
  rowCount: number;
  status: RosterUploadStatus;
  validation: {
    errors: number;
    warnings: number;
    ruleVersion: string;
    rowErrors?: Array<{
      rowNumber: number;
      applicationNo?: string;
      issues: Array<{ field: string; issue: string }>;
    }>;
  };
  uploadedBy?: {
    userId: string;
    role: Role;
    email: string;
  };
  committedVersionId?: string;
  createdAt?: string;
}

export interface RosterVersion {
  _id: string;
  id?: string;
  institutionId: string;
  academicYear: string;
  versionNumber: number;
  sequenceNumber?: number;
  programmeCode?: string;
  status: RosterVersionStatus;
  uploadId?: string;
  fileSha256: string;
  rowCount: number;
  isSealed?: boolean;
  merkleRoot?: string | null;
  isAnchored?: boolean;
  anchorSequence?: number | null;
  committedBy?: {
    userId: string;
    role: Role;
    email: string;
  };
  committedAt: string;
  attestedAt?: string;
  createdAt?: string;
}

export interface RosterRowDiff {
  rowKey: string;
  applicationNo: string;
  diffType: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED' | 'UNKEYED';
  fieldDiffs: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
}

export interface RosterVersionCompareResult {
  baseVersion: { id: string; versionNumber: number };
  targetVersion: { id: string; versionNumber: number };
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  rowDiffs: RosterRowDiff[];
}

export interface SealVerificationResult {
  result: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  checkedAt: string;
  rosterVersionId: string;
  versionNumber: number;
  institutionId: string;
  academicYear: string;
  merkleRoot: string;
  expectedRoot: string;
  recomputedRoot: string;
  signatureValid: boolean;
  chainValid: boolean;
  mismatchedRowKeys?: string[];
  explanation: string;
  disclaimer: string;
}

export interface IntegritySealManifest {
  _id: string;
  rosterVersionId: string;
  institutionId: string;
  academicYear: string;
  versionNumber: number;
  rowCount: number;
  sealSchemaVersion: string;
  merkleRoot: string;
  previousSealRoot?: string | null;
  manifestHash: string;
  rowHashSample?: string[];
  sealedAt: string;
  sealedBy?: {
    userId: string;
    role: Role;
    email: string;
  };
}

export interface TransferCase {
  _id: string;
  caseId?: string;
  studentTokenId: string;
  studentRef?: string;
  sendingInstitutionId: string | { _id?: string; code?: string; name?: string; type?: string };
  sendingProgrammeCode?: string;
  receivingInstitutionId: string | { _id?: string; code?: string; name?: string; type?: string };
  receivingProgrammeCode?: string;
  programmeCode: string;
  academicYear: string;
  seatCategory?: string;
  proposedEffectiveDate: string;
  deadline?: string;
  sendingConfirmation: {
    status: TransferConfirmationStatus;
    confirmedAt?: string;
    effectiveDate?: string;
    reason?: string;
    notes?: string;
  };
  receivingConfirmation: {
    status: TransferConfirmationStatus;
    confirmedAt?: string;
    effectiveDate?: string;
    reason?: string;
    notes?: string;
  };
  status: TransferStatus | string;
  dateGapDays?: number;
  ledgerSynced: boolean;
  createdAt: string;
}

export interface OverlapCase {
  _id: string;
  caseId: string;
  studentTokenId: string;
  studentRef?: string;
  overlapDays?: number;
  institutions: Array<{
    institutionId: string | any;
    institutionName?: string;
    programmeCode: string;
    academicYear: string;
    enrollmentInterval: {
      startDate: string;
      endDate?: string;
    };
  }>;
  overlapInterval?: {
    startDate: string;
    endDate: string;
    overlapDays: number;
  };
  caseType: OverlapCaseType | string;
  status: OverlapStatus | string;
  severity: OverlapSeverity | string;
  policySourceRef?: string;
  policyVerified?: boolean;
  explanation: string;
  resolution?: {
    code: OverlapResolutionCode | string;
    notes?: string;
    resolvedBy?: { userId: string; role: Role | string; email: string };
    resolvedAt?: string;
  };
  createdAt: string;
}

export interface SamplingRun {
  _id: string;
  runId: string;
  institutionId: string;
  rosterVersionId: string;
  academicYear: string;
  programmeCode?: string;
  seatCategory?: string;
  eligiblePopulationSize: number;
  sampleSize: number;
  targetedSampleSize: number;
  totalSampleSize: number;
  samplingParameters: {
    confidenceLevel: number;
    marginOfError: number;
    expectedProportion: number;
    minSampleSize: number;
    maxSampleSize: number;
  };
  status: SamplingRunStatus;
  summary: {
    total: number;
    pending: number;
    verified: number;
    failedCheck: number;
    unconfirmed: number;
    excluded: number;
    responseRate: number;
  };
  closedBy?: {
    userId: string;
    role: Role;
    email: string;
    closedAt: string;
    reason: string;
  };
  createdAt: string;
}

export interface SamplingItem {
  _id: string;
  samplingRunId: string;
  institutionId: string;
  rosterRowId: string;
  rowKey: string;
  stratum: SamplingStratum | string;
  applicationNo: string;
  apaarLast4?: string;
  apaarTokenMasked?: string;
  studentNameMasked: string;
  dob?: string;
  gender?: string;
  category?: string;
  seatCategory?: string;
  programmeCode: string;
  academicYear: string;
  verificationStatus: SamplingItemVerificationStatus | string;
  verificationMethod?: SamplingItemVerificationMethod | string | null;
  evidenceRef?: string;
  notes?: string;
  exclusionReason?: string;
  verifiedBy?: {
    userId: string;
    role: Role;
    email: string;
  };
  verifiedAt?: string;
}

export interface VerificationRecord {
  _id: string;
  subjectType: VerificationSubjectType;
  subjectId: string;
  fieldPath: string;
  institutionId: string;
  valueSnapshot: unknown;
  label: VerificationLabel;
  sourceMode: IntakeSourceMode;
  method: VerificationMethod;
  status: VerificationStatus;
  evidenceRef?: string;
  notes?: string;
  reviewer?: {
    userId: string;
    role: Role;
    email: string;
  };
  requestedAt?: string;
  verifiedAt?: string;
}

export interface ConnectorStatus {
  id: string;
  name: string;
  type?: string;
  mode?: string;
  status: ConnectorHealthStatus | string;
  latencyMs: number;
  isSimulated: boolean;
  displayBadge?: string;
  lastChecked?: string;
  lastCheckedAt?: string;
  supportedSubjectTypes?: string[];
  errorMessage?: string;
  error?: string | null;
}

export interface StudentLifecycleEvent {
  _id: string;
  studentTokenId: string;
  institutionId: string;
  type: StudentLifecycleEventType;
  effectiveDate: string;
  reportedAt: string;
  sourceRef?: string;
  status: StudentLifecycleStatus;
  supersedesEventId?: string;
  programmeCode?: string;
  academicYear?: string;
  seatCategory?: string;
  notes?: string;
  actor?: {
    userId: string;
    role: Role;
    email: string;
  };
}

export interface AuditEvent {
  _id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  institutionId?: string;
  performedBy?: {
    userId: string;
    role: Role;
    email: string;
  };
  details?: Record<string, unknown>;
  createdAt: string;
}
