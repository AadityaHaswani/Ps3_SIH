import React from 'react';

interface FeaturePlaceholderProps {
  title: string;
  subtitle: string;
}

export const FeaturePlaceholder: React.FC<FeaturePlaceholderProps> = ({
  title,
  subtitle,
}) => (
  <div className="p-8 border border-border/80 rounded-2xl bg-card text-center space-y-3 shadow-subtle">
    <h2 className="text-lg font-bold text-foreground">{title}</h2>
    <p className="text-xs text-muted-foreground max-w-md mx-auto">{subtitle}</p>
    <div className="pt-2">
      <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
        Feature Phase in Active Development
      </span>
    </div>
  </div>
);
