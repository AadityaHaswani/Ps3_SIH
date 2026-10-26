import { apiClient } from '../client';
import { normalizePaginatedResponse } from '../adapters';
import type {
  SeatBalance,
  SeatLedgerEntry,
  MassBalanceResult,
  LedgerIntegrityReport,
  OccupancyRule,
} from '../../types/models';
import type { NormalizedPaginatedResult } from '../../types/api';

export interface SeatBalanceFilters {
  institutionId?: string;
  programmeCode?: string;
  academicYear?: string;
  seatCategory?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface DeclareIntakePayload {
  institutionId?: string;
  programmeCode: string;
  academicYear: string;
  seatCategory?: string;
  declaredIntake: number;
  idempotencyKey?: string;
}

export interface UpdateApprovedIntakePayload {
  institutionId: string;
  programmeCode: string;
  academicYear: string;
  seatCategory?: string;
  approvedIntake: number;
  sourceRef?: string;
  verificationStatus?: string;
  sourceMode?: 'SIMULATED' | 'LIVE';
  idempotencyKey?: string;
}

export interface MassBalanceParams {
  institutionId: string;
  programmeCode: string;
  academicYear: string;
  previousAcademicYear?: string;
  entrants?: number;
  exits?: number;
  retentionRate?: number;
}

export interface VerifyIntegrityPayload {
  institutionId?: string;
  academicYear?: string;
  programmeCode?: string;
}

export interface SeatBalanceHistoryPoint {
  snapshotDate: string;
  occupancy: number;
  approvedIntake: number;
  headroom: number | null;
  utilisationPct: number | null;
  trigger?: string;
  status?: string;
}

export const ledgerApi = {
  getBalances: async (filters: SeatBalanceFilters = {}): Promise<NormalizedPaginatedResult<SeatBalance>> => {
    const res = await apiClient.get('/seat-ledger/balances', { params: filters });
    return normalizePaginatedResponse<SeatBalance>(res.data);
  },

  getBalanceDetail: async (id: string): Promise<SeatBalance> => {
    const res = await apiClient.get(`/seat-ledger/balances/${id}`);
    return res.data.data;
  },

  getBalanceEntries: async (
    id: string,
    page = 1,
    limit = 25
  ): Promise<NormalizedPaginatedResult<SeatLedgerEntry>> => {
    const res = await apiClient.get(`/seat-ledger/balances/${id}/entries`, {
      params: { page, limit },
    });
    return normalizePaginatedResponse<SeatLedgerEntry>(res.data);
  },

  getBalanceHistory: async (
    bucketKey: string,
    institutionId?: string,
    from?: string,
    to?: string
  ): Promise<SeatBalanceHistoryPoint[]> => {
    const res = await apiClient.get('/seat-ledger/history', {
      params: { bucketKey, institutionId, from, to },
    });
    return res.data.data?.history || [];
  },

  declareIntake: async (
    payload: DeclareIntakePayload
  ): Promise<{ bucket: SeatBalance; isReplay: boolean }> => {
    const idempotencyKey = payload.idempotencyKey || `decl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const res = await apiClient.post('/seat-ledger/intake-declarations', payload, {
      headers: { 'idempotency-key': idempotencyKey },
    });
    return res.data.data;
  },

  updateApprovedIntake: async (
    payload: UpdateApprovedIntakePayload
  ): Promise<{ bucket: SeatBalance; isReplay: boolean }> => {
    const idempotencyKey = payload.idempotencyKey || `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const res = await apiClient.put('/seat-ledger/intake', payload, {
      headers: { 'idempotency-key': idempotencyKey },
    });
    return res.data.data;
  },

  verifyIntegrity: async (payload: VerifyIntegrityPayload = {}): Promise<LedgerIntegrityReport> => {
    const res = await apiClient.post('/seat-ledger/verify-integrity', payload);
    return res.data.data;
  },

  getMassBalance: async (params: MassBalanceParams): Promise<MassBalanceResult> => {
    const res = await apiClient.get('/seat-ledger/mass-balance', { params });
    return res.data.data;
  },

  getOccupancyRules: async (activeOnly = true): Promise<OccupancyRule[]> => {
    const res = await apiClient.get('/seat-ledger/rules', {
      params: { activeOnly: activeOnly ? 'true' : 'false' },
    });
    return res.data.data?.rules || [];
  },
};
