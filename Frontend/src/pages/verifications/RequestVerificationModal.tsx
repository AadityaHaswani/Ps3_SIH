import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { systemApi, type RequestVerificationPayload } from '@/api/modules/system.api';
import { queryKeys } from '@/api/queryKeys';
import { useAuth } from '@/auth';
import { X, Send, AlertCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

const requestVerificationSchema = z.object({
  subjectType: z.string().min(1, 'Subject type is required'),
  subjectId: z.string().min(1, 'Subject ID is required'),
  fieldPath: z.string().min(1, 'Field path is required'),
  connectorId: z.string().min(1, 'Connector gateway is required'),
  value: z.string().min(1, 'Declared value snapshot is required'),
  institutionId: z.string().min(1, 'Institution ID is required'),
});

type RequestVerificationFormData = z.infer<typeof requestVerificationSchema>;

interface RequestVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RequestVerificationModal: React.FC<RequestVerificationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RequestVerificationFormData>({
    resolver: zodResolver(requestVerificationSchema),
    defaultValues: {
      subjectType: 'SEAT_INTAKE',
      subjectId: '',
      fieldPath: 'approvedIntake',
      connectorId: 'mock-authority-intake',
      value: '',
      institutionId: user?.institutionId || '',
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: RequestVerificationPayload) =>
      systemApi.requestVerification(payload),
    onSuccess: (result) => {
      toast.success('Verification request dispatched', {
        description: `Label resolved: ${result.label || 'PENDING'}`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.verifications.all });
      reset();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
          : 'Failed to request verification.';
      toast.error('Verification failed', { description: msg });
    },
  });

  if (!isOpen) return null;

  const onSubmit = (formData: RequestVerificationFormData) => {
    const payload: RequestVerificationPayload = {
      subjectType: formData.subjectType,
      subjectId: formData.subjectId.trim(),
      fieldPath: formData.fieldPath.trim(),
      connectorId: formData.connectorId.trim(),
      value: isNaN(Number(formData.value)) ? formData.value.trim() : Number(formData.value),
      institutionId: formData.institutionId.trim(),
      idempotencyKey: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
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
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Request Field Verification
              </h2>
              <p className="text-xs text-muted-foreground">
                Dispatch an upstream automated verification probe against registered authorities.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Subject Type *
              </label>
              <select
                {...register('subjectType')}
                className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
              >
                <option value="SEAT_INTAKE">Seat Intake Allocation</option>
                <option value="STUDENT_ROSTER">Student Roster Enrollment</option>
                <option value="EXAM_REGISTRATION">Exam Registration Record</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Connector Gateway *
              </label>
              <select
                {...register('connectorId')}
                className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
              >
                <option value="mock-authority-intake">Mock Authority Intake (AICTE)</option>
                <option value="admission-register">Admission Register (Counselling)</option>
                <option value="exam-board">Exam Board Gateway</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Subject Identifier (ID / Key) *
            </label>
            <input
              type="text"
              placeholder="e.g. BTECH_CSE_2024_OPEN or student token"
              {...register('subjectId')}
              className="w-full text-xs font-mono rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            />
            {errors.subjectId && (
              <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.subjectId.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Field Path *
              </label>
              <input
                type="text"
                {...register('fieldPath')}
                className="w-full text-xs font-mono rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Value Snapshot *
              </label>
              <input
                type="text"
                placeholder="e.g. 120 (seats) or token"
                {...register('value')}
                className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
              />
              {errors.value && (
                <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {errors.value.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Institution ID *
            </label>
            <input
              type="text"
              placeholder="24-char hex ID"
              {...register('institutionId')}
              className="w-full text-xs font-mono rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            />
            {errors.institutionId && (
              <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.institutionId.message}
              </p>
            )}
          </div>

          <div className="p-3 rounded-xl bg-muted/30 border border-border text-[11px] text-muted-foreground leading-relaxed">
            Note: Requests via simulated connectors will automatically resolve with{' '}
            <strong className="text-foreground">AUTHORITY_VERIFIED_SIMULATED</strong> assurance label.
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <Send className="w-4 h-4" />
              {mutation.isPending ? 'Requesting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
