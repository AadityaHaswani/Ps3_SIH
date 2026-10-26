/**
 * Standard API Envelope and Error interfaces matching SIH 2026 PS3 conventions.
 */

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data: T;
  requestId?: string;
  meta?: {
    pagination?: PaginationMeta;
    [key: string]: unknown;
  };
  error?: ApiErrorPayload;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown> | Array<unknown>;
}

export interface NormalizedPaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
  rawMeta?: Record<string, unknown>;
}

export type StandardErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'TOKEN_REUSE_DETECTED'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_NOT_ACTIVATED'
  | 'ACCOUNT_LOCKED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INVALID_ACTIVATION_TOKEN'
  | 'ACTIVATION_TOKEN_EXPIRED'
  | 'INVALID_CHALLENGE'
  | 'CHALLENGE_ALREADY_USED'
  | 'OTP_EXPIRED'
  | 'INVALID_OTP'
  | 'OTP_MAX_ATTEMPTS_EXCEEDED'
  | 'CHALLENGE_ALREADY_CONSUMED'
  | 'ALREADY_ACTIVATED'
  | 'SOLE_ADMIN_PROTECTION'
  | 'INTERNAL_ERROR'
  | 'REQUEST_ERROR'
  | 'SERVICE_UNAVAILABLE';
