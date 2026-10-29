import React from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Progress } from '../../../components/ui/Progress';
import type { SeatBalance } from '../../../types/models';
import { Sparkles, Eye, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';

interface BucketTableProps {
  buckets: SeatBalance[];
  isLoading: boolean;
  onSelectBucket: (bucket: SeatBalance) => void;
  onQuickDeclare?: (bucket: SeatBalance) => void;
  onQuickApprove?: (bucket: SeatBalance) => void;
  canDeclare?: boolean;
  canApprove?: boolean;
}

export const BucketTable: React.FC<BucketTableProps> = ({
  buckets,
  isLoading,
  onSelectBucket,
  onQuickDeclare,
  onQuickApprove,
  canDeclare = false,
  canApprove = false,
}) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OK':
        return (
          <Badge variant="verified" size="sm" className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> OK
          </Badge>
        );
      case 'WARNING':
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <Clock className="w-3 h-3" /> Warning (≥90%)
          </Badge>
        );
      case 'OVER_CAP_DISCREPANCY':
        return (
          <Badge variant="danger" size="sm" className="gap-1">
            <ShieldAlert className="w-3 h-3" /> Over-Cap Discrepancy
          </Badge>
        );
      case 'INTAKE_UNVERIFIED':
        return (
          <Badge variant="outline" size="sm" className="text-blue-400 border-blue-500/30">
            Intake Unverified
          </Badge>
        );
      case 'NO_INTAKE_CONFIGURED':
        return (
          <Badge variant="outline" size="sm" className="text-slate-400">
            Unconfigured
          </Badge>
        );
      default:
        return <Badge variant="outline" size="sm">{status}</Badge>;
    }
  };

  const getUtilisationColor = (pct: number | null) => {
    if (pct === null) return 'bg-slate-700';
    if (pct > 100) return 'bg-rose-500';
    if (pct >= 90) return 'bg-amber-500';
    return 'bg-teal-500';
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-xs text-muted-foreground border border-border rounded-xl bg-card">
        Loading seat balance buckets...
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="py-16 text-center text-xs text-muted-foreground border border-border rounded-xl bg-card space-y-2">
        <p className="text-sm font-medium text-foreground">No seat balance buckets found matching the selected filters.</p>
        <p className="text-muted-foreground">Try adjusting your programme code, academic year, or status filter.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-border rounded-xl bg-card shadow-sm">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/70 text-muted-foreground border-b border-border font-medium">
          <tr>
            <th className="p-3">Bucket / Cohort</th>
            <th className="p-3">Category</th>
            <th className="p-3">Approved Intake</th>
            <th className="p-3 text-right">Occupancy</th>
            <th className="p-3 text-right">Headroom</th>
            <th className="p-3 w-40">Capacity Utilisation</th>
            <th className="p-3">Status</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-foreground">
          {buckets.map((b) => (
            <tr key={b._id} className="hover:bg-muted/50 transition-colors">
              <td className="p-3">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span className="font-mono text-primary font-bold">{b.programmeCode}</span>
                  <span className="text-muted-foreground/60">•</span>
                  <span className="font-mono text-muted-foreground">{b.academicYear}</span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {b.bucketKey}
                </div>
              </td>

              <td className="p-3">
                <span className="px-2 py-0.5 rounded bg-muted text-foreground font-mono text-[11px] border border-border/60">
                  {b.seatCategory}
                </span>
              </td>

              <td className="p-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold font-mono text-foreground">
                    {b.approvedIntake !== null ? b.approvedIntake : '—'}
                  </span>
                  {(b.isSimulated || b.intakeSourceMode === 'SIMULATED') && (
                    <Badge variant="simulated" size="sm">
                      <Sparkles className="w-2.5 h-2.5 mr-0.5" /> (Simulated)
                    </Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                  {b.intakeVerificationStatus}
                </div>
              </td>

              <td className="p-3 text-right font-mono font-semibold text-foreground">
                {b.reportedOccupancy}
              </td>

              <td className="p-3 text-right font-mono">
                {b.headroom === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : b.headroom < 0 ? (
                  <span className="text-rose-600 dark:text-rose-400 font-bold">{b.headroom}</span>
                ) : b.headroom === 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-bold">0</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{b.headroom}</span>
                )}
              </td>

              <td className="p-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-muted-foreground">
                      {b.utilisationPct !== null ? `${b.utilisationPct.toFixed(1)}%` : '—'}
                    </span>
                    <span className="text-[10px] text-muted-foreground/80">Cap {b.approvedIntake ?? '?'}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${getUtilisationColor(b.utilisationPct)}`}
                      style={{
                        width: `${Math.min(100, Math.max(0, b.utilisationPct ?? 0))}%`,
                      }}
                    />
                  </div>
                </div>
              </td>

              <td className="p-3">
                {getStatusBadge(b.status)}
              </td>

              <td className="p-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    onClick={() => onSelectBucket(b)}
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-primary hover:text-primary/80"
                    title="Inspect Ledger Entries & Timeline"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    Entries
                  </Button>

                  {canDeclare && onQuickDeclare && (
                    <Button
                      onClick={() => onQuickDeclare(b)}
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      title="Declare revised capacity"
                    >
                      Declare
                    </Button>
                  )}

                  {canApprove && onQuickApprove && (
                    <Button
                      onClick={() => onQuickApprove(b)}
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs text-teal-600 dark:text-teal-400 hover:text-teal-500"
                      title="Set authoritative capacity"
                    >
                      Approve
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
