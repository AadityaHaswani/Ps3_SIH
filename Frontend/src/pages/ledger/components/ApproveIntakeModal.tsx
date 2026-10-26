import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ledgerApi } from '../../../api/modules/ledger.api';
import { queryKeys } from '../../../api/queryKeys';
import { ShieldCheck, AlertCircle } from 'lucide-react';

const approveSchema = z.object({
  institutionId: z.string().min(1, 'Institution ID is required'),
  programmeCode: z.string().min(2, 'Programme code is required').toUpperCase(),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, 'Academic year must be formatted as YYYY-YY (e.g. 2024-25)'),
  seatCategory: z.string().min(1, 'Category is required').toUpperCase(),
  approvedIntake: z.coerce.number().int().nonnegative('Intake must be a non-negative integer'),
  sourceRef: z.string().optional(),
  verificationStatus: z.string().default('AUTHORITY_VERIFIED'),
  sourceMode: z.enum(['SIMULATED', 'LIVE']).default('SIMULATED'),
});

type ApproveFormData = z.infer<typeof approveSchema>;

interface ApproveIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionId: string;
  defaultProgramme?: string;
  defaultAcademicYear?: string;
  defaultCategory?: string;
  currentApprovedIntake?: number | null;
}

export const ApproveIntakeModal: React.FC<ApproveIntakeModalProps> = ({
  isOpen,
  onClose,
  institutionId,
  defaultProgramme = '',
  defaultAcademicYear = '2024-25',
  defaultCategory = 'ALL',
  currentApprovedIntake = 60,
}) => {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApproveFormData>({
    resolver: zodResolver(approveSchema),
    defaultValues: {
      institutionId,
      programmeCode: defaultProgramme,
      academicYear: defaultAcademicYear,
      seatCategory: defaultCategory,
      approvedIntake: currentApprovedIntake ?? 60,
      sourceRef: 'AICTE-APPROVAL-2024/APP-09',
      verificationStatus: 'AUTHORITY_VERIFIED',
      sourceMode: 'SIMULATED',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ApproveFormData) => ledgerApi.updateApprovedIntake(data),
    onSuccess: (res) => {
      toast.success(
        res.isReplay
          ? 'Authority intake update replayed (idempotent).'
          : 'Approved intake successfully committed by Regulatory Authority.'
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.seatLedger.all });
      reset();
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to update intake';
      setErrorMsg(msg);
    },
  });

  const onSubmit = (data: ApproveFormData) => {
    setErrorMsg(null);
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
            Set Regulatory Approved Intake
          </DialogTitle>
          <DialogDescription>
            Authorize official sanction capacity for this programme bucket. Authoritative allocations establish the legal ceiling for occupancy checks.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-md flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <input type="hidden" {...register('institutionId')} value={institutionId} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Programme Code</label>
              <Input
                placeholder="e.g. CS-BTECH"
                {...register('programmeCode')}
                className="uppercase font-mono"
              />
              {errors.programmeCode && (
                <p className="text-rose-400 text-xs mt-1">{errors.programmeCode.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Academic Year</label>
              <Input placeholder="2024-25" {...register('academicYear')} className="font-mono" />
              {errors.academicYear && (
                <p className="text-rose-400 text-xs mt-1">{errors.academicYear.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Category</label>
              <select
                {...register('seatCategory')}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="ALL">ALL (Aggregated)</option>
                <option value="GENERAL">GENERAL</option>
                <option value="OBC">OBC</option>
                <option value="SC">SC</option>
                <option value="ST">ST</option>
                <option value="EWS">EWS</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Approved Intake</label>
              <Input
                type="number"
                min="0"
                placeholder="60"
                {...register('approvedIntake')}
              />
              {errors.approvedIntake && (
                <p className="text-rose-400 text-xs mt-1">{errors.approvedIntake.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">Official Approval Reference Order</label>
            <Input
              placeholder="e.g. AICTE/AB/2024/098"
              {...register('sourceRef')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Verification Status</label>
              <select
                {...register('verificationStatus')}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="AUTHORITY_VERIFIED">AUTHORITY_VERIFIED</option>
                <option value="AUTHORITY_VERIFIED_SIMULATED">AUTHORITY_VERIFIED_SIMULATED</option>
                <option value="CROSS_REGISTER_CONFIRMED">CROSS_REGISTER_CONFIRMED</option>
                <option value="DOCUMENT_SUPPORTED">DOCUMENT_SUPPORTED</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Source Mode</label>
              <select
                {...register('sourceMode')}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="SIMULATED">SIMULATED (Evaluation)</option>
                <option value="LIVE">LIVE (Statutory)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Committing...' : 'Commit Regulatory Approval'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
