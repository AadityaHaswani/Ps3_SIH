import React from 'react';
import { useTheme } from '@/hooks/useTheme';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const ThemeToggle: React.FC = () => {
  const { toggleTheme, isDark } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground"
      aria-label="Toggle theme mode"
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-warning animate-in zoom-in-75 duration-200" />
      ) : (
        <Moon className="w-4 h-4 text-muted-foreground animate-in zoom-in-75 duration-200" />
      )}
    </Button>
  );
};
