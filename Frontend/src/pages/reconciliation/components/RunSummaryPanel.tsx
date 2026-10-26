import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { reconciliationApi } from '../../../api/modules/reconciliation.api';
import { queryKeys } from '../../../api/queryKeys';
import type { ReconciliationRun } from '../../../types/models';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import {
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Info,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface RunSummaryPanelProps {
  run: ReconciliationRun;
}

export const RunSummaryPanel: React.FC<RunSummaryPanelProps> = ({ run }) => {
  const { data: summaryData, isLoading } = useQuery({
    queryKey: queryKeys.reconciliations.summary(run.id || run._id || run.runId),
    queryFn: () => reconciliationApi.getSummary(run.id || run._id || run.runId),
  });

  const summary = summaryData?.summary || run.summary;
  const metrics = summaryData?.metrics || {
    reconciliationRatePct:
      summary.rosterRecords > 0
        ? Math.round((summary.confirmed3Way / summary.rosterRecords) * 1000) / 10
        : 0,
    unresolvedCount:
      summary.unmatched +
      summary.conflicts +
      summary.candidateReview +
      summary.duplicateCandidates,
    coveragePct: summary.sourceUnavailable === 0 ? 100 : 66.7,
  };

  const chartData = summaryData?.chartBreakdown || [
    { label: 'Confirmed 3-Way', count: summary.confirmed3Way, status: 'CONFIRMED_3WAY' },
    { label: 'Confirmed Partial', count: summary.confirmedPartial, status: 'CONFIRMED_PARTIAL' },
    { label: 'Unmatched', count: summary.unmatched, status: 'UNMATCHED' },
    { label: 'Conflicts', count: summary.conflicts, status: 'CONFLICT' },
    { label: 'Candidate Review', count: summary.candidateReview, status: 'CANDIDATE_REVIEW' },
    { label: 'Duplicate Candidates', count: summary.duplicateCandidates, status: 'DUPLICATE_CANDIDATE' },
    { label: 'Missing from Roster', count: summary.missingFromRoster, status: 'MISSING_FROM_ROSTER' },
    { label: 'Over-Intake Mismatch', count: summary.countMismatches, status: 'COUNT_MISMATCH' },
  ];

  const getBarColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED_3WAY':
        return '#0d9488'; // teal
      case 'CONFIRMED_PARTIAL':
        return '#6366f1'; // indigo
      case 'UNMATCHED':
        return '#64748b'; // slate
      case 'CONFLICT':
        return '#f59e0b'; // amber
      case 'CANDIDATE_REVIEW':
        return '#8b5cf6'; // purple
      case 'DUPLICATE_CANDIDATE':
      case 'COUNT_MISMATCH':
        return '#f43f5e'; // rose
      default:
        return '#38bdf8';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Roster Records</span>
          <span className="text-xl font-bold font-mono text-slate-100">{summary.rosterRecords}</span>
        </Card>

        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <span className="text-[10px] text-emerald-400 uppercase font-semibold block flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Confirmed 3-Way
          </span>
          <span className="text-xl font-bold font-mono text-emerald-400">{summary.confirmed3Way}</span>
        </Card>

        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <span className="text-[10px] text-indigo-400 uppercase font-semibold block">Confirmed Partial</span>
          <span className="text-xl font-bold font-mono text-indigo-400">{summary.confirmedPartial}</span>
        </Card>

        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <span className="text-[10px] text-rose-400 uppercase font-semibold block flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Unresolved Items
          </span>
          <span className="text-xl font-bold font-mono text-rose-400">{metrics.unresolvedCount}</span>
        </Card>

        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <span className="text-[10px] text-teal-400 uppercase font-semibold block">Reconciliation Rate</span>
          <span className="text-xl font-bold font-mono text-teal-400">{metrics.reconciliationRatePct}%</span>
        </Card>

        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Register Coverage</span>
          <span className="text-xl font-bold font-mono text-slate-100">{metrics.coveragePct}%</span>
        </Card>
      </div>

      {/* Chart & Triangulation breakdown */}
      <Card className="p-4 bg-slate-900/60 border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-400" />
            Multi-Register Distribution Breakdown
          </h4>
          <span className="text-[11px] text-slate-400 font-mono">
            Engine Rule: <span className="text-indigo-300">{run.ruleVersion || 'reconciliation-rules@1'}</span>
          </span>
        </div>

        <div className="h-60 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
            >
              <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="label"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.status)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Non-punitive clarification notice */}
        <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-teal-400 mt-0.5 shrink-0" />
          <span>
            <strong className="text-slate-300">Statutory Notice:</strong> Findings indicate register attribute variances requiring administrative alignment. Non-punitive reconciliation safeguards student enrolment integrity.
          </span>
        </div>
      </Card>
    </div>
  );
};
