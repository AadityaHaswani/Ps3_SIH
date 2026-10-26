import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { generateRequestId } from './adapters';
import { ApiEnvelope } from '@/types/api';

// In-Memory Token Storage (Strictly NOT in localStorage/sessionStorage)
let memoryAccessToken: string | null = null;
let refreshTimerId: ReturnType<typeof setTimeout> | null = null;
let onAuthSessionExpired: (() => void) | null = null;

export const tokenStore = {
  get: () => memoryAccessToken,
  set: (token: string | null) => {
    memoryAccessToken = token;
    scheduleProactiveRefresh(token);
  },
  clear: () => {
    memoryAccessToken = null;
    if (refreshTimerId) {
      clearTimeout(refreshTimerId);
      refreshTimerId = null;
    }
  },
  setSessionExpiredHandler: (handler: () => void) => {
    onAuthSessionExpired = handler;
  },
};

/**
 * Parses JWT exp payload without external heavy libraries
 */
function parseJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Proactively refreshes the token ~60 seconds before expiration
 */
function scheduleProactiveRefresh(token: string | null) {
  if (refreshTimerId) {
    clearTimeout(refreshTimerId);
    refreshTimerId = null;
  }

  if (!token) return;

  const expTimeMs = parseJwtExp(token);
  if (!expTimeMs) return;

  // Refresh 60 seconds early, but never negative or zero
  const delayMs = Math.max(10000, expTimeMs - Date.now() - 60000);

  refreshTimerId = setTimeout(async () => {
    try {
      await refreshAccessToken();
    } catch {
      // If proactive refresh fails, the 401 response interceptor will act as fallback
    }
  }, delayMs);
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Sends and receives httpOnly refreshToken cookie
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Authorization header and dynamic X-Request-Id to every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!config.headers['X-Request-Id']) {
    config.headers['X-Request-Id'] = generateRequestId();
  }

  const token = tokenStore.get();
  if (token && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  return config;
});

// Single-flight refresh queue state
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Calls POST /api/v1/auth/refresh to rotate refreshToken cookie and get a new access token
 */
export async function refreshAccessToken(): Promise<string> {
  const response = await axios.post<ApiEnvelope<{ accessToken: string }>>(
    `${API_BASE_URL}/auth/refresh`,
    {},
    {
      withCredentials: true,
      headers: {
        'X-Request-Id': generateRequestId(),
      },
    }
  );

  const newAccessToken = response.data.data.accessToken;
  tokenStore.set(newAccessToken);
  return newAccessToken;
}

// Response interceptor to catch 401 TOKEN_EXPIRED and seamlessly retry
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiEnvelope>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Avoid infinite loops on auth endpoints or already-retried requests
    if (
      !originalRequest ||
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/verify-login-otp') ||
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    const errorCode = error.response?.data?.error?.code;
    const isTokenExpired = error.response?.status === 401 && (errorCode === 'TOKEN_EXPIRED' || errorCode === 'UNAUTHENTICATED');

    if (isTokenExpired) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newAccessToken = await refreshAccessToken();
        processQueue(null, newAccessToken);
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr as Error, null);
        tokenStore.clear();
        if (onAuthSessionExpired) {
          onAuthSessionExpired();
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
