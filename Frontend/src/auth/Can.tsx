import React from 'react';
import { usePermission } from './usePermission';

interface CanProps {
  permission: string | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Declarative RBAC gating component.
 * Renders children only if user possesses all requested permissions; otherwise renders fallback (or null).
 */
export const Can: React.FC<CanProps> = ({ permission, fallback = null, children }) => {
  const hasPermission = usePermission(permission);

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
