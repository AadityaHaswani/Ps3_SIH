import { apiClient } from '../client';
import { normalizePaginatedResponse } from '../adapters';
import type { TransferCase, OverlapCase } from '../../types/models';
import type { NormalizedPaginatedResult } from '../../types/api';

export interface TransferFilters {
  status?: string;
  academicYear?: string;
  programmeCode?: string;
  institutionId?: string;
  page?: number;
  limit?: number;
}

export interface CreateTransferPayload {
  studentTokenId?: string;
  studentRef?: string;
  sendingInstitutionId: string;
  sendingProgrammeCode: string;
  receivingInstitutionId: string;
  receivingProgrammeCode: string;
  academicYear: string;
  seatCategory?: string;
  effectiveDate?: string;
  idempotencyKey?: string;
}

export interface OverlapFilters {
  status?: string;
  severity?: string;
  caseType?: string;
  institutionId?: string;
  page?: number;
  limit?: number;
}

export interface ResolveOverlapPayload {
  code:
    | 'LEGITIMATE_TRANSFER'
    | 'DATA_ENTRY_ERROR_CORRECTED'
    | 'PERMITTED_PARALLEL'
    | 'REFERRED_FOR_POLICY_REVIEW'
    | 'NO_ACTION';
  notes: string;
}

export interface StudentLifecycleEventItem {
  _id: string;
  eventType: string;
  effectiveDate: string;
  reportedAt: string;
  institutionId: string;
  programmeCode: string;
  academicYear: string;
  seatCategory?: string;
  status: 'VALID' | 'SUPERSEDED' | 'REVERSED';
  isCorrection?: boolean;
}

export const transferApi = {
  listTransfers: async (
    filters: TransferFilters = {}
  ): Promise<NormalizedPaginatedResult<TransferCase>> => {
    const res = await apiClient.get('/transfers', { params: filters });
    return normalizePaginatedResponse<TransferCase>(res.data);
  },

  getTransfer: async (id: string): Promise<TransferCase> => {
    const res = await apiClient.get(`/transfers/${id}`);
    return res.data.data;
  },

  createTransfer: async (
    payload: CreateTransferPayload
  ): Promise<{ transferCase: TransferCase; isReplay: boolean }> => {
    const key =
      payload.idempotencyKey || `xfer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const res = await apiClient.post('/transfers', payload, {
      headers: { 'idempotency-key': key },
    });
    return {
      transferCase: res.data.data,
      isReplay: Boolean(res.data.meta?.isReplay),
    };
  },

  confirmTransfer: async (
    id: string,
    payload: { notes?: string } = {}
  ): Promise<TransferCase> => {
    const res = await apiClient.patch(`/transfers/${id}/confirm`, payload);
    return res.data.data;
  },

  rejectTransfer: async (
    id: string,
    payload: { reason?: string; notes?: string } = {}
  ): Promise<TransferCase> => {
    const res = await apiClient.patch(`/transfers/${id}/reject`, payload);
    return res.data.data;
  },

  processTimeouts: async (): Promise<{ processedCount: number; timedOutCount: number }> => {
    const res = await apiClient.post('/transfers/process-timeouts');
    return res.data.data;
  },

  listOverlapCases: async (
    filters: OverlapFilters = {}
  ): Promise<NormalizedPaginatedResult<OverlapCase>> => {
    const res = await apiClient.get('/overlap-cases', { params: filters });
    return normalizePaginatedResponse<OverlapCase>(res.data);
  },

  getOverlapCase: async (id: string): Promise<OverlapCase> => {
    const res = await apiClient.get(`/overlap-cases/${id}`);
    return res.data.data;
  },

  resolveOverlapCase: async (
    id: string,
    payload: ResolveOverlapPayload
  ): Promise<OverlapCase> => {
    const res = await apiClient.patch(`/overlap-cases/${id}/resolve`, payload);
    return res.data.data;
  },

  getStudentTimeline: async (tokenId: string): Promise<StudentLifecycleEventItem[]> => {
    const res = await apiClient.get(`/lifecycle/students/${tokenId}/events`);
    return res.data.data?.events || res.data.data || [];
  },
};
