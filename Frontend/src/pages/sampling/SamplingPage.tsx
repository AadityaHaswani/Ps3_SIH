import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { usePermission } from '../../auth/usePermission';
import { samplingApi } from '../../api/modules/sampling.api';
import { queryKeys } from '../../api/queryKeys';
import type { SamplingRun, SamplingItem } from '../../types/models';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { CochranCalculatorModal } from './components/CochranCalculatorModal';
import { WilsonEstimateCard } from './components/WilsonEstimateCard';
import { RecordVerificationModal } from './components/RecordVerificationModal';
import {
  Calculator,
  PlusCircle,
  RefreshCw,
  CheckSquare,
  Sparkles,
  Layers,
  Filter,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';

export const SamplingPage: React.FC = () => {
  const { user } = useAuth();
  const institutionId = user?.institutionId || 'SIT-DEMO-01';

  const canCreate = usePermission('sampling:create');
  const canReview = usePermission('sampling:review');

  const [page, setPage] = useState(1);
  const [selectedRun, setSelectedRun] = useState<SamplingRun | null>(null);
  const [selectedItemForReview, setSelectedItemForReview] = useState<SamplingItem | null>(null);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  // Filters for items in selected run
  const [stratumFilter, setStratumFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Runs Query
  const {
    data: runsData,
    isLoading: isLoadingRuns,
    refetch: refetchRuns,
    isFetching: isFetchingRuns,
  } = useQuery({
    queryKey: queryKeys.sampling.runs({ institutionId }),
    queryFn: () => samplingApi.listRuns({ institutionId }),
  });

  const runs = runsData?.items || [];
  const activeRun = selectedRun || runs[0] || null;

  // Items Query for active run
  const {
    data: itemsData,
    isLoading: isLoadingItems,
    refetch: refetchItems,
  } = useQuery({
    queryKey: queryKeys.sampling.items(activeRun?._id || '', {
      stratum: stratumFilter || undefined,
      verificationStatus: statusFilter || undefined,
      page,
      limit: 25,
    }),
    queryFn: () =>
      samplingApi.getItems(activeRun!._id, {
        stratum: stratumFilter || undefined,
        verificationStatus: statusFilter || undefined,
        page,
        limit: 25,
      }),
    enabled: Boolean(activeRun?._id),
  });

  const items = itemsData?.items || [];
  const pagination = itemsData?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED_MATCH':
        return (
          <Badge variant="verified" size="sm" className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> Match
          </Badge>
        );
      case 'VERIFIED_DISCREPANCY':
        return (
          <Badge variant="danger" size="sm" className="gap-1">
            <AlertTriangle className="w-3 h-3" /> Discrepancy
          </Badge>
        );
      case 'UNABLE_TO_VERIFY':
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <HelpCircle className="w-3 h-3" /> Unable to Verify
          </Badge>
        );
      case 'EXCLUDED':
        return (
          <Badge variant="outline" size="sm" className="text-slate-400">
            Excluded
          </Badge>
        );
      case 'PENDING':
      default:
        return (
          <Badge variant="secondary" size="sm">
            Pending
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
            <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
              <Calculator className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-100">Assurance Random Sampling</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Cochran-stratified random inspection with Finite Population Correction (FPC). Computes Wilson score confidence bounds for audit oversight.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <Button
              onClick={() => setIsCalculatorOpen(true)}
              variant="primary"
              size="sm"
              className="gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              Draw Assurance Sample
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

      {/* Runs Strip */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
          Assurance Sampling Runs
        </span>

        {isLoadingRuns && (
          <div className="py-6 text-center text-xs text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40">
            Loading sampling runs...
          </div>
        )}

        {!isLoadingRuns && runs.length === 0 && (
          <div className="p-10 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/40 space-y-2">
            <p className="text-sm font-semibold text-slate-300">No sampling runs drawn yet.</p>
            <p className="text-xs text-slate-500">
              Click &quot;Draw Assurance Sample&quot; to configure Cochran parameters and draw a stratified sample.
            </p>
          </div>
        )}

        {!isLoadingRuns && runs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {runs.map((r) => {
              const isSelected = activeRun?._id === r._id;
              return (
                <div
                  key={r._id}
                  onClick={() => setSelectedRun(r)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-teal-950/30 border-teal-600 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-semibold text-slate-200 truncate">
                      {r.runId}
                    </span>
                    <Badge
                      variant={r.status === 'CLOSED' ? 'outline' : 'verified'}
                      size="sm"
                    >
                      {r.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-slate-400 py-1 border-t border-slate-800/80">
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Sample</span>
                      <span className="font-bold text-slate-200">{r.totalSampleSize || r.sampleSize}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Reviewed</span>
                      <span className="font-bold text-teal-400">{r.summary?.verified || 0}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Discrepancy</span>
                      <span className="font-bold text-rose-400">{r.summary?.failedCheck || 0}</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 mt-2 flex items-center justify-between font-mono">
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                    <span>Pop: {r.eligiblePopulationSize}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Run Details */}
      {activeRun && (
        <div className="space-y-6 pt-2">
          {/* Wilson Estimate Card */}
          <WilsonEstimateCard
            runId={activeRun._id}
            isClosed={activeRun.status === 'CLOSED'}
          />

          {/* Items Section */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <span>Stratified Sample Items</span>
                  <Badge variant="outline" size="sm" className="font-mono">
                    {pagination.total} Items
                  </Badge>
                </h3>
                <p className="text-xs text-slate-400">
                  Dual-stratum sample (Random Cochran + Risk-targeted) for run <span className="font-mono text-teal-300">{activeRun.runId}</span>.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={stratumFilter}
                  onChange={(e) => {
                    setStratumFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">All Strata</option>
                  <option value="RANDOM">RANDOM (Cochran + FPC)</option>
                  <option value="RISK_TARGETED">RISK_TARGETED</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending Review</option>
                  <option value="VERIFIED_MATCH">Verified Match</option>
                  <option value="VERIFIED_DISCREPANCY">Verified Discrepancy</option>
                  <option value="UNABLE_TO_VERIFY">Unable to Verify</option>
                  <option value="EXCLUDED">Excluded</option>
                </select>
              </div>
            </div>

            {/* Items Table */}
            {isLoadingItems && (
              <div className="py-14 text-center text-xs text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40">
                Loading stratified sample items...
              </div>
            )}

            {!isLoadingItems && items.length === 0 && (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/40 text-xs text-slate-500">
                No items match selected filters.
              </div>
            )}

            {!isLoadingItems && items.length > 0 && (
              <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/50 shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                    <tr>
                      <th className="p-3">Stratum</th>
                      <th className="p-3">Student Name (Masked)</th>
                      <th className="p-3">APAAR / App #</th>
                      <th className="p-3">Programme / Year</th>
                      <th className="p-3">Verification Status</th>
                      <th className="p-3">Method / Evidence</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-slate-200">
                    {items.map((item) => (
                      <tr key={item._id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3">
                          <Badge
                            variant={item.stratum === 'RANDOM' ? 'verified' : 'simulated'}
                            size="sm"
                            className="font-mono text-[10px]"
                          >
                            {item.stratum}
                          </Badge>
                        </td>

                        <td className="p-3 font-medium text-slate-200">
                          {item.studentNameMasked}
                        </td>

                        <td className="p-3 font-mono text-[11px] text-teal-300">
                          {item.apaarTokenMasked || item.applicationNo || '—'}
                        </td>

                        <td className="p-3 font-mono text-[11px] text-slate-300">
                          {item.programmeCode} ({item.academicYear})
                        </td>

                        <td className="p-3">
                          {getStatusBadge(item.verificationStatus)}
                        </td>

                        <td className="p-3 text-slate-400 text-[11px] font-mono truncate max-w-[150px]">
                          {item.verificationMethod || item.evidenceRef || '—'}
                        </td>

                        <td className="p-3 text-right">
                          {canReview && activeRun.status !== 'CLOSED' && (
                            <Button
                              onClick={() => setSelectedItemForReview(item)}
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2.5 text-xs text-teal-400 hover:text-teal-300"
                            >
                              <CheckSquare className="w-3.5 h-3.5 mr-1" />
                              Verify
                            </Button>
                          )}
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
                  <span className="font-semibold text-slate-200">{pagination.totalPages}</span> ({pagination.total} items)
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
          </div>
        </div>
      )}

      {/* Modals */}
      <CochranCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        institutionId={institutionId}
      />

      <RecordVerificationModal
        item={selectedItemForReview}
        isOpen={Boolean(selectedItemForReview)}
        onClose={() => setSelectedItemForReview(null)}
      />
    </div>
  );
};
