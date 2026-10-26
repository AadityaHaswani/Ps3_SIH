import React from 'react';
import { useInstitutions } from '@/hooks/useInstitutions';
import { Building2, Check, ChevronDown, Shield } from 'lucide-react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

export const InstitutionSwitcher: React.FC = () => {
  const {
    institutions,
    currentInstitution,
    selectedInstitutionId,
    selectInstitution,
    hasMultipleInstitutions,
  } = useInstitutions();

  if (!currentInstitution) return null;

  if (!hasMultipleInstitutions) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/60 text-xs">
        <Building2 className="w-3.5 h-3.5 text-primary" />
        <span className="font-semibold text-foreground truncate max-w-[200px]">
          {currentInstitution.name}
        </span>
        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
          {currentInstitution.code}
        </Badge>
      </div>
    );
  }

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/80 bg-card hover:bg-muted/60 transition-all text-xs font-medium text-foreground shadow-subtle group focus-visible:ring-2 focus-visible:ring-ring'
          )}
          title="Switch Active Institutional Scope"
        >
          <Building2 className="w-3.5 h-3.5 text-primary group-hover:scale-105 transition-transform" />
          <div className="flex flex-col text-left">
            <span className="font-semibold text-foreground truncate max-w-[220px]">
              {currentInstitution.name}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              {currentInstitution.code} {currentInstitution.state && `• ${currentInstitution.state}`}
            </span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1 group-hover:text-foreground transition-colors" />
        </button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 w-80 rounded-xl border border-border bg-card p-1.5 shadow-elevation animate-in fade-in-0 zoom-in-95"
        >
          <div className="px-3 py-2 border-b border-border/50 mb-1">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-primary" />
              Institutional Scope Switcher
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Select an institution to inspect its seat ledger, audit trail, and reliability scorecard.
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {institutions.map((inst) => {
              const isSelected = inst.id === selectedInstitutionId;
              return (
                <DropdownMenuPrimitive.Item
                  key={inst.id}
                  onSelect={() => selectInstitution(inst.id)}
                  className={cn(
                    'flex items-start justify-between p-2.5 rounded-lg text-xs cursor-pointer outline-none transition-colors select-none',
                    isSelected
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'hover:bg-muted/70 text-foreground'
                  )}
                >
                  <div className="flex flex-col">
                    <span className="truncate max-w-[220px]">{inst.name}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {inst.code} {inst.state && `(${inst.state})`}
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
                </DropdownMenuPrimitive.Item>
              );
            })}
          </div>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
};
