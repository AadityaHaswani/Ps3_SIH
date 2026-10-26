import { apiClient } from '../client';
import { normalizePaginatedResponse } from '../adapters';
import type { ConnectorStatus, AuditEvent, User, VerificationRecord } from '../../types/models';
import type { NormalizedPaginatedResult } from '../../types/api';

export interface AuditFilters {
  action?: string;
  entityType?: string;
  entityId?: string;
  institutionId?: string;
  page?: number;
  limit?: number;
}

export interface UserFilters {
  role?: string;
  institutionId?: string;
  isActive?: boolean | string;
  page?: number;
  limit?: number;
}

export interface CreateUserPayload {
  email: string;
  name: string;
  role: string;
  password?: string;
  institutionId?: string;
  assignedInstitutionIds?: string[];
}

export interface UpdateUserPayload {
  name?: string;
  role?: string;
  institutionId?: string | null;
  assignedInstitutionIds?: string[];
  isActive?: boolean;
}

export interface VerificationFilters {
  subjectType?: string;
  subjectId?: string;
  fieldPath?: string;
  label?: string;
  sourceMode?: string;
  status?: string;
  institutionId?: string;
  page?: number;
  limit?: number;
}

export interface RequestVerificationPayload {
  subjectType: string;
  subjectId: string;
  fieldPath?: string;
  connectorId?: string;
  value: unknown;
  institutionId: string;
  context?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ReviewVerificationPayload {
  action: 'CONFIRM' | 'REJECT' | 'CONFLICT';
  notes?: string;
  evidenceRef?: string;
  sourceMode?: string;
  method?: string;
}

export interface ConnectorsResponse {
  connectors: ConnectorStatus[];
  timestamp: string;
}

export const systemApi = {
  // Connectors
  async getConnectorsStatus(): Promise<ConnectorsResponse> {
    const response = await apiClient.get('/connectors/status');
    const data = response.data?.data;
    if (Array.isArray(data)) {
      return { connectors: data, timestamp: new Date().toISOString() };
    }
    if (data?.connectors && Array.isArray(data.connectors)) {
      return {
        connectors: data.connectors,
        timestamp: data.timestamp || new Date().toISOString(),
      };
    }
    return { connectors: [], timestamp: new Date().toISOString() };
  },

  // Audit Events
  async getAuditEvents(filters: AuditFilters = {}): Promise<NormalizedPaginatedResult<AuditEvent>> {
    const response = await apiClient.get('/audit/events', { params: filters });
    return normalizePaginatedResponse<AuditEvent>(response.data);
  },

  // Platform Users
  async listUsers(filters: UserFilters = {}): Promise<NormalizedPaginatedResult<User>> {
    const response = await apiClient.get('/users', { params: filters });
    return normalizePaginatedResponse<User>(response.data);
  },

  async createUser(payload: CreateUserPayload): Promise<User> {
    const response = await apiClient.post('/users', payload);
    return response.data.data;
  },

  async resendActivation(id: string): Promise<{ message: string }> {
    const response = await apiClient.post(`/users/${id}/resend-activation`);
    return response.data.data;
  },

  async updateUser(id: string, payload: UpdateUserPayload): Promise<User> {
    const response = await apiClient.patch(`/users/${id}`, payload);
    return response.data.data;
  },

  // Field & Intake Verifications
  async listVerifications(
    filters: VerificationFilters = {}
  ): Promise<NormalizedPaginatedResult<VerificationRecord>> {
    const response = await apiClient.get('/verifications', { params: filters });
    return normalizePaginatedResponse<VerificationRecord>(response.data);
  },

  async getSubjectVerifications(params: {
    subjectType: string;
    subjectId: string;
    fieldPath?: string;
    currentValue?: unknown;
    requiredSourceVersion?: string;
  }): Promise<unknown> {
    const response = await apiClient.get('/verifications/by-subject', { params });
    return response.data.data;
  },

  async requestVerification(payload: RequestVerificationPayload): Promise<VerificationRecord> {
    const response = await apiClient.post('/verifications/request', payload, {
      headers: payload.idempotencyKey
        ? { 'idempotency-key': payload.idempotencyKey }
        : undefined,
    });
    return response.data.data;
  },

  async reviewVerification(
    id: string,
    payload: ReviewVerificationPayload
  ): Promise<VerificationRecord> {
    const response = await apiClient.patch(`/verifications/${id}/review`, payload);
    return response.data.data;
  },
};
