import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { systemApi, type UpdateUserPayload } from '@/api/modules/system.api';
import { queryKeys } from '@/api/queryKeys';
import { X, ShieldAlert, AlertCircle, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import type { User } from '@/types/models';

const editUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum([
    'PLATFORM_ADMIN',
    'AUTHORITY_ADMIN',
    'AUTHORITY_OFFICER',
    'INSTITUTION_ADMIN',
    'INSTITUTION_OPERATOR',
    'AUDITOR',
  ]),
  institutionId: z.string().optional(),
  isActive: z.boolean(),
});

type EditUserFormData = z.infer<typeof editUserSchema>;

interface EditUserModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({ user, isOpen, onClose }) => {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: '',
      role: 'INSTITUTION_OPERATOR',
      institutionId: '',
      isActive: true,
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        role: user.role as EditUserFormData['role'],
        institutionId: user.institutionId || '',
        isActive: user.isActive,
      });
    }
  }, [user, reset]);

  const selectedRole = watch('role');
  const isInstitutionRole =
    selectedRole === 'INSTITUTION_ADMIN' || selectedRole === 'INSTITUTION_OPERATOR';

  const mutation = useMutation({
    mutationFn: (data: UpdateUserPayload) => {
      if (!user) throw new Error('No user selected');
      return systemApi.updateUser(user._id, data);
    },
    onSuccess: (updated) => {
      toast.success(`User '${updated.name}' updated successfully`, {
        description: 'Session tokens invalidated if security privileges changed.',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      onClose();
    },
    onError: (err: unknown) => {
      const errorMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
          : 'Failed to update user.';
      toast.error('Update failed', { description: errorMsg });
    },
  });

  if (!isOpen || !user) return null;

  const onSubmit = (formData: EditUserFormData) => {
    const payload: UpdateUserPayload = {
      name: formData.name.trim(),
      role: formData.role,
      institutionId: isInstitutionRole && formData.institutionId?.trim() ? formData.institutionId.trim() : null,
      isActive: formData.isActive,
    };
    mutation.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Edit User Account</h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {user.email} (ID: {user._id})
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Full Name</label>
            <input
              type="text"
              {...register('name')}
              className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            />
            {errors.name && (
              <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Assigned Role</label>
            <select
              {...register('role')}
              className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="INSTITUTION_OPERATOR">INSTITUTION_OPERATOR</option>
              <option value="INSTITUTION_ADMIN">INSTITUTION_ADMIN</option>
              <option value="AUTHORITY_OFFICER">AUTHORITY_OFFICER</option>
              <option value="AUTHORITY_ADMIN">AUTHORITY_ADMIN</option>
              <option value="AUDITOR">AUDITOR</option>
              <option value="PLATFORM_ADMIN">PLATFORM_ADMIN</option>
            </select>
            {errors.role && (
              <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.role.message}
              </p>
            )}
          </div>

          {isInstitutionRole && (
            <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2">
              <label className="text-xs font-medium text-foreground block">
                Target Institution Mongo ObjectId
              </label>
              <input
                type="text"
                placeholder="24-char hex ID"
                {...register('institutionId')}
                className="w-full font-mono text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
          )}

          {/* Account Status Switch */}
          <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground block">Account Status</span>
              <span className="text-[11px] text-muted-foreground">
                Disabling the account revokes all active refresh tokens immediately.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                {...register('isActive')}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Sole Admin Protection:</strong> System safeguards prevent demoting or disabling the platform's last active super administrator.
            </span>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <Save className="w-4 h-4" />
              {mutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
