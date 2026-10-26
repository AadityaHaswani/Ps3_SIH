import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { rosterApi } from '../../../api/modules/roster.api';
import { queryKeys } from '../../../api/queryKeys';
import type { RosterVersion } from '../../../types/models';
import { useAuth } from '../../../auth';
import { usePermission } from '../../../auth/usePermission';
import { Activity, RefreshCw, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';

interface ImpactAssessmentDrawerProps {
  version: RosterVersion | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ImpactAssessmentDrawer: React.FC<ImpactAssessmentDrawerProps> = ({
  version,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const versionId = version?.id || version?._id || '';

  const canRevalidate = usePermission('roster-versions:revalidate') && user?.role !== 'AUDITOR';

  const [outputType, setOutputType] = useState<'SCORECARD' | 'SEAT_BALANCE' | 'RECONCILIATION'>('SCORECARD');

  const { data: impact, isLoading, refetch } = useQuery({
    queryKey: queryKeys.rosters.impact(versionId),
    queryFn: () => rosterApi.getImpact(versionId),
    enabled: Boolean(versionId && isOpen),
  });

  const revalidateMutation = useMutation({
    mutationFn: () =>
      rosterApi.revalidateOutput(versionId),
    onSuccess: () => {
      toast.success('Affected statutory outputs revalidated successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.rosters.impact(versionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.scorecards.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.seatLedger.all });
      refetch();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Revalidation failed';
      toast.error(msg);
    },
  });

  if (!version) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Blast-Radius Impact Assessment
          </DialogTitle>
          <DialogDescription>
            Downstream statutory outputs affected by modifications in Version <span className="font-mono text-indigo-300 font-semibold">v{version.versionNumber}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isLoading && (
            <div className="py-8 text-center text-xs text-slate-400">
              Assessing downstream system impacts...
            </div>
          )}

          {!isLoading && impact && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Reconciliations</span>
                  <span className="text-xl font-bold font-mono text-slate-100">
                    {impact.affectedReconciliations ?? 0}
                  </span>
                </div>

                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Scorecards</span>
                  <span className="text-xl font-bold font-mono text-slate-100">
                    {impact.affectedScorecards ?? 0}
                  </span>
                </div>

                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Seat Balances</span>
                  <span className="text-xl font-bold font-mono text-slate-100">
                    {impact.affectedBalances ?? 0}
                  </span>
                </div>
              </div>

              <div
                className={`p-3.5 rounded-lg border flex items-start gap-3 ${
                  impact.requiresRevalidation
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                {impact.requiresRevalidation ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 text-xs">
                  <div className="font-semibold">
                    {impact.requiresRevalidation
                      ? 'Revalidation Required'
                      : 'All Downstream Outputs Fresh'}
                  </div>
                  <p className="opacity-90 leading-relaxed">
                    {impact.requiresRevalidation
                      ? 'New version commits have invalidated prior reconciliation or scorecard caches.'
                      : 'All downstream calculations are consistent with this committed version.'}
                  </p>
                </div>
              </div>

              {/* Revalidation Action Panel */}
              {user?.role === 'AUDITOR' ? (
                <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-300">Auditor Notice:</strong> Auditors have strictly read-only observation rights and cannot trigger cache revalidation mutations.
                  </span>
                </div>
              ) : canRevalidate && impact.requiresRevalidation ? (
                <div className="p-3.5 bg-slate-900/90 border border-indigo-950 rounded-lg space-y-3">
                  <span className="text-xs font-semibold text-slate-200 block">
                    Trigger Cache Revalidation
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full gap-2"
                      disabled={revalidateMutation.isPending}
                      onClick={() => revalidateMutation.mutate()}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${revalidateMutation.isPending ? 'animate-spin' : ''}`} />
                      {revalidateMutation.isPending ? 'Revalidating Outputs...' : 'Revalidate Stale Outputs'}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
