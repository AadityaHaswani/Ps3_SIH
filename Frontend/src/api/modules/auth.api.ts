import { apiClient, tokenStore, refreshAccessToken } from '../client';
import { ApiEnvelope } from '@/types/api';
import { User } from '@/types/models';

export interface LoginResponseData {
  mfaRequired: boolean;
  challengeId: string;
  expiresAt: string;
  maskedEmail: string;
  devOtp?: string;
}

export interface VerifyOtpResponseData {
  user: User;
  accessToken: string;
  permissions: string[];
}

export interface ResendOtpResponseData {
  challengeId: string;
  expiresAt: string;
  maskedEmail: string;
  devOtp?: string;
}

export interface ActivateAccountPayload {
  token: string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const authApi = {
  // Step A: Submit credentials and receive MFA challenge
  login: async (email: string, password: string): Promise<LoginResponseData> => {
    const res = await apiClient.post<ApiEnvelope<LoginResponseData>>('/auth/login', {
      email,
      password,
    });
    return res.data.data;
  },

  // Step B: Submit OTP challenge and receive user profile + in-memory accessToken
  verifyLoginOtp: async (challengeId: string, otp: string): Promise<VerifyOtpResponseData> => {
    const res = await apiClient.post<ApiEnvelope<VerifyOtpResponseData>>('/auth/verify-login-otp', {
      challengeId,
      otp,
    });
    const { accessToken } = res.data.data;
    tokenStore.set(accessToken);
    return res.data.data;
  },

  // Resend OTP for the active challenge
  resendLoginOtp: async (challengeId: string): Promise<ResendOtpResponseData> => {
    const res = await apiClient.post<ApiEnvelope<ResendOtpResponseData>>('/auth/resend-login-otp', {
      challengeId,
    });
    return res.data.data;
  },

  // Activate pending account using URL token
  activateAccount: async (payload: ActivateAccountPayload) => {
    const res = await apiClient.post<ApiEnvelope<{ message: string; user: User }>>(
      '/auth/activate-account',
      payload
    );
    return res.data.data;
  },

  // Explicit session restoration on boot
  refreshSession: async (): Promise<string> => {
    return refreshAccessToken();
  },

  // Fetch current session profile and permissions
  getMe: async (): Promise<{ user: User; permissions: string[] }> => {
    const res = await apiClient.get<ApiEnvelope<{ user: User; permissions: string[] }>>('/auth/me');
    return res.data.data;
  },

  // Invalidate refresh token and clear in-memory state
  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      tokenStore.clear();
    }
  },

  // Change current password (invalidates tokenVersion)
  changePassword: async (payload: ChangePasswordPayload): Promise<{ message: string }> => {
    const res = await apiClient.post<ApiEnvelope<{ message: string }>>(
      '/auth/change-password',
      payload
    );
    tokenStore.clear();
    return res.data.data;
  },
};
