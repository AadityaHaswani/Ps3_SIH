import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/auth';
import { cn } from '@/lib/utils';
import {
  Award,
  Layers,
  GitCompare,
  FileSearch,
  FileCheck2,
  ArrowLeftRight,
  GitFork,
  CheckCircle2,
  Link2,
  History,
  Users2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
  permissions?: string[];
  badge?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) => {
  const { user } = useAuth();

  const navItems: NavItem[] = [
    {
      label: 'Reliability Scorecard',
      to: '/scorecard',
      icon: Award,
      permissions: ['scorecards:read'],
      badge: 'Hero',
    },
    {
      label: 'Seat Matrix & Ledger',
      to: '/seat-ledger',
      icon: Layers,
      permissions: ['seat-ledger:read'],
    },
    {
      label: 'Reconciliation Runs',
      to: '/reconciliations',
      icon: GitCompare,
      permissions: ['reconciliation:read'],
    },
    {
      label: 'Findings & Review',
      to: '/findings',
      icon: FileSearch,
      permissions: ['findings:review', 'reconciliation:read'],
    },
    {
      label: 'Rosters & Integrity',
      to: '/rosters',
      icon: FileCheck2,
      permissions: ['roster-versions:read', 'rosters:upload'],
    },
    {
      label: 'Student Transfers',
      to: '/transfers',
      icon: ArrowLeftRight,
      permissions: ['transfers:read'],
    },
    {
      label: 'Overlap Cases',
      to: '/overlaps',
      icon: GitFork,
      permissions: ['overlap:read'],
    },
    {
      label: 'Assurance Sampling',
      to: '/sampling',
      icon: CheckCircle2,
      permissions: ['sampling:read'],
    },
    {
      label: 'Field Verifications',
      to: '/verifications',
      icon: ShieldCheck,
      permissions: ['verification:read'],
    },
    {
      label: 'Registry Connectors',
      to: '/connectors',
      icon: Link2,
      permissions: ['connectors:read'],
    },
    {
      label: 'Audit Trail',
      to: '/audit',
      icon: History,
      permissions: ['audit:read'],
    },
    {
      label: 'Platform Users',
      to: '/admin/users',
      icon: Users2,
      permissions: ['users:read'],
    },
  ];

  const visibleItems = navItems.filter((item) => {
    if (!item.permissions || item.permissions.length === 0) return true;
    return item.permissions.some((p) => user?.permissions?.includes(p));
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          'fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-border/80 bg-card transition-all duration-300 ease-in-out',
          collapsed ? 'w-20' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border/80">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm shadow-primary/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-base text-foreground tracking-tight flex items-center gap-1.5">
                  SeatSeal
                  <span className="text-[9px] font-semibold text-primary uppercase tracking-wider bg-primary/10 px-1.5 py-0.5 rounded">
                    PS3
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground font-medium truncate">
                  Every Seat Is Seal
                </span>
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="hidden lg:flex w-7 h-7 text-muted-foreground hover:text-foreground"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all group select-none',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 font-semibold'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-transform group-hover:scale-110',
                        isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'
                      )}
                    />
                    {!collapsed && (
                      <span className="truncate flex-1 flex items-center justify-between">
                        <span>{item.label}</span>
                        {item.badge && (
                          <span
                            className={cn(
                              'text-[9px] px-1.5 py-0.2 rounded-full uppercase font-bold tracking-wider',
                              isActive
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : 'bg-primary/10 text-primary'
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer info in Sidebar */}
        {!collapsed && (
          <div className="p-3 border-t border-border/80 m-3 rounded-xl bg-muted/40 text-[11px] text-muted-foreground flex flex-col gap-1">
            <div className="flex items-center justify-between font-medium text-foreground">
              <span>Integrity Anchor</span>
              <span className="text-success text-[10px] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                Ed25519 Sealed
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
              SIH 2026 PS3 Standard Compliance Edition
            </p>
          </div>
        )}
      </aside>
    </>
  );
};
