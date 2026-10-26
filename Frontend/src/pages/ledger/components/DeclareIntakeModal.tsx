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
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const declareSchema = z.object({
  programmeCode: z.string().min(2, 'Programme code is required').toUpperCase(),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, 'Academic year must be formatted as YYYY-YY (e.g. 2024-25)'),
  seatCategory: z.string().min(1, 'Category is required').toUpperCase(),
  declaredIntake: z.coerce.number().int().nonnegative('Intake must be a non-negative integer'),
});

type DeclareFormData = z.infer<typeof declareSchema>;

interface DeclareIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionId?: string;
  defaultProgramme?: string;
  defaultAcademicYear?: string;
}

export const DeclareIntakeModal: React.FC<DeclareIntakeModalProps> = ({
  isOpen,
  onClose,
  institutionId,
  defaultProgramme = '',
  defaultAcademicYear = '2024-25',
}) => {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DeclareFormData>({
    resolver: zodResolver(declareSchema),
    defaultValues: {
      programmeCode: defaultProgramme,
      academicYear: defaultAcademicYear,
      seatCategory: 'GENERAL',
      declaredIntake: 60,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: DeclareFormData) =>
      ledgerApi.declareIntake({
        ...data,
        institutionId,
      }),
    onSuccess: (res) => {
      toast.success(
        res.isReplay
          ? 'Intake declaration replayed (idempotent submission).'
          : 'Intake capacity declared successfully. Marked as INTAKE_UNVERIFIED pending validation.'
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.seatLedger.all });
      reset();
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to submit declaration';
      setErrorMsg(msg);
    },
  });

  const onSubmit = (data: DeclareFormData) => {
    setErrorMsg(null);
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            Declare Intake Capacity
          </DialogTitle>
          <DialogDescription>
            Self-declare the approved student intake for a programme cohort. Declared capacities remain provisional (<span className="text-amber-400 font-medium">INTAKE_UNVERIFIED</span>) until cross-referenced with authority records.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-md flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Academic Year</label>
              <Input placeholder="2024-25" {...register('academicYear')} className="font-mono" />
              {errors.academicYear && (
                <p className="text-rose-400 text-xs mt-1">{errors.academicYear.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Seat Category</label>
              <select
                {...register('seatCategory')}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="GENERAL">GENERAL</option>
                <option value="OBC">OBC</option>
                <option value="SC">SC</option>
                <option value="ST">ST</option>
                <option value="EWS">EWS</option>
                <option value="ALL">ALL (Aggregated)</option>
              </select>
              {errors.seatCategory && (
                <p className="text-rose-400 text-xs mt-1">{errors.seatCategory.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">Declared Intake Capacity</label>
            <Input
              type="number"
              min="0"
              placeholder="60"
              {...register('declaredIntake')}
            />
            {errors.declaredIntake && (
              <p className="text-rose-400 text-xs mt-1">{errors.declaredIntake.message}</p>
            )}
          </div>

          <div className="p-3 bg-slate-950/60 rounded-md border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">Auditable Action:</span> Submitting creates an immutable <span className="font-mono text-indigo-300">INTAKE_SET</span> entry in the institutional seat ledger with replay-protected idempotency.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Submitting...' : 'Submit Declaration'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
