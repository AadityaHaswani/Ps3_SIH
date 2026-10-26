import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { systemApi, type AuditFilters } from '@/api/modules/system.api';
import { queryKeys } from '@/api/queryKeys';
import {
  History,
  Search,
  Filter,
  ShieldCheck,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Database,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { format } from 'date-fns';
import { AuditDetailDrawer } from './AuditDetailDrawer';
import type { AuditEvent } from '@/types/models';

const ACTION_OPTIONS = [
  'ALL',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ACTIVATION_RESENT',
  'INTAKE_DECLARED',
  'INTAKE_APPROVED',
  'ROSTER_COMMITTED',
  'TRANSFER_CONFIRMED',
  'VERIFICATION_REQUESTED',
  'VERIFICATION_REVIEWED',
];

const ENTITY_OPTIONS = [
  'ALL',
  'User',
  'RosterVersion',
  'SeatLedgerEntry',
  'TransferCase',
  'OverlapCase',
  'SamplingRun',
  'VerificationRecord',
];

export const AuditLogPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('ALL');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [institutionIdInput, setInstitutionIdInput] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const activeFilters: AuditFilters = {
    page,
    limit: 20,
    ...(actionFilter !== 'ALL' ? { action: actionFilter } : {}),
    ...(entityFilter !== 'ALL' ? { entityType: entityFilter } : {}),
    ...(institutionIdInput.trim() ? { institutionId: institutionIdInput.trim() } : {}),
  };

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: queryKeys.audit.events(activeFilters as Record<string, unknown>),
    queryFn: () => systemApi.getAuditEvents(activeFilters),
  });

  const events = data?.items || [];
  const pagination = data?.pagination;

  const getActionBadgeVariant = (action: string) => {
    if (action.includes('CREATED') || action.includes('APPROVED')) return 'success';
    if (action.includes('UPDATED') || action.includes('REVIEWED')) return 'default';
    if (action.includes('TRANSFER')) return 'warning';
    return 'outline';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <History className="w-6 h-6 text-primary" />
            Security & Operational Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tamper-evident append-only ledger capturing all administrative, ledger, and student lifecycle events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isRefetching ? 'animate-spin' : ''}`} />
            Refresh Trail
          </Button>
        </div>
      </div>

      {/* Assurance Notice */}
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 text-xs text-foreground flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-primary block">Zero-Secret Audit Policy</span>
            <span className="text-muted-foreground">
              Passphrases, session secrets, and unhashed student identifiers are scrubbed before storage. Events are strictly immutable.
            </span>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 text-success border-success/30 bg-success/5">
          Append-Only Validated
        </Badge>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5" />
          Audit Query Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Action Type
            </label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Entity Type
            </label>
            <select
              value={entityFilter}
              onChange={(e) => {
                setEntityFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Institution ID
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by institution..."
                value={institutionIdInput}
                onChange={(e) => {
                  setInstitutionIdInput(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Institution Context</th>
                <th className="py-3 px-4 text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Fetching audit event stream...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <Database className="w-8 h-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                    <p className="font-medium text-foreground">No audit events match current filters</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Try clearing or adjusting the action and entity filters.
                    </p>
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr
                    key={evt._id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => setSelectedEvent(evt)}
                  >
                    <td className="py-3 px-4 text-foreground whitespace-nowrap font-mono text-[11px]">
                      {format(new Date(evt.createdAt), 'MMM d, HH:mm:ss')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Badge variant={getActionBadgeVariant(evt.action)} size="sm">
                        {evt.action}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-foreground">
                        {evt.entityType || '—'}
                      </span>
                      {evt.entityId && (
                        <span className="font-mono text-[10px] text-muted-foreground block truncate max-w-[120px]">
                          {evt.entityId}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="text-foreground font-medium block">
                        {evt.performedBy?.email || 'System Agent'}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {evt.performedBy?.role || 'SYSTEM'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-muted-foreground">
                      {evt.institutionId || (
                        <span className="text-[10px] text-muted-foreground italic">Platform</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(evt);
                        }}
                        className="h-7 text-xs gap-1 group-hover:text-primary"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-muted/20">
            <span>
              Showing {events.length} of {pagination.total} events (Page {pagination.page} of{' '}
              {pagination.totalPages})
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="h-7 text-xs gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Inspector Drawer */}
      <AuditDetailDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
};
