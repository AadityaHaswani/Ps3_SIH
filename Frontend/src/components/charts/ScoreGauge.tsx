import React from 'react';
import { ScoreBand } from '@/types/enums';
import { Badge } from '@/components/ui/Badge';
import { HelpCircle } from 'lucide-react';

interface ScoreGaugeProps {
  score: number | null;
  band: ScoreBand;
  size?: number;
  showBandBadge?: boolean;
}

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({
  score,
  band,
  size = 180,
  showBandBadge = true,
}) => {
  const isInsufficient = score === null || band === ScoreBand.INSUFFICIENT_DATA;

  // Band color schemes
  const bandConfig = {
    [ScoreBand.STRONG]: {
      label: 'Strong Reliability',
      color: 'hsl(var(--success))',
      trackColor: 'hsl(var(--success-soft))',
      badgeVariant: 'success' as const,
      description: 'Reported institutional registers demonstrate high fidelity and timely lifecycle sync.',
    },
    [ScoreBand.ADEQUATE]: {
      label: 'Adequate Reliability',
      color: 'hsl(var(--primary))',
      trackColor: 'hsl(var(--primary) / 0.15)',
      badgeVariant: 'default' as const,
      description: 'Meets benchmark reliability standards with minor cross-register clarifications pending.',
    },
    [ScoreBand.NEEDS_SUPPORT]: {
      label: 'Needs Support',
      color: 'hsl(var(--warning))',
      trackColor: 'hsl(var(--warning-soft))',
      badgeVariant: 'warning' as const,
      description: 'Identifies operational areas where data reconciliation assistance is recommended.',
    },
    [ScoreBand.PRIORITY_SUPPORT]: {
      label: 'Priority Support',
      color: 'hsl(var(--danger))',
      trackColor: 'hsl(var(--danger-soft))',
      badgeVariant: 'danger' as const,
      description: 'Prioritized for administrative technical assistance to resolve register divergences.',
    },
    [ScoreBand.INSUFFICIENT_DATA]: {
      label: 'Insufficient Data',
      color: 'hsl(var(--muted-foreground))',
      trackColor: 'hsl(var(--muted))',
      badgeVariant: 'secondary' as const,
      description: 'Baseline snapshots pending. Awaiting committed roster or cross-register synchronization.',
    },
  }[band] || {
    label: 'Evaluating',
    color: 'hsl(var(--muted-foreground))',
    trackColor: 'hsl(var(--muted))',
    badgeVariant: 'secondary' as const,
    description: 'Data baseline currently computing.',
  };

  // SVG parameters
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Arc calculation: 270-degree gauge (leaving bottom gap)
  const arcLength = circumference * 0.75;
  const normalizedScore = isInsufficient ? 0 : Math.min(100, Math.max(0, score || 0));
  const strokeDashoffset = arcLength - (arcLength * normalizedScore) / 100;

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="rotate-[135deg] transform"
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
            className="text-muted/40"
          />

          {/* Value Progress Arc */}
          {!isInsufficient && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke={bandConfig.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          )}
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          {isInsufficient ? (
            <div className="flex flex-col items-center text-muted-foreground animate-in fade-in-50">
              <HelpCircle className="w-8 h-8 mb-1 opacity-70" />
              <span className="text-xs font-semibold">Insufficient Data</span>
              <span className="text-[10px] text-muted-foreground/80">Recalculate needed</span>
            </div>
          ) : (
            <div className="flex flex-col items-center animate-in zoom-in-90 duration-300">
              <span className="text-4xl font-extrabold tracking-tight tabular-nums text-foreground font-sans">
                {score?.toFixed(1)}
              </span>
              <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                out of 100
              </span>
            </div>
          )}
        </div>
      </div>

      {showBandBadge && (
        <div className="mt-2 flex flex-col items-center space-y-1">
          <Badge variant={bandConfig.badgeVariant} className="text-xs px-3 py-1 font-semibold">
            {bandConfig.label}
          </Badge>
          <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed mt-1">
            {bandConfig.description}
          </p>
        </div>
      )}
    </div>
  );
};
