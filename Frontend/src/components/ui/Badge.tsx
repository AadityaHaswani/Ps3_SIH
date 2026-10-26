import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | 'default'
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'success'
    | 'verified'
    | 'warning'
    | 'danger'
    | 'destructive'
    | 'info'
    | 'simulated';
  size?: 'sm' | 'md' | 'lg';
}

export function Badge({ className, variant = 'default', size = 'sm', ...props }: BadgeProps) {
  const variantStyles = {
    default: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20',
    primary: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20',
    secondary: 'bg-secondary text-secondary-foreground border-border hover:bg-secondary/80',
    outline: 'border border-border text-foreground hover:bg-muted',
    success: 'bg-success/10 text-success border-success/30 hover:bg-success/20',
    verified: 'bg-success/10 text-success border-success/30 hover:bg-success/20',
    warning: 'bg-warning/15 text-warning-foreground dark:text-warning border-warning/40 hover:bg-warning/25',
    danger: 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20',
    destructive: 'bg-danger/10 text-danger border-danger/30 hover:bg-danger/20',
    info: 'bg-info/10 text-info border-info/30 hover:bg-info/20',
    simulated: 'bg-simulated/15 text-simulated border-simulated/30 font-mono tracking-wider',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
