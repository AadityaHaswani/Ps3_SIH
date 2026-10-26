import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { ActivateAccountPage } from '@/pages/auth/ActivateAccountPage';
import { ForbiddenPage } from '@/pages/errors/ForbiddenPage';
import { NotFoundPage } from '@/pages/errors/NotFoundPage';
import { ScorecardDashboardPage } from '@/pages/scorecard/ScorecardDashboardPage';
import { SeatLedgerPage } from '@/pages/ledger/SeatLedgerPage';
import { ReconciliationsPage } from '@/pages/reconciliation/ReconciliationsPage';
import { FindingsPage } from '@/pages/findings/FindingsPage';
import { RostersPage } from '@/pages/rosters/RostersPage';
import { TransfersPage } from '@/pages/transfers/TransfersPage';
import { OverlapsPage } from '@/pages/overlaps/OverlapsPage';
import { SamplingPage } from '@/pages/sampling/SamplingPage';
import { ConnectorsPage } from '@/pages/connectors/ConnectorsPage';
import { AuditLogPage } from '@/pages/audit/AuditLogPage';
import { UserManagementPage } from '@/pages/admin/UserManagementPage';
import { VerificationsPage } from '@/pages/verifications/VerificationsPage';

export const router = createBrowserRouter([
  // Public Routes
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/activate-account',
    element: <ActivateAccountPage />,
  },
  {
    path: '/403',
    element: <ForbiddenPage />,
  },

  // Protected App Shell Routes
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/scorecard" replace />,
      },
      {
        path: 'scorecard',
        element: (
          <ProtectedRoute requiredPermission="scorecards:read">
            <ScorecardDashboardPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'seat-ledger',
        element: (
          <ProtectedRoute requiredPermission="seat-ledger:read">
            <SeatLedgerPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'reconciliations',
        element: (
          <ProtectedRoute requiredPermission="reconciliation:read">
            <ReconciliationsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'findings',
        element: (
          <ProtectedRoute requiredPermission="reconciliation:read">
            <FindingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'rosters',
        element: (
          <ProtectedRoute requiredPermission={['roster-versions:read']}>
            <RostersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'transfers',
        element: (
          <ProtectedRoute requiredPermission="transfers:read">
            <TransfersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'overlaps',
        element: (
          <ProtectedRoute requiredPermission="overlap:read">
            <OverlapsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'sampling',
        element: (
          <ProtectedRoute requiredPermission="sampling:read">
            <SamplingPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'verifications',
        element: (
          <ProtectedRoute requiredPermission="verification:read">
            <VerificationsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'connectors',
        element: (
          <ProtectedRoute requiredPermission="connectors:read">
            <ConnectorsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'audit',
        element: (
          <ProtectedRoute requiredPermission="audit:read">
            <AuditLogPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/users',
        element: (
          <ProtectedRoute requiredPermission="users:read">
            <UserManagementPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
