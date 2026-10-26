import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Progress } from '../../../components/ui/Progress';
import { samplingApi } from '../../../api/modules/sampling.api';
import { queryKeys } from '../../../api/queryKeys';
import { usePermission } from '../../../auth/usePermission';
import {
  TrendingUp,
  ShieldCheck,
  Lock,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';

interface WilsonEstimateCardProps {
  runId: string;
  isClosed?: boolean;
}

export const WilsonEstimateCard: React.FC<WilsonEstimateCardProps> = ({
  runId,
  isClosed = false,
}) => {
  const queryClient = useQueryClient();
  const canClose = usePermission('sampling:close');

  const { data: estimate, isLoading } = useQuery({
    queryKey: queryKeys.sampling.estimate(runId),
    queryFn: () => samplingApi.getEstimate(runId),
    enabled: Boolean(runId),
  });

  const closeMutation = useMutation({
    mutationFn: () => samplingApi.closeRun(runId, 'Statutory audit verification concluded.'),
    onSuccess: () => {
      toast.success('Sampling run formally closed. All review findings frozen.');
      queryClient.invalidateQueries({ queryKey: queryKeys.sampling.runs({}) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sampling.estimate(runId) });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to close sampling run');
    },
  });

  if (isLoading) {
    return (
      <Card className="p-4 bg-slate-900/60 border-slate-800 text-xs text-slate-400 text-center">
        Computing Wilson score interval and verification statistics...
      </Card>
    );
  }

  if (!estimate) return null;

  const progressPct =
    estimate.sampleCount > 0
      ? Math.round((estimate.verifiedCount / estimate.sampleCount) * 100)
      : 0;

  const lowerBoundPct = (estimate.wilsonInterval?.lowerBound * 100).toFixed(1);
  const upperBoundPct = (estimate.wilsonInterval?.upperBound * 100).toFixed(1);

  return (
    <Card className="p-5 bg-gradient-to-r from-slate-900/90 to-slate-950/90 border-slate-800 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">
              Statistical Assurance Rate & Wilson Score Interval
            </h4>
            <span className="text-[11px] text-slate-400">
              Assurance Model: Random stratum estimate at {Math.round((estimate.wilsonInterval?.confidenceLevel || 0.95) * 100)}% Confidence
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={estimate.isStatisticallySound ? 'verified' : 'warning'}
            size="sm"
            className="gap-1 font-mono"
          >
            {estimate.isStatisticallySound ? (
              <>
                <CheckCircle2 className="w-3 h-3" /> Statistically Sound
              </>
            ) : (
              <>
                <HelpCircle className="w-3 h-3" /> Partial Progress
              </>
            )}
          </Badge>

          {canClose && !isClosed && estimate.status !== 'CLOSED' && (
            <Button
              onClick={() => closeMutation.mutate()}
              variant="outline"
              size="sm"
              disabled={closeMutation.isPending}
              className="gap-1.5 text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
            >
              <Lock className="w-3.5 h-3.5" />
              {closeMutation.isPending ? 'Freezing...' : 'Close Sampling Run'}
            </Button>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg">
          <span className="text-[10px] uppercase text-slate-500 font-semibold block">Audit Progress</span>
          <span className="text-lg font-bold font-mono text-slate-100">
            {estimate.verifiedCount} / {estimate.sampleCount} ({progressPct}%)
          </span>
        </div>

        <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg">
          <span className="text-[10px] uppercase text-emerald-400 font-semibold block">Estimated Rate</span>
          <span className="text-lg font-bold font-mono text-emerald-400">
            {(estimate.estimatedRate * 100).toFixed(1)}%
          </span>
        </div>

        <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg md:col-span-2">
          <span className="text-[10px] uppercase text-teal-400 font-semibold block">
            Wilson Score 95% Confidence Interval
          </span>
          <span className="text-lg font-bold font-mono text-teal-300">
            [{lowerBoundPct}%, {upperBoundPct}%]
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] text-slate-400 font-mono">
          <span>Verification Completion</span>
          <span>{estimate.discrepancyCount} discrepancies recorded</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-indigo-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </Card>
  );
};
