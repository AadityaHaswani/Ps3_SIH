import React from 'react';
import { BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChartEmptyStateProps {
  message: string;
  subMessage?: string;
  className?: string;
}

export const ChartEmptyState: React.FC<ChartEmptyStateProps> = ({
  message,
  subMessage,
  className,
}) => {
  return (
    <div
      className={cn(
        'h-64 w-full flex flex-col items-center justify-center p-6 text-center rounded-xl bg-muted/20 border border-dashed border-border/70',
        className
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-muted/50 text-muted-foreground flex items-center justify-center mb-2.5">
        <BarChart2 className="w-5 h-5" />
      </div>
      <p className="text-xs font-semibold text-foreground max-w-sm leading-relaxed">
        {message}
      </p>
      {subMessage && (
        <p className="text-[11px] text-muted-foreground mt-1 max-w-xs leading-relaxed">
          {subMessage}
        </p>
      )}
    </div>
  );
};
