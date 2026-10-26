import { apiClient } from '../client';
import { normalizePaginatedResponse } from '../adapters';
import type { RosterVersion, RosterUpload } from '../../types/models';
import type { NormalizedPaginatedResult } from '../../types/api';

export interface RosterVersionFilters {
  institutionId?: string;
  academicYear?: string;
  page?: number;
  limit?: number;
}

export interface VersionCompareResult {
  baseVersion: RosterVersion;
  targetVersion: RosterVersion;
  diffSummary: {
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    unchangedCount: number;
  };
  rows: Array<{
    action: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';
    rowKey: string;
    studentNameMasked: string;
    apaarTokenMasked: string;
    programmeCode: string;
    diffs?: Record<string, { base: unknown; target: unknown }>;
  }>;
}

export interface ImpactAssessment {
  rosterVersionId: string;
  affectedReconciliations: number;
  affectedScorecards: number;
  affectedBalances: number;
  requiresRevalidation: boolean;
  revalidationStatus: string;
}

export interface SealVerificationResult {
  valid: boolean;
  algorithm: string;
  merkleRoot: string;
  computedRoot: string;
  signatureValid: boolean;
  tamperDetected: boolean;
  verifiedAt: string;
  auditorId?: string;
}

export const rosterApi = {
  listVersions: async (
    filters: RosterVersionFilters = {}
  ): Promise<NormalizedPaginatedResult<RosterVersion>> => {
    const res = await apiClient.get('/roster-versions', { params: filters });
    return normalizePaginatedResponse<RosterVersion>(res.data);
  },

  getVersion: async (id: string): Promise<RosterVersion> => {
    const res = await apiClient.get(`/roster-versions/${id}`);
    return res.data.data;
  },

  getChainHead: async (institutionId: string, academicYear?: string): Promise<RosterVersion | null> => {
    const res = await apiClient.get('/roster-versions/chain-head', {
      params: { institutionId, academicYear },
    });
    return res.data.data?.chainHead || res.data.data || null;
  },

  compareVersions: async (id: string, compareWithId?: string): Promise<VersionCompareResult> => {
    const res = await apiClient.get(`/roster-versions/${id}/compare`, {
      params: { compareWith: compareWithId },
    });
    return res.data.data;
  },

  getImpact: async (id: string): Promise<ImpactAssessment> => {
    const res = await apiClient.get(`/roster-versions/${id}/impact`);
    return res.data.data;
  },

  getSeal: async (id: string): Promise<any> => {
    const res = await apiClient.get(`/roster-versions/${id}/seal`);
    return res.data.data;
  },

  getReceipt: async (id: string): Promise<any> => {
    const res = await apiClient.get(`/roster-versions/${id}/receipt`);
    return res.data.data;
  },

  verifySeal: async (id: string): Promise<SealVerificationResult> => {
    const res = await apiClient.post(`/roster-versions/${id}/verify-seal`);
    return res.data.data;
  },

  revalidateOutput: async (id: string): Promise<any> => {
    const res = await apiClient.post(`/roster-versions/${id}/revalidate`);
    return res.data.data;
  },

  uploadCsv: async (file: File, academicYear: string, institutionId?: string): Promise<RosterUpload> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('academicYear', academicYear);
    if (institutionId) formData.append('institutionId', institutionId);

    const res = await apiClient.post('/rosters/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  getPreview: async (uploadId: string): Promise<any> => {
    const res = await apiClient.get(`/rosters/${uploadId}/preview`);
    return res.data.data;
  },

  commitUpload: async (uploadId: string, idempotencyKey?: string): Promise<RosterVersion> => {
    const key = idempotencyKey || `commit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const res = await apiClient.post(
      `/rosters/${uploadId}/commit`,
      {},
      { headers: { 'idempotency-key': key } }
    );
    return res.data.data;
  },
};
