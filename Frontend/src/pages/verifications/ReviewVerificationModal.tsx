import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { systemApi, type ReviewVerificationPayload } from '@/api/modules/system.api';
import { queryKeys } from '@/api/queryKeys';
import { X, CheckCircle, XCircle, AlertTriangle, FileText, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import type { VerificationRecord } from '@/types/models';

const reviewVerificationSchema = z.object({
  action: z.enum(['CONFIRM', 'REJECT', 'CONFLICT']),
  evidenceRef: z.string().optional(),
  notes: z.string().min(5, 'Review justification notes must be at least 5 characters'),
});

type ReviewVerificationFormData = z.infer<typeof reviewVerificationSchema>;

interface ReviewVerificationModalProps {
  record: VerificationRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReviewVerificationModal: React.FC<ReviewVerificationModalProps> = ({
  record,
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ReviewVerificationFormData>({
    resolver: zodResolver(reviewVerificationSchema),
    defaultValues: {
      action: 'CONFIRM',
      evidenceRef: '',
      notes: '',
    },
  });

  const selectedAction = watch('action');

  const mutation = useMutation({
    mutationFn: (payload: ReviewVerificationPayload) => {
      if (!record) throw new Error('No record selected');
      return systemApi.reviewVerification(record._id, payload);
    },
    onSuccess: (updated) => {
      toast.success('Verification decision recorded', {
        description: `Status updated to ${updated.status}`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.verifications.all });
      reset();
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message
          : 'Failed to record review decision.';
      toast.error('Review failed', { description: msg });
    },
  });

  if (!isOpen || !record) return null;

  const onSubmit = (formData: ReviewVerificationFormData) => {
    mutation.mutate({
      action: formData.action,
      notes: formData.notes.trim(),
      evidenceRef: formData.evidenceRef?.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Review Verification Evidence
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Subject: {record.subjectId} ({record.fieldPath})
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>

        {/* Snapshot Summary */}
        <div className="p-6 pb-0">
          <div className="p-3.5 rounded-xl border border-border bg-muted/30 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px]">Subject Type</span>
              <span className="font-semibold text-foreground">{record.subjectType}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Snapshot Value</span>
              <span className="font-mono font-semibold text-foreground">
                {String(record.valueSnapshot)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Current Label</span>
              <span className="font-mono text-primary">{record.label}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Source Mode</span>
              <span className="font-mono text-foreground">{record.sourceMode}</span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-2">
              Review Determination *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  selectedAction === 'CONFIRM'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  value="CONFIRM"
                  {...register('action')}
                  className="sr-only"
                />
                <CheckCircle className="w-4 h-4 mb-1" />
                CONFIRM
              </label>

              <label
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  selectedAction === 'REJECT'
                    ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  value="REJECT"
                  {...register('action')}
                  className="sr-only"
                />
                <XCircle className="w-4 h-4 mb-1" />
                REJECT
              </label>

              <label
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  selectedAction === 'CONFLICT'
                    ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <input
                  type="radio"
                  value="CONFLICT"
                  {...register('action')}
                  className="sr-only"
                />
                <AlertTriangle className="w-4 h-4 mb-1" />
                CONFLICT
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Evidence Reference (Optional)
            </label>
            <div className="relative">
              <FileText className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="e.g. AICTE Approval Letter Ref: AICTE/2024/0912"
                {...register('evidenceRef')}
                className="w-full text-xs rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Official Review Notes * (min 5 characters)
            </label>
            <textarea
              rows={3}
              placeholder="State the regulatory basis and evidentiary justification for this verification decision..."
              {...register('notes')}
              className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            />
            {errors.notes && (
              <p className="text-[11px] text-destructive mt-1">
                {errors.notes.message}
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <Check className="w-4 h-4" />
              {mutation.isPending ? 'Recording...' : 'Commit Determination'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
