import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { systemApi, type CreateUserPayload } from '@/api/modules/system.api';
import { queryKeys } from '@/api/queryKeys';
import { X, UserPlus, Shield, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

const createUserSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Valid email address required'),
    role: z.enum([
      'PLATFORM_ADMIN',
      'AUTHORITY_ADMIN',
      'AUTHORITY_OFFICER',
      'INSTITUTION_ADMIN',
      'INSTITUTION_OPERATOR',
      'AUDITOR',
    ]),
    institutionId: z.string().optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  })
  .refine(
    (data) => {
      if (
        data.role === 'INSTITUTION_ADMIN' ||
        data.role === 'INSTITUTION_OPERATOR'
      ) {
        return (
          data.institutionId &&
          data.institutionId.trim().length === 24 &&
          /^[0-9a-fA-F]{24}$/.test(data.institutionId.trim())
        );
      }
      return true;
    },
    {
      message: 'A valid 24-character hexadecimal Institution ObjectId is required for institutional roles',
      path: ['institutionId'],
    }
  );

type CreateUserFormData = z.infer<typeof createUserSchema>;

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: 'INSTITUTION_OPERATOR',
      name: '',
      email: '',
      institutionId: '',
      password: '',
    },
  });

  const selectedRole = watch('role');
  const isInstitutionRole =
    selectedRole === 'INSTITUTION_ADMIN' || selectedRole === 'INSTITUTION_OPERATOR';

  const mutation = useMutation({
    mutationFn: (data: CreateUserPayload) => systemApi.createUser(data),
    onSuccess: (createdUser) => {
      toast.success(`User '${createdUser.name}' created successfully`, {
        description: 'Activation invitation email has been dispatched.',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      reset();
      onClose();
    },
    onError: (err: unknown) => {
      const errorMsg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
          : 'Failed to create user.';
      toast.error('User creation failed', { description: errorMsg });
    },
  });

  if (!isOpen) return null;

  const onSubmit = (formData: CreateUserFormData) => {
    const payload: CreateUserPayload = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      role: formData.role,
      ...(isInstitutionRole && formData.institutionId
        ? { institutionId: formData.institutionId.trim() }
        : {}),
      ...(formData.password && formData.password.trim()
        ? { password: formData.password.trim() }
        : {}),
    };
    mutation.mutate(payload);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Create Platform User</h2>
              <p className="text-xs text-muted-foreground">
                Provision a user account with RBAC permissions and institutional context.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Full Name *</label>
            <input
              type="text"
              placeholder="e.g. Dr. Ramesh Kumar"
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
            <label className="text-xs font-medium text-foreground block mb-1">Email Address *</label>
            <input
              type="email"
              placeholder="e.g. ramesh@institution.edu.in"
              {...register('email')}
              className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            />
            {errors.email && (
              <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Assigned Role *</label>
            <select
              {...register('role')}
              className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="INSTITUTION_OPERATOR">INSTITUTION_OPERATOR (Rosters & Ledger)</option>
              <option value="INSTITUTION_ADMIN">INSTITUTION_ADMIN (Institutional Admin)</option>
              <option value="AUTHORITY_OFFICER">AUTHORITY_OFFICER (Reviewer & Overlaps)</option>
              <option value="AUTHORITY_ADMIN">AUTHORITY_ADMIN (Regulatory Authority)</option>
              <option value="AUDITOR">AUDITOR (Read-only Independent Assurer)</option>
              <option value="PLATFORM_ADMIN">PLATFORM_ADMIN (Super Administrator)</option>
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
                Target Institution Mongo ObjectId *
              </label>
              <input
                type="text"
                placeholder="24-char hex ID (e.g. 60c72b2f9b1d8b001f8e4e1a)"
                {...register('institutionId')}
                className="w-full font-mono text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
              />
              {errors.institutionId && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.institutionId.message}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Required for scoping this user strictly to their college or university.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Initial Password (Optional)
            </label>
            <input
              type="password"
              placeholder="Leave blank to send invitation link"
              {...register('password')}
              className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            />
            {errors.password && (
              <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.password.message}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1">
              If left blank, user receives a single-use token to set their password securely.
            </p>
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <Shield className="w-4 h-4" />
              {mutation.isPending ? 'Provisioning...' : 'Provision User'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
