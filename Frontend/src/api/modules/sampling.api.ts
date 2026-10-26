import { apiClient } from '../client';
import { normalizePaginatedResponse } from '../adapters';
import type { SamplingRun, SamplingItem } from '../../types/models';
import type { NormalizedPaginatedResult } from '../../types/api';

export interface SamplingPreviewPayload {
  institutionId?: string;
  rosterVersionId: string;
  academicYear?: string;
  programmeCode?: string | null;
  seatCategory?: string | null;
  confidenceLevel?: number;
  marginOfError?: number;
  expectedProportion?: number;
  minSampleSize?: number;
  maxSampleSize?: number;
  riskTargetedCount?: number;
}

export interface SamplingSizePreview {
  populationSize: number;
  cochranInitialSize: number;
  finiteCorrectedSize: number;
  recommendedRandomSample: number;
  riskTargetedCount: number;
  totalSampleSize: number;
  confidenceLevel: number;
  marginOfError: number;
}

export interface CreateSamplingRunPayload {
  institutionId?: string;
  rosterVersionId: string;
  academicYear: string;
  programmeCode?: string | null;
  seatCategory?: string | null;
  samplingParameters?: {
    confidenceLevel?: number;
    marginOfError?: number;
    expectedProportion?: number;
  };
  riskTargetedCount?: number;
}

export interface SamplingRunFilters {
  status?: string;
  academicYear?: string;
  institutionId?: string;
  page?: number;
  limit?: number;
}

export interface SamplingItemFilters {
  verificationStatus?: string;
  stratum?: string;
  page?: number;
  limit?: number;
}

export interface RecordItemVerificationPayload {
  verificationStatus: 'VERIFIED_MATCH' | 'VERIFIED_DISCREPANCY' | 'UNABLE_TO_VERIFY' | 'EXCLUDED';
  verificationMethod?: string;
  evidenceRef?: string;
  notes?: string;
  exclusionReason?: string;
}

export interface WilsonEstimateResult {
  runId: string;
  status: string;
  sampleCount: number;
  verifiedCount: number;
  discrepancyCount: number;
  estimatedRate: number;
  wilsonInterval: {
    lowerBound: number;
    upperBound: number;
    confidenceLevel: number;
  };
  isStatisticallySound: boolean;
}

export const samplingApi = {
  previewSize: async (payload: SamplingPreviewPayload): Promise<SamplingSizePreview> => {
    const res = await apiClient.post('/sampling-runs/preview-size', payload);
    return res.data.data;
  },

  createRun: async (payload: CreateSamplingRunPayload): Promise<SamplingRun> => {
    const res = await apiClient.post('/sampling-runs', payload);
    return res.data.data;
  },

  listRuns: async (
    filters: SamplingRunFilters = {}
  ): Promise<NormalizedPaginatedResult<SamplingRun>> => {
    const res = await apiClient.get('/sampling-runs', { params: filters });
    return normalizePaginatedResponse<SamplingRun>(res.data);
  },

  getRunDetail: async (id: string): Promise<SamplingRun> => {
    const res = await apiClient.get(`/sampling-runs/${id}`);
    return res.data.data;
  },

  getItems: async (
    runId: string,
    filters: SamplingItemFilters = {}
  ): Promise<NormalizedPaginatedResult<SamplingItem>> => {
    const res = await apiClient.get(`/sampling-runs/${runId}/items`, { params: filters });
    return normalizePaginatedResponse<SamplingItem>(res.data);
  },

  recordResult: async (
    itemId: string,
    payload: RecordItemVerificationPayload
  ): Promise<SamplingItem> => {
    const res = await apiClient.patch(`/sampling-items/${itemId}/result`, payload);
    return res.data.data;
  },

  closeRun: async (runId: string, reason?: string): Promise<SamplingRun> => {
    const res = await apiClient.post(`/sampling-runs/${runId}/close`, { reason });
    return res.data.data;
  },

  getEstimate: async (runId: string): Promise<WilsonEstimateResult> => {
    const res = await apiClient.get(`/sampling-runs/${runId}/estimate`);
    return res.data.data;
  },
};
