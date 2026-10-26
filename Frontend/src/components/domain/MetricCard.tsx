import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MetricStatus } from '@/types/enums';
import { CheckCircle2, HelpCircle, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  code: 'M1' | 'M2' | 'M3' | 'M4';
  title: string;
  description: string;
  status: MetricStatus;
  subScore: number | null;
  weightUsed: number | null;
  weightConfigured?: number;
  primaryStat: string;
  secondaryStat?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  code,
  title,
  description,
  status,
  subScore,
  weightUsed,
  weightConfigured,
  primaryStat,
  secondaryStat,
  onClick,
  isActive = false,
}) => {
  const isAvailable = status === MetricStatus.AVAILABLE;
  const isUnavailable = status === MetricStatus.UNAVAILABLE;

  const statusBadge = {
    [MetricStatus.AVAILABLE]: {
      label: 'Available',
      variant: 'success' as const,
      icon: CheckCircle2,
    },
    [MetricStatus.INSUFFICIENT_DATA]: {
      label: 'Insufficient Data',
      variant: 'secondary' as const,
      icon: HelpCircle,
    },
    [MetricStatus.UNAVAILABLE]: {
      label: 'Excluded / Unavailable',
      variant: 'outline' as const,
      icon: MinusCircle,
    },
  }[status] || {
    label: status,
    variant: 'secondary' as const,
    icon: HelpCircle,
  };

  const StatusIcon = statusBadge.icon;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer transition-all border-border/80 hover:border-primary/50 relative overflow-hidden',
        isActive && 'border-primary ring-2 ring-primary/20 shadow-elevation bg-primary/[0.02]',
        isUnavailable && 'opacity-70 bg-muted/20'
      )}
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-primary" style={{ opacity: isAvailable ? 1 : 0.2 }} />

      <CardContent className="p-5 space-y-3">
        {/* Header with Code + Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {code}
            </span>
            <span className="text-xs font-semibold text-foreground truncate max-w-[150px]">
              {title}
            </span>
          </div>

          <Badge variant={statusBadge.variant} className="text-[10px] py-0 px-2 gap-1 font-medium">
            <StatusIcon className="w-3 h-3" />
            {statusBadge.label}
          </Badge>
        </div>

        {/* Primary Stat & Score */}
        <div className="flex items-baseline justify-between pt-1">
          <div>
            <span className="text-2xl font-extrabold text-foreground tabular-nums tracking-tight">
              {primaryStat}
            </span>
            {secondaryStat && (
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                {secondaryStat}
              </span>
            )}
          </div>

          <div className="text-right">
            <span className="text-sm font-bold text-foreground tabular-nums">
              {subScore !== null ? `${subScore} / 100` : '—'}
            </span>
            <span className="text-[10px] text-muted-foreground block font-medium">
              Sub-Score
            </span>
          </div>
        </div>

        {/* Footer info: Weight & guidance */}
        <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Weight:{' '}
            <strong className="text-foreground font-semibold">
              {weightUsed !== null && weightUsed !== undefined
                ? `${Math.round(weightUsed * 100)}%`
                : weightConfigured
                ? `${Math.round(weightConfigured * 100)}% (cfg)`
                : 'Excluded'}
            </strong>
          </span>
          <span className="text-[10px] truncate max-w-[140px] text-muted-foreground/80">
            {description}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
