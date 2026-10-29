import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { useInstitutions } from '../../hooks/useInstitutions';
import { reconciliationApi } from '../../api/modules/reconciliation.api';
import { queryKeys } from '../../api/queryKeys';
import type { ReconciliationFinding } from '../../types/models';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { FindingsTable } from '../reconciliation/components/FindingsTable';
import { FindingDetailDrawer } from '../reconciliation/components/FindingDetailDrawer';
import {
  ListChecks,
  Filter,
  RefreshCw,
  Search,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export const FindingsPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedInstitutionId } = useInstitutions();
  const institutionId = user?.institutionId ? String(user.institutionId) : (selectedInstitutionId || 'SIT-DEMO-01');

  // Filters & State
  const [activeTab, setActiveTab] = useState<'PENDING' | 'CLARIFICATION_REQUESTED' | 'CONFIRMED' | 'ALL'>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedFinding, setSelectedFinding] = useState<ReconciliationFinding | null>(null);

  // Fetch findings across institution runs
  // Note: we fetch findings using the runId if known or list reconciliations to get the primary run
  const { data: runsData } = useQuery({
    queryKey: queryKeys.reconciliations.list({ institutionId }),
    queryFn: () => reconciliationApi.listRuns({ institutionId }),
  });

  const primaryRun = runsData?.items?.[0] || null;

  const {
    data: findingsData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.reconciliations.findings(primaryRun?.id || primaryRun?._id || primaryRun?.runId || 'all', {
      reviewStatus: activeTab === 'ALL' ? undefined : activeTab,
      severity: severityFilter || undefined,
      type: typeFilter || undefined,
      page,
      limit: 25,
    }),
    queryFn: () =>
      reconciliationApi.getFindings(primaryRun?.id || primaryRun?._id || primaryRun?.runId || 'default', {
        reviewStatus: activeTab === 'ALL' ? undefined : activeTab,
        severity: severityFilter || undefined,
        type: typeFilter || undefined,
        page,
        limit: 25,
      }),
    enabled: Boolean(primaryRun),
  });

  const rawFindings = findingsData?.items || [];
  const pagination = findingsData?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 };

  // Filter client-side by search term (name/apaar/application)
  const filteredFindings = rawFindings.filter((f) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const name = f.recordRef?.studentNameMasked?.toLowerCase() || '';
    const apaar = f.recordRef?.apaarTokenMasked?.toLowerCase() || '';
    const app = f.recordRef?.applicationNo?.toLowerCase() || '';
    return name.includes(term) || apaar.includes(term) || app.includes(term);
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <ListChecks className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-100">Reconciliation Findings & Human Review Queue</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Regulatory triage console for cross-register attribute discrepancies, duplicate applicants, and weak match reviews. Decisions record append-only audit entries.
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
            Refresh Queue
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => {
            setActiveTab('PENDING');
            setPage(1);
          }}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === 'PENDING'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Pending Review
        </button>

        <button
          onClick={() => {
            setActiveTab('CLARIFICATION_REQUESTED');
            setPage(1);
          }}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === 'CLARIFICATION_REQUESTED'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Clarification Requested
        </button>

        <button
          onClick={() => {
            setActiveTab('CONFIRMED');
            setPage(1);
          }}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === 'CONFIRMED'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Confirmed Discrepancies
        </button>

        <button
          onClick={() => {
            setActiveTab('ALL');
            setPage(1);
          }}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === 'ALL'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <ListChecks className="w-3.5 h-3.5" />
          All Findings
        </button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-3 bg-slate-900/60 border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search masked student name, APAAR token, or application #..."
                className="pl-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="w-40">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Finding Types</option>
              <option value="CONFIRMED_3WAY">Confirmed 3-Way</option>
              <option value="CONFIRMED_PARTIAL">Confirmed Partial</option>
              <option value="UNMATCHED">Unmatched</option>
              <option value="CONFLICT">Attribute Conflict</option>
              <option value="CANDIDATE_REVIEW">Candidate Review</option>
              <option value="DUPLICATE_CANDIDATE">Duplicate Candidate</option>
            </select>
          </div>

          <div className="w-36">
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
              <option value="INFO">Info</option>
            </select>
          </div>

          {(searchTerm || typeFilter || severityFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setTypeFilter('');
                setSeverityFilter('');
                setPage(1);
              }}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Clear Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Findings Table */}
      <FindingsTable
        findings={filteredFindings}
        isLoading={isLoading}
        onSelectFinding={(f) => setSelectedFinding(f)}
      />

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <div>
            Showing page <span className="font-semibold text-slate-200">{pagination.page}</span> of{' '}
            <span className="font-semibold text-slate-200">{pagination.totalPages}</span> ({pagination.total} total findings)
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

      {/* Review Decision Drawer */}
      <FindingDetailDrawer
        finding={selectedFinding}
        isOpen={Boolean(selectedFinding)}
        onClose={() => setSelectedFinding(null)}
      />
    </div>
  );
};
