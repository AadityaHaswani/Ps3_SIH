import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { usePermission } from '../../auth/usePermission';
import { reconciliationApi } from '../../api/modules/reconciliation.api';
import { queryKeys } from '../../api/queryKeys';
import type { ReconciliationRun, ReconciliationFinding } from '../../types/models';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { RunSummaryPanel } from './components/RunSummaryPanel';
import { FindingsTable } from './components/FindingsTable';
import { FindingDetailDrawer } from './components/FindingDetailDrawer';
import { CreateReconciliationModal } from './components/CreateReconciliationModal';
import {
  GitMerge,
  PlayCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Filter,
} from 'lucide-react';

export const ReconciliationsPage: React.FC = () => {
  const { user } = useAuth();
  const institutionId = user?.institutionId || 'SIT-DEMO-01';
  const canRun = usePermission('reconciliation:run');

  const [academicYear, setAcademicYear] = useState('2024-25');
  const [selectedRun, setSelectedRun] = useState<ReconciliationRun | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<ReconciliationFinding | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Finding filters for selected run
  const [findingType, setFindingType] = useState('');
  const [findingSeverity, setFindingSeverity] = useState('');
  const [findingReviewStatus, setFindingReviewStatus] = useState('');

  // Runs Query
  const {
    data: runsData,
    isLoading: isLoadingRuns,
    refetch: refetchRuns,
    isFetching: isFetchingRuns,
  } = useQuery({
    queryKey: queryKeys.reconciliations.list({ institutionId, academicYear }),
    queryFn: () => reconciliationApi.listRuns({ institutionId, academicYear }),
  });

  const runs = runsData?.items || [];
  const activeRun = selectedRun || runs[0] || null;

  // Findings Query for selected run
  const { data: findingsData, isLoading: isLoadingFindings } = useQuery({
    queryKey: queryKeys.reconciliations.findings(activeRun?.id || activeRun?._id || activeRun?.runId || '', {
      type: findingType || undefined,
      severity: findingSeverity || undefined,
      reviewStatus: findingReviewStatus || undefined,
    }),
    queryFn: () =>
      reconciliationApi.getFindings(activeRun?.id || activeRun?._id || activeRun?.runId || '', {
        type: findingType || undefined,
        severity: findingSeverity || undefined,
        reviewStatus: findingReviewStatus || undefined,
      }),
    enabled: Boolean(activeRun),
  });

  const findings = findingsData?.items || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
              <GitMerge className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-100">Three-Way Reconciliation Matching</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Triangulate institutional rosters against state admission registers, exam portal records, and sanctioned capacity baselines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canRun && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              variant="primary"
              size="sm"
              className="gap-1.5 shadow-sm"
            >
              <PlayCircle className="w-4 h-4" />
              Run Three-Way Match
            </Button>
          )}

          <Button
            onClick={() => refetchRuns()}
            variant="outline"
            size="sm"
            disabled={isFetchingRuns}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingRuns ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Runs Selector Carousel / Strip */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Reconciliation Execution Runs
          </span>
          <div className="w-36">
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              <option value="2024-25">2024-25</option>
              <option value="2023-24">2023-24</option>
              <option value="2022-23">2022-23</option>
            </select>
          </div>
        </div>

        {isLoadingRuns && (
          <div className="py-6 text-center text-xs text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40">
            Loading reconciliation history...
          </div>
        )}

        {!isLoadingRuns && runs.length === 0 && (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/40 space-y-2">
            <p className="text-sm font-semibold text-slate-300">No reconciliation runs executed for this period.</p>
            <p className="text-xs text-slate-500">
              Click &quot;Run Three-Way Match&quot; to execute your first triangulated cross-register audit.
            </p>
          </div>
        )}

        {!isLoadingRuns && runs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {runs.map((r) => {
              const isSelected = (activeRun?.id || activeRun?._id || activeRun?.runId) === (r.id || r._id || r.runId);
              return (
                <div
                  key={r.id || r._id || r.runId}
                  onClick={() => setSelectedRun(r)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-600 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-semibold text-slate-200 truncate">
                      {r.runId}
                    </span>
                    <Badge
                      variant={
                        r.status === 'COMPLETED'
                          ? 'verified'
                          : r.status === 'RUNNING'
                          ? 'warning'
                          : 'danger'
                      }
                      size="sm"
                    >
                      {r.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-slate-400 py-1 border-t border-slate-800/80">
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Matched</span>
                      <span className="font-bold text-emerald-400">{r.summary.confirmed3Way}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Partial</span>
                      <span className="font-bold text-indigo-400">{r.summary.confirmedPartial}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Unresolved</span>
                      <span className="font-bold text-rose-400">
                        {r.summary.unmatched + r.summary.conflicts + r.summary.candidateReview}
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 mt-2 flex items-center justify-between">
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    <span className="font-mono">{r.ruleVersion || 'rules@1'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Run Triangulation Breakdown */}
      {activeRun && (
        <div className="space-y-6 pt-2">
          <RunSummaryPanel run={activeRun} />

          {/* Findings Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>Reconciliation Findings</span>
                  <Badge variant="outline" size="sm" className="font-mono">
                    {findings.length} Items
                  </Badge>
                </h3>
                <p className="text-xs text-slate-400">
                  Individual register discrepancies, weak candidate matches, and review tasks for run{' '}
                  <span className="font-mono text-indigo-300">{activeRun.runId}</span>.
                </p>
              </div>

              {/* Finding filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={findingType}
                  onChange={(e) => setFindingType(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">All Types</option>
                  <option value="CONFIRMED_3WAY">Confirmed 3-Way</option>
                  <option value="CONFIRMED_PARTIAL">Confirmed Partial</option>
                  <option value="UNMATCHED">Unmatched</option>
                  <option value="CONFLICT">Attribute Conflict</option>
                  <option value="CANDIDATE_REVIEW">Candidate Review</option>
                  <option value="DUPLICATE_CANDIDATE">Duplicate Candidate</option>
                </select>

                <select
                  value={findingSeverity}
                  onChange={(e) => setFindingSeverity(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                  <option value="INFO">Info</option>
                </select>

                <select
                  value={findingReviewStatus}
                  onChange={(e) => setFindingReviewStatus(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">All Review Statuses</option>
                  <option value="PENDING">Pending Review</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="DISMISSED">Dismissed</option>
                  <option value="CLARIFICATION_REQUESTED">Clarification Requested</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>
            </div>

            <FindingsTable
              findings={findings}
              isLoading={isLoadingFindings}
              onSelectFinding={(f) => setSelectedFinding(f)}
            />
          </div>
        </div>
      )}

      {/* Review Drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={Boolean(selectedFinding)}
        onClose={() => setSelectedFinding(null)}
      />

      {/* Create Run Modal */}
      <CreateReconciliationModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        institutionId={institutionId}
      />
    </div>
  );
};
