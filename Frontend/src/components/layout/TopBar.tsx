import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { InstitutionSwitcher } from './InstitutionSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router-dom';

interface TopBarProps {
  onToggleMobileSidebar: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleMobileSidebar }) => {
  return (
    <header className="sticky top-0 z-30 h-16 w-full border-b border-border/80 bg-card/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between transition-colors">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMobileSidebar}
          className="lg:hidden w-9 h-9 text-muted-foreground"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Institution Scope Switcher */}
        <InstitutionSwitcher />
      </div>

      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Quick Connectors Health link */}
        <Link
          to="/connectors"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 border border-success/20 text-success text-[11px] font-medium hover:bg-success/20 transition-colors"
          title="Upstream Registries: Operational"
        >
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span>Connectors Online</span>
        </Link>

        {/* Notifications Icon Button */}
        <Button
          variant="ghost"
          size="icon"
          className="relative w-9 h-9 text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
          title="Notifications & System Advisories"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
        </Button>

        {/* Theme Mode Toggle */}
        <ThemeToggle />

        <div className="h-5 w-px bg-border/80 mx-0.5" />

        {/* User Account Menu */}
        <UserMenu />
      </div>
    </header>
  );
};
