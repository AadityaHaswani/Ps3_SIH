import React, { useState } from 'react';
import { useAuth } from '@/auth';
import { useIsAuditor } from '@/auth/usePermission';
import { authApi } from '@/api/modules/auth.api';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import {
  LogOut,
  KeyRound,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { toast } from 'sonner';

export const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const isAuditor = useIsAuditor();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!user) return null;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      toast.success('Password updated successfully. Please sign in again with your new password.');
      setChangePasswordOpen(false);
      await logout();
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
        'Failed to change password. Please verify current password.';
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DropdownMenuPrimitive.Root>
        <DropdownMenuPrimitive.Trigger asChild>
          <button
            className="flex items-center gap-2 p-1.5 rounded-xl border border-border/60 hover:bg-muted/60 transition-all focus-visible:ring-2 focus-visible:ring-ring outline-none"
            aria-label="User account menu"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center justify-center">
              {getInitials(user.name)}
            </div>
            <div className="hidden md:flex flex-col text-left mr-1">
              <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                {user.name}
              </span>
              <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                {user.role}
              </span>
            </div>
          </button>
        </DropdownMenuPrimitive.Trigger>

        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align="end"
            sideOffset={8}
            className="z-50 w-64 rounded-xl border border-border bg-card p-2 shadow-elevation animate-in fade-in-0 zoom-in-95"
          >
            <div className="px-3 py-2 border-b border-border/50 mb-1">
              <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user.email}</p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                  {user.role}
                </Badge>
                {isAuditor && (
                  <Badge variant="warning" className="text-[10px] py-0 px-1.5 gap-1">
                    <Eye className="w-2.5 h-2.5" />
                    Read-only access
                  </Badge>
                )}
                {user.dataMode === 'DEMO' && (
                  <Badge variant="simulated" className="text-[10px] py-0 px-1.5">
                    Demo Mode
                  </Badge>
                )}
              </div>
            </div>

            <DropdownMenuPrimitive.Item
              onSelect={() => setChangePasswordOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-foreground hover:bg-muted cursor-pointer outline-none transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Change Password</span>
            </DropdownMenuPrimitive.Item>

            <DropdownMenuPrimitive.Separator className="h-px bg-border/50 my-1" />

            <DropdownMenuPrimitive.Item
              onSelect={logout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-danger hover:bg-danger/10 cursor-pointer outline-none transition-colors font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </DropdownMenuPrimitive.Item>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Change Account Password
            </DialogTitle>
            <DialogDescription>
              Update your account password. For regulatory compliance, changing your password invalidates active sessions and requires signing back in.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleChangePassword} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Current Password
              </label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                New Password (minimum 8 characters)
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new strong password"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Confirm New Password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                minLength={8}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setChangePasswordOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                Update Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
