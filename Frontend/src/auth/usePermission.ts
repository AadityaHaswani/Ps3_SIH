import { useAuth } from './useAuth';
import { Role } from '@/types/enums';

/**
 * Custom hook to check whether the current authenticated user has specific granular permissions.
 */
export function usePermission(permission: string | string[]): boolean {
  const { permissions, user } = useAuth();

  if (!user) return false;

  const required = Array.isArray(permission) ? permission : [permission];

  return required.every((p) => permissions.includes(p));
}

/**
 * Checks if user has ANY of the provided permissions.
 */
export function useAnyPermission(permissionList: string[]): boolean {
  const { permissions, user } = useAuth();
  if (!user || !permissionList.length) return false;
  return permissionList.some((p) => permissions.includes(p));
}

/**
 * Helper to identify if user has read-only auditor oversight mode.
 */
export function useIsAuditor(): boolean {
  const { user } = useAuth();
  return user?.role === Role.AUDITOR;
}
