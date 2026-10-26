import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DisclaimerBannerProps {
  customText?: string;
  className?: string;
}

export const MANDATORY_DISCLAIMER_TEXT =
  'The Institutional Data Reliability Scorecard measures the reliability and completeness of reported data and helps identify support needs. It is not a misconduct verdict or a measure of overall institutional quality.';

export const DisclaimerBanner: React.FC<DisclaimerBannerProps> = ({
  customText,
  className,
}) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground flex items-start gap-3 shadow-subtle',
        className
      )}
      role="note"
      aria-label="Institutional reliability scorecard regulatory disclaimer"
    >
      <div className="w-5 h-5 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
        <Info className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 space-y-0.5">
        <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider block">
          Regulatory Notice & Methodological Scope
        </span>
        <p className="leading-relaxed text-foreground/90">
          {customText || MANDATORY_DISCLAIMER_TEXT}
        </p>
      </div>
    </div>
  );
};
