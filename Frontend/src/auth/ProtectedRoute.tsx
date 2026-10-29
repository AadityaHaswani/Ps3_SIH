import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { usePermission } from './usePermission';
import { ShieldCheck } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string | string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
}) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const hasPermission = usePermission(requiredPermission || []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
            <ShieldCheck className="w-6 h-6 text-primary animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground tracking-wide">
            SeatSeal
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every Seat Is Seal &bull; Restoring secure cryptographic session...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermission && !hasPermission) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};
