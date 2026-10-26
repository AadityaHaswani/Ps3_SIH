import { apiClient } from '../client';
import { normalizePaginatedResponse } from '../adapters';
import type {
  ReconciliationRun,
  ReconciliationFinding,
  ReconciliationSummaryData,
} from '../../types/models';
import type { NormalizedPaginatedResult } from '../../types/api';

export interface ReconciliationRunFilters {
  institutionId?: string;
  academicYear?: string;
  page?: number;
  limit?: number;
}

export interface CreateReconciliationPayload {
  institutionId?: string;
  academicYear: string;
  rosterVersionId: string;
  sources?: string[];
  programmeCodes?: string[];
  simulationToggles?: Record<string, boolean>;
  idempotencyKey?: string;
}

export interface FindingFilters {
  page?: number;
  limit?: number;
  type?: string;
  severity?: string;
  reviewStatus?: string;
}

export interface ReviewFindingPayload {
  action: 'CONFIRM' | 'DISMISS' | 'REQUEST_CLARIFICATION' | 'RESOLVE';
  reason?: string;
  note?: string;
}

export const reconciliationApi = {
  listRuns: async (
    filters: ReconciliationRunFilters = {}
  ): Promise<NormalizedPaginatedResult<ReconciliationRun>> => {
    const res = await apiClient.get('/reconciliations', { params: filters });
    return normalizePaginatedResponse<ReconciliationRun>(res.data);
  },

  getRun: async (id: string): Promise<ReconciliationRun> => {
    const res = await apiClient.get(`/reconciliations/${id}`);
    return res.data.data;
  },

  createRun: async (
    payload: CreateReconciliationPayload
  ): Promise<{ run: ReconciliationRun; isReplay: boolean }> => {
    const idempotencyKey =
      payload.idempotencyKey || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const res = await apiClient.post('/reconciliations', payload, {
      headers: { 'idempotency-key': idempotencyKey },
    });
    return {
      run: res.data.data,
      isReplay: Boolean(res.data.meta?.isReplay),
    };
  },

  getFindings: async (
    runIdOrId: string,
    filters: FindingFilters = {}
  ): Promise<NormalizedPaginatedResult<ReconciliationFinding>> => {
    const res = await apiClient.get(`/reconciliations/${runIdOrId}/findings`, {
      params: filters,
    });
    return normalizePaginatedResponse<ReconciliationFinding>(res.data);
  },

  getSummary: async (id: string): Promise<ReconciliationSummaryData> => {
    const res = await apiClient.get(`/reconciliations/${id}/summary`);
    return res.data.data;
  },

  getFinding: async (id: string): Promise<ReconciliationFinding> => {
    const res = await apiClient.get(`/findings/${id}`);
    return res.data.data;
  },

  reviewFinding: async (
    id: string,
    payload: ReviewFindingPayload
  ): Promise<ReconciliationFinding> => {
    const res = await apiClient.patch(`/findings/${id}/review`, payload);
    return res.data.data;
  },
};
