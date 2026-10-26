import React from 'react';

interface TooltipPayloadItem {
  name: string;
  value: number | string | null;
  color?: string;
  dataKey?: string;
}

interface CustomChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  formatter?: (value: number | string | null, name: string) => [string, string];
}

export const CustomChartTooltip: React.FC<CustomChartTooltipProps> = ({
  active,
  payload,
  label,
  formatter,
}) => {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className="z-50 rounded-xl border border-border bg-card/95 backdrop-blur-md p-3 shadow-elevation text-xs text-foreground min-w-[160px] animate-in fade-in-0 zoom-in-95">
      {label && (
        <div className="font-semibold text-foreground border-b border-border/50 pb-1.5 mb-1.5">
          {label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const displayVal = formatter ? formatter(entry.value, entry.name)[0] : entry.value;
          const displayLabel = formatter ? formatter(entry.value, entry.name)[1] : entry.name;

          return (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color || 'hsl(var(--primary))' }}
                />
                <span className="text-muted-foreground truncate">{displayLabel}</span>
              </div>
              <span className="font-bold tabular-nums text-foreground">{displayVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
