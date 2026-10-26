import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { systemApi, type UserFilters } from '@/api/modules/system.api';
import { queryKeys } from '@/api/queryKeys';
import { useAuth, Can } from '@/auth';
import {
  Users2,
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Mail,
  Edit2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Shield,
  Building,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CreateUserModal } from './CreateUserModal';
import { EditUserModal } from './EditUserModal';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { User } from '@/types/models';

const ROLE_OPTIONS = [
  'ALL',
  'PLATFORM_ADMIN',
  'AUTHORITY_ADMIN',
  'AUTHORITY_OFFICER',
  'INSTITUTION_ADMIN',
  'INSTITUTION_OPERATOR',
  'AUDITOR',
];

export const UserManagementPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const activeFilters: UserFilters = {
    page,
    limit: 20,
    ...(roleFilter !== 'ALL' ? { role: roleFilter } : {}),
    ...(activeFilter !== 'ALL' ? { isActive: activeFilter === 'ACTIVE' } : {}),
  };

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: queryKeys.users.list(activeFilters as Record<string, unknown>),
    queryFn: () => systemApi.listUsers(activeFilters),
  });

  const resendMutation = useMutation({
    mutationFn: (userId: string) => systemApi.resendActivation(userId),
    onSuccess: () => {
      toast.success('Activation invitation email sent successfully');
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
          : 'Failed to send activation email.';
      toast.error('Could not resend activation', { description: msg });
    },
  });

  const users = data?.items || [];
  const pagination = data?.pagination;

  // Filter client-side by name / email if search input is provided
  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'PLATFORM_ADMIN':
        return <Badge variant="secondary" size="sm">PLATFORM ADMIN</Badge>;
      case 'AUTHORITY_ADMIN':
      case 'AUTHORITY_OFFICER':
        return <Badge variant="default" size="sm">{role.replace('_', ' ')}</Badge>;
      case 'AUDITOR':
        return <Badge variant="warning" size="sm">AUDITOR</Badge>;
      case 'INSTITUTION_ADMIN':
      case 'INSTITUTION_OPERATOR':
        return <Badge variant="outline" size="sm">{role.replace('_', ' ')}</Badge>;
      default:
        return <Badge variant="outline" size="sm">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Users2 className="w-6 h-6 text-primary" />
            Platform User Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Role-Based Access Control (RBAC), institutional context scoping, and account activations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Can permission="users:create">
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Add User
            </Button>
          </Can>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5" />
          User Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Search by Name or Email
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Role
            </label>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Account Status
            </label>
            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Institution Context</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Activation</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading platform user accounts...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Users2 className="w-8 h-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                    <p className="font-medium text-foreground">No user accounts found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Adjust your filters or add a new user.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = currentUser?.email === u.email;

                  return (
                    <tr key={u._id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {u.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              {u.name}
                              {isCurrent && (
                                <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.2 rounded">
                                  You
                                </span>
                              )}
                            </span>
                            <span className="text-muted-foreground text-[11px] block">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{getRoleBadge(u.role)}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {u.institutionId ? (
                          <span className="font-mono text-xs flex items-center gap-1.5 text-foreground">
                            <Building className="w-3.5 h-3.5 text-muted-foreground" />
                            {u.institutionId.slice(0, 10)}...
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">
                            Platform-Wide
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {u.isActivated ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-success font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Activated
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            Pending Activation
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-muted-foreground text-[11px]">
                        {u.lastLoginAt
                          ? format(new Date(u.lastLoginAt), 'MMM d, yyyy')
                          : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!u.isActivated && (
                            <Can permission="users:create">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => resendMutation.mutate(u._id)}
                                disabled={resendMutation.isPending}
                                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                title="Resend Activation Email"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Resend</span>
                              </Button>
                            </Can>
                          )}

                          <Can permission="users:update">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingUser(u)}
                              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Edit</span>
                            </Button>
                          </Can>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-muted/20">
            <span>
              Showing {filteredUsers.length} of {pagination.total} users (Page {pagination.page} of{' '}
              {pagination.totalPages})
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="h-7 text-xs gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateUserModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />

      <EditUserModal
        user={editingUser}
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
      />
    </div>
  );
};
