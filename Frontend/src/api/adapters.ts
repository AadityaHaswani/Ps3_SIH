import { ApiEnvelope, NormalizedPaginatedResult, PaginationMeta } from '@/types/api';

/**
 * Generates an RFC4122 compliant v4 UUID for Idempotency-Key and X-Request-Id headers.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates a client-traceable request ID prefixed with 'req_client_'.
 */
export function generateRequestId(): string {
  return `req_${generateUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Defensive pagination normalizer.
 * In the backend, list responses vary:
 * - Some return sendSuccess(res, result.items, 200, result.pagination) -> data: T[], meta: Pagination
 * - Some return sendSuccess(res, { items: T[], pagination }) -> data.items: T[], data.pagination
 * - Some return sendSuccess(res, { cases: T[] }, 200, pagination) -> data: T[], meta: Pagination
 * - Some return sendSuccess(res, { findings: T[], pagination })
 *
 * This adapter tolerates all variants and provides a uniform { items, pagination } shape.
 */
export function normalizePaginatedResponse<T>(
  envelope: ApiEnvelope<unknown> | unknown
): NormalizedPaginatedResult<T> {
  const env = envelope as ApiEnvelope<unknown>;
  const rawData = env?.data ?? envelope;
  const metaPagination = env?.meta?.pagination as PaginationMeta | undefined;

  let items: T[] = [];
  let pagination: PaginationMeta = {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  };

  if (Array.isArray(rawData)) {
    items = rawData as T[];
    if (metaPagination) {
      pagination = metaPagination;
    } else {
      pagination = {
        page: 1,
        limit: items.length || 25,
        total: items.length,
        totalPages: 1,
      };
    }
  } else if (rawData && typeof rawData === 'object') {
    const obj = rawData as Record<string, unknown>;

    // Locate items array
    if (Array.isArray(obj.items)) {
      items = obj.items as T[];
    } else if (Array.isArray(obj.findings)) {
      items = obj.findings as T[];
    } else if (Array.isArray(obj.cases)) {
      items = obj.cases as T[];
    } else if (Array.isArray(obj.runs)) {
      items = obj.runs as T[];
    } else if (Array.isArray(obj.balances)) {
      items = obj.balances as T[];
    } else if (Array.isArray(obj.events)) {
      items = obj.events as T[];
    }

    // Locate pagination meta
    const dataPagination = obj.pagination as PaginationMeta | undefined;
    if (dataPagination && typeof dataPagination.total === 'number') {
      pagination = dataPagination;
    } else if (metaPagination && typeof metaPagination.total === 'number') {
      pagination = metaPagination;
    } else {
      pagination = {
        page: 1,
        limit: items.length || 25,
        total: items.length,
        totalPages: 1,
      };
    }
  }

  return {
    items,
    pagination,
    rawMeta: env?.meta,
  };
}

/**
 * Maps standard backend error codes into friendly, non-punitive user guidance.
 */
export function mapErrorCodeToMessage(code: string | undefined, defaultMessage?: string): string {
  switch (code) {
    case 'ACCOUNT_LOCKED':
      return 'Account temporarily locked due to repeated sign-in attempts. Please wait 15 minutes before retrying.';
    case 'ACCOUNT_NOT_ACTIVATED':
      return 'This account is not activated yet. Please check your activation link or contact your platform administrator.';
    case 'ACCOUNT_DISABLED':
      return 'Account access is currently disabled. Please contact your authority administrator.';
    case 'INVALID_OTP':
      return 'The 6-digit verification code entered is incorrect. Please check the code and try again.';
    case 'OTP_EXPIRED':
      return 'The verification code has expired. Please request a new code.';
    case 'OTP_MAX_ATTEMPTS_EXCEEDED':
      return 'Maximum verification attempts exceeded. Please request a new code.';
    case 'RATE_LIMITED':
      return 'Request limit reached. Please pause for a moment before submitting again.';
    case 'FORBIDDEN':
      return 'You do not have permission to perform this action or access this institutional scope.';
    case 'UNAUTHENTICATED':
      return 'Your credentials could not be verified. Please verify your email and password.';
    case 'TOKEN_EXPIRED':
      return 'Your session has expired. Please sign in again to continue.';
    case 'SOLE_ADMIN_PROTECTION':
      return 'Cannot disable or reassign the sole active Platform Administrator on the system.';
    case 'VALIDATION_ERROR':
      return defaultMessage || 'The submitted data did not pass validation requirements.';
    default:
      return defaultMessage || 'An unexpected issue occurred while communicating with the server.';
  }
}
