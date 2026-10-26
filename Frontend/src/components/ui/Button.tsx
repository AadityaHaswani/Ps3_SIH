import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?:
    | 'default'
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'danger'
    | 'success'
    | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      asChild = false,
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';

    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]';

    const variantStyles = {
      default:
        'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm shadow-primary/20',
      primary:
        'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm shadow-primary/20',
      secondary:
        'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/50',
      outline:
        'border border-border bg-card hover:bg-muted text-foreground hover:border-muted-foreground/30 shadow-subtle',
      ghost:
        'hover:bg-muted text-muted-foreground hover:text-foreground',
      danger:
        'bg-danger text-danger-foreground hover:bg-danger/90 shadow-sm shadow-danger/20',
      success:
        'bg-success text-success-foreground hover:bg-success/90 shadow-sm shadow-success/20',
      link: 'text-primary underline-offset-4 hover:underline p-0 h-auto',
    };

    const sizeStyles = {
      default: 'h-10 px-4 py-2 text-sm',
      sm: 'h-8 rounded-md px-3 text-xs',
      lg: 'h-11 rounded-lg px-6 text-base font-semibold',
      icon: 'h-10 w-10 p-0',
    };

    return (
      <Comp
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{children}</span>
          </span>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';
