import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { transferApi } from '../../../api/modules/transfer.api';
import { queryKeys } from '../../../api/queryKeys';
import { ArrowLeftRight, AlertCircle } from 'lucide-react';

const transferSchema = z.object({
  studentTokenId: z.string().optional(),
  studentRef: z.string().min(2, 'Student reference is required'),
  sendingInstitutionId: z.string().min(1, 'Sending institution is required'),
  sendingProgrammeCode: z.string().min(2, 'Sending programme is required').toUpperCase(),
  receivingInstitutionId: z.string().min(1, 'Receiving institution is required'),
  receivingProgrammeCode: z.string().min(2, 'Receiving programme is required').toUpperCase(),
  academicYear: z.string().regex(/^\d{4}-\d{2}$/, 'Academic year must be YYYY-YY (e.g. 2024-25)'),
  seatCategory: z.string().default('GENERAL'),
});

type TransferFormData = z.infer<typeof transferSchema>;

interface InitiateTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultInstitutionId: string;
}

export const InitiateTransferModal: React.FC<InitiateTransferModalProps> = ({
  isOpen,
  onClose,
  defaultInstitutionId,
}) => {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      sendingInstitutionId: defaultInstitutionId,
      sendingProgrammeCode: 'CS-BTECH',
      receivingInstitutionId: 'SIT-DEMO-02',
      receivingProgrammeCode: 'CS-BTECH',
      academicYear: '2024-25',
      seatCategory: 'GENERAL',
      studentRef: 'STU-LATERAL-009',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: TransferFormData) => transferApi.createTransfer(data),
    onSuccess: (res) => {
      toast.success(
        res.isReplay
          ? 'Transfer handshake case replayed (idempotent submission).'
          : 'Two-sided student transfer case created. Awaiting peer institution confirmation.'
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers.all });
      reset();
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to initiate transfer';
      setErrorMsg(msg);
    },
  });

  const onSubmit = (data: TransferFormData) => {
    setErrorMsg(null);
    mutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
            Initiate Student Transfer Handshake
          </DialogTitle>
          <DialogDescription>
            Creates a bilateral transfer case between sending and receiving institutions. Both parties must confirm before the ledger balances update.
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
            <label className="text-xs font-medium text-slate-300 block mb-1">
              Student Reference / Identifier (Masked)
            </label>
            <Input
              placeholder="e.g. STU-MIGRATE-01 or masked token"
              {...register('studentRef')}
              className="font-mono text-xs"
            />
            {errors.studentRef && (
              <p className="text-rose-400 text-xs mt-1">{errors.studentRef.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Sending Institution</label>
              <Input
                placeholder="Sending Institution ID"
                {...register('sendingInstitutionId')}
                className="font-mono text-xs"
              />
              {errors.sendingInstitutionId && (
                <p className="text-rose-400 text-xs mt-1">{errors.sendingInstitutionId.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Sending Programme</label>
              <Input
                placeholder="e.g. CS-BTECH"
                {...register('sendingProgrammeCode')}
                className="font-mono text-xs uppercase"
              />
              {errors.sendingProgrammeCode && (
                <p className="text-rose-400 text-xs mt-1">{errors.sendingProgrammeCode.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Receiving Institution</label>
              <Input
                placeholder="Receiving Institution ID"
                {...register('receivingInstitutionId')}
                className="font-mono text-xs"
              />
              {errors.receivingInstitutionId && (
                <p className="text-rose-400 text-xs mt-1">{errors.receivingInstitutionId.message}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Receiving Programme</label>
              <Input
                placeholder="e.g. CS-BTECH"
                {...register('receivingProgrammeCode')}
                className="font-mono text-xs uppercase"
              />
              {errors.receivingProgrammeCode && (
                <p className="text-rose-400 text-xs mt-1">{errors.receivingProgrammeCode.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Academic Year</label>
              <Input placeholder="2024-25" {...register('academicYear')} className="font-mono text-xs" />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Seat Category</label>
              <select
                {...register('seatCategory')}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              >
                <option value="GENERAL">GENERAL</option>
                <option value="OBC">OBC</option>
                <option value="SC">SC</option>
                <option value="ST">ST</option>
                <option value="EWS">EWS</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-md border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-300">Atomic Balance Invariant:</strong> Once both sending and receiving administrators confirm this transfer, atomic ledger deltas are posted to decrement sending bucket and increment receiving bucket synchronously.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Initiating Handshake...' : 'Initiate Transfer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
