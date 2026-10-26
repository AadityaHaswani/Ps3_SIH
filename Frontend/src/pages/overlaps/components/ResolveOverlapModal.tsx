import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { transferApi, ResolveOverlapPayload } from '../../../api/modules/transfer.api';
import { queryKeys } from '../../../api/queryKeys';
import type { OverlapCase } from '../../../types/models';
import { ShieldCheck, AlertCircle } from 'lucide-react';

interface ResolveOverlapModalProps {
  overlapCase: OverlapCase | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ResolveOverlapModal: React.FC<ResolveOverlapModalProps> = ({
  overlapCase,
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const caseId = overlapCase?.caseId || overlapCase?._id || '';

  const [code, setCode] = useState<ResolveOverlapPayload['code']>('LEGITIMATE_TRANSFER');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => transferApi.resolveOverlapCase(caseId, { code, notes }),
    onSuccess: (updated) => {
      toast.success(`Overlap case resolved with resolution code: ${code}.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.overlaps.all });
      setNotes('');
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to resolve overlap case';
      setErrorMsg(msg);
    },
  });

  if (!overlapCase) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (notes.trim().length < 5) {
      setErrorMsg('A detailed reviewer note (at least 5 characters) is required to resolve.');
      return;
    }
    setErrorMsg(null);
    mutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
            Resolve Enrolment Overlap Case
          </DialogTitle>
          <DialogDescription>
            Record statutory resolution for Case <span className="font-mono text-indigo-300 font-semibold">{overlapCase.caseId}</span>. All decisions append to immutable audit history.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-md flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              Statutory Resolution Code
            </label>
            <select
              value={code}
              onChange={(e) => setCode(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="LEGITIMATE_TRANSFER">
                LEGITIMATE_TRANSFER (Legitimate student migration/transfer)
              </option>
              <option value="DATA_ENTRY_ERROR_CORRECTED">
                DATA_ENTRY_ERROR_CORRECTED (Clerical or entry error rectified)
              </option>
              <option value="PERMITTED_PARALLEL">
                PERMITTED_PARALLEL (Permitted dual degree / distance arrangement)
              </option>
              <option value="REFERRED_FOR_POLICY_REVIEW">
                REFERRED_FOR_POLICY_REVIEW (Escalated for regulatory policy ruling)
              </option>
              <option value="NO_ACTION">
                NO_ACTION (No statutory compliance action required)
              </option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              Mandatory Regulatory Reviewer Note (min 5 characters)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="State the verified regulatory grounds, certificate reference, or institutional correspondence..."
              rows={3}
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Committing Resolution...' : 'Commit Resolution'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
