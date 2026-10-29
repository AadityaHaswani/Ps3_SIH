import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { usePermission } from '../../auth/usePermission';
import { useInstitutions } from '../../hooks/useInstitutions';
import { transferApi } from '../../api/modules/transfer.api';
import { queryKeys } from '../../api/queryKeys';
import type { OverlapCase } from '../../types/models';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { StudentTimelineDrawer } from './components/StudentTimelineDrawer';
import { ResolveOverlapModal } from './components/ResolveOverlapModal';
import {
  Users,
  Info,
  Clock,
  ShieldCheck,
  History,
  RefreshCw,
  AlertTriangle,
  Building2,
} from 'lucide-react';

export const OverlapsPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedInstitutionId } = useInstitutions();
  const institutionId = user?.institutionId ? String(user.institutionId) : (selectedInstitutionId || 'SIT-DEMO-01');

  // Overlap resolution permission
  const canResolve =
    user?.role === 'PLATFORM_ADMIN' ||
    user?.role === 'AUTHORITY_ADMIN' ||
    user?.role === 'AUTHORITY_OFFICER';

  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [page, setPage] = useState(1);

  // Modals state
  const [selectedCaseForTimeline, setSelectedCaseForTimeline] = useState<OverlapCase | null>(null);
  const [selectedCaseForResolve, setSelectedCaseForResolve] = useState<OverlapCase | null>(null);

  const {
    data: overlapsData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.overlaps.list({
      institutionId,
      status: statusFilter || undefined,
      severity: severityFilter || undefined,
      page,
      limit: 20,
    }),
    queryFn: () =>
      transferApi.listOverlapCases({
        institutionId,
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        page,
        limit: 20,
      }),
  });

  const cases = overlapsData?.items || [];
  const pagination = overlapsData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RESOLVED':
        return (
          <Badge variant="verified" size="sm" className="gap-1">
            <ShieldCheck className="w-3 h-3" /> Resolved
          </Badge>
        );
      case 'IN_REVIEW':
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <Clock className="w-3 h-3" /> In Review
          </Badge>
        );
      case 'OPEN':
      default:
        return (
          <Badge variant="outline" size="sm" className="text-amber-400 border-amber-500/30">
            Open
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Users className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-100">Cross-Institution Dual Enrolment Overlaps</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Neutral observational register identifying concurrent active enrolments for the same student identifier across multiple higher education institutions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Mandatory Verbatim AICTE Neutral Explanation Disclaimer Banner */}
      <Card className="p-4 bg-slate-900/80 border-slate-700/80 rounded-xl flex items-start gap-3.5">
        <Info className="w-5 h-5 text-teal-400 mt-0.5 shrink-0" />
        <div className="space-y-1 text-xs">
          <span className="font-bold text-slate-200 uppercase tracking-wider block text-[11px]">
            Statutory AICTE Enrolment Guidance (Verbatim)
          </span>
          <p className="text-slate-300 leading-relaxed font-normal">
            &quot;Overlap may be legitimate (e.g., permitted arrangements, pending paperwork). Applicable policy must be verified.&quot;
          </p>
          <p className="text-[11px] text-slate-400 pt-0.5">
            Observations in this queue highlight administrative alignment opportunities. They do not imply irregular conduct.
          </p>
        </div>
      </Card>

      {/* Filter Bar */}
      <Card className="p-3 bg-slate-900/60 border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Case Statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
          </div>

          <div className="w-40">
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Severities</option>
              <option value="INFO">INFO</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
            </select>
          </div>

          {(statusFilter || severityFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('');
                setSeverityFilter('');
                setPage(1);
              }}
              className="text-xs text-slate-400"
            >
              Clear Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Overlaps Table */}
      {isLoading && (
        <div className="py-14 text-center text-xs text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40">
          Scanning cross-institution enrolment intervals...
        </div>
      )}

      {!isLoading && cases.length === 0 && (
        <div className="p-10 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/40 space-y-2">
          <p className="text-sm font-semibold text-slate-300">No enrolment overlap cases detected.</p>
          <p className="text-xs text-slate-500">
            All active enrolment intervals across participating institutions are non-overlapping.
          </p>
        </div>
      )}

      {!isLoading && cases.length > 0 && (
        <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/50 shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
              <tr>
                <th className="p-3">Case ID</th>
                <th className="p-3">Student Ref</th>
                <th className="p-3">Institutions Involved</th>
                <th className="p-3 text-right">Overlap Duration</th>
                <th className="p-3">Severity</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {cases.map((c) => (
                <tr key={c.caseId || c._id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 font-mono font-semibold text-amber-300 text-xs">
                    {c.caseId}
                  </td>

                  <td className="p-3 font-mono text-[11px] text-slate-200">
                    {c.studentRef || c.studentTokenId || 'STU-CONCURRENT'}
                  </td>

                  <td className="p-3">
                    <div className="space-y-1">
                      {c.institutions?.map((inst: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                          <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="font-mono text-slate-200">
                            {inst.institutionId?.name || inst.institutionId || 'Inst'}
                          </span>
                          <span className="text-slate-500 font-mono">({inst.programmeCode})</span>
                        </div>
                      ))}
                    </div>
                  </td>

                  <td className="p-3 text-right font-mono font-semibold text-slate-100">
                    {(c.overlapInterval?.overlapDays ?? c.overlapDays)
                      ? `${c.overlapInterval?.overlapDays ?? c.overlapDays} days`
                      : 'Concurrent'}
                  </td>

                  <td className="p-3">
                    <Badge variant="outline" size="sm" className="font-mono">
                      {c.severity}
                    </Badge>
                  </td>

                  <td className="p-3">
                    {getStatusBadge(c.status)}
                  </td>

                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        onClick={() => setSelectedCaseForTimeline(c)}
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-indigo-400 hover:text-indigo-300 gap-1"
                        title="View student lifecycle event history"
                      >
                        <History className="w-3.5 h-3.5" />
                        Timeline
                      </Button>

                      {canResolve && c.status !== 'RESOLVED' && (
                        <Button
                          onClick={() => setSelectedCaseForResolve(c)}
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs text-teal-400 hover:text-teal-300 gap-1"
                          title="Record statutory resolution"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <div>
            Showing page <span className="font-semibold text-slate-200">{pagination.page}</span> of{' '}
            <span className="font-semibold text-slate-200">{pagination.totalPages}</span> ({pagination.total} cases)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <StudentTimelineDrawer
        studentTokenId={selectedCaseForTimeline?.studentTokenId || selectedCaseForTimeline?.studentRef || null}
        studentRef={selectedCaseForTimeline?.studentRef}
        isOpen={Boolean(selectedCaseForTimeline)}
        onClose={() => setSelectedCaseForTimeline(null)}
      />

      <ResolveOverlapModal
        overlapCase={selectedCaseForResolve}
        isOpen={Boolean(selectedCaseForResolve)}
        onClose={() => setSelectedCaseForResolve(null)}
      />
    </div>
  );
};
