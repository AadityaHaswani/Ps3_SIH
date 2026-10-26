/**
 * Central TanStack Query Key Factory
 */

export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  users: {
    all: ['users'] as const,
    list: (filters: Record<string, unknown>) => ['users', 'list', filters] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },
  institutions: {
    list: ['institutions'] as const,
    detail: (id: string) => ['institutions', 'detail', id] as const,
  },
  scorecards: {
    all: ['scorecards'] as const,
    byInstitution: (id: string, reportingPeriod?: string) =>
      ['scorecards', 'institution', id, reportingPeriod || '2024-25'] as const,
    metrics: (id: string, reportingPeriod?: string) =>
      ['scorecards', 'metrics', id, reportingPeriod || '2024-25'] as const,
    trend: (id: string) => ['scorecards', 'trend', id] as const,
    history: (id: string, params?: Record<string, unknown>) =>
      ['scorecards', 'history', id, params] as const,
    compare: (ids: string[], period?: string) =>
      ['scorecards', 'compare', ids.sort().join(','), period || '2024-25'] as const,
    config: (version?: string) => ['scorecards', 'config', version || 'active'] as const,
  },
  seatLedger: {
    all: ['seatLedger'] as const,
    balances: (filters: Record<string, unknown>) => ['seatLedger', 'balances', filters] as const,
    balanceDetail: (id: string) => ['seatLedger', 'balance', id] as const,
    entries: (id: string, page?: number) => ['seatLedger', 'entries', id, page || 1] as const,
    history: (bucketKey: string) => ['seatLedger', 'history', bucketKey] as const,
    rules: (activeOnly?: boolean) => ['seatLedger', 'rules', activeOnly] as const,
    massBalance: (params: Record<string, unknown>) => ['seatLedger', 'massBalance', params] as const,
  },
  reconciliations: {
    all: ['reconciliations'] as const,
    list: (filters: Record<string, unknown>) => ['reconciliations', 'list', filters] as const,
    detail: (id: string) => ['reconciliations', 'detail', id] as const,
    findings: (runId: string, filters: Record<string, unknown>) =>
      ['reconciliations', 'findings', runId, filters] as const,
    summary: (id: string) => ['reconciliations', 'summary', id] as const,
  },
  findings: {
    detail: (id: string) => ['findings', 'detail', id] as const,
  },
  rosters: {
    preview: (uploadId: string) => ['rosters', 'preview', uploadId] as const,
    versions: (filters: Record<string, unknown>) => ['rosters', 'versions', filters] as const,
    versionDetail: (id: string) => ['rosters', 'version', id] as const,
    compare: (baseId: string, targetId: string) =>
      ['rosters', 'compare', baseId, targetId] as const,
    impact: (id: string) => ['rosters', 'impact', id] as const,
    seal: (id: string) => ['rosters', 'seal', id] as const,
    chainHead: (institutionId: string, academicYear?: string) =>
      ['rosters', 'chainHead', institutionId, academicYear || '2024-25'] as const,
  },
  transfers: {
    all: ['transfers'] as const,
    list: (filters: Record<string, unknown>) => ['transfers', 'list', filters] as const,
    detail: (id: string) => ['transfers', 'detail', id] as const,
  },
  overlaps: {
    all: ['overlaps'] as const,
    list: (filters: Record<string, unknown>) => ['overlaps', 'list', filters] as const,
    detail: (id: string) => ['overlaps', 'detail', id] as const,
  },
  sampling: {
    runs: (filters: Record<string, unknown>) => ['sampling', 'runs', filters] as const,
    runDetail: (id: string) => ['sampling', 'run', id] as const,
    items: (runId: string, filters: Record<string, unknown>) =>
      ['sampling', 'items', runId, filters] as const,
    estimate: (runId: string) => ['sampling', 'estimate', runId] as const,
  },
  verifications: {
    all: ['verifications'] as const,
    list: (filters: Record<string, unknown>) => ['verifications', 'list', filters] as const,
    bySubject: (params: Record<string, unknown>) => ['verifications', 'bySubject', params] as const,
  },
  connectors: {
    status: ['connectors', 'status'] as const,
  },
  audit: {
    events: (filters: Record<string, unknown>) => ['audit', 'events', filters] as const,
  },
  lifecycle: {
    timeline: (tokenId: string) => ['lifecycle', 'timeline', tokenId] as const,
  },
};
