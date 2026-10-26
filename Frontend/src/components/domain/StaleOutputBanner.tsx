import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Can } from '@/auth/Can';
import { cn } from '@/lib/utils';
import { RevalidationStatus } from '@/types/enums';

interface StaleOutputBannerProps {
  isStale?: boolean;
  revalidationStatus?: RevalidationStatus;
  onRevalidate?: () => void;
  isRevalidating?: boolean;
  className?: string;
}

export const StaleOutputBanner: React.FC<StaleOutputBannerProps> = ({
  isStale = false,
  revalidationStatus = RevalidationStatus.NOT_STARTED,
  onRevalidate,
  isRevalidating = false,
  className,
}) => {
  if (!isStale) return null;

  return (
    <div
      className={cn(
        'rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-xs text-foreground flex items-center justify-between gap-3 shadow-subtle animate-in fade-in-50',
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-warning/20 text-warning-foreground dark:text-warning flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <span className="font-semibold text-foreground block">
            Stale — Based on Superseded Roster Version
          </span>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            A subsequent roster version has been committed for this academic year. Historical findings or scores should be recalculated.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="warning" className="text-[10px] py-0 px-2 uppercase">
          Status: {revalidationStatus}
        </Badge>

        {onRevalidate && (
          <Can permission="scorecards:recalculate">
            <Button
              size="sm"
              variant="outline"
              onClick={onRevalidate}
              isLoading={isRevalidating}
              className="h-7 text-xs border-warning/40 text-warning-foreground dark:text-warning hover:bg-warning/20"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Recalculate
            </Button>
          </Can>
        )}
      </div>
    </div>
  );
};
