import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { samplingApi, RecordItemVerificationPayload } from '../../../api/modules/sampling.api';
import { queryKeys } from '../../../api/queryKeys';
import type { SamplingItem } from '../../../types/models';
import { CheckSquare, AlertCircle } from 'lucide-react';

interface RecordVerificationModalProps {
  item: SamplingItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RecordVerificationModal: React.FC<RecordVerificationModalProps> = ({
  item,
  isOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const itemId = item?._id || '';

  const [verificationStatus, setVerificationStatus] =
    useState<RecordItemVerificationPayload['verificationStatus']>('VERIFIED_MATCH');
  const [verificationMethod, setVerificationMethod] = useState('PHYSICAL_DOCUMENT');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      samplingApi.recordResult(itemId, {
        verificationStatus,
        verificationMethod,
        evidenceRef: evidenceRef || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Sample item verification recorded successfully.');
      queryClient.invalidateQueries({ queryKey: queryKeys.sampling.items(item?.samplingRunId || '', {}) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sampling.estimate(item?.samplingRunId || '') });
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to record verification';
      setErrorMsg(msg);
    },
  });

  if (!item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    mutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-teal-400" />
            Record Audit Verification Result
          </DialogTitle>
          <DialogDescription>
            Record field-level verification outcome for student token <span className="font-mono text-teal-300 font-semibold">{item.apaarTokenMasked || item.studentNameMasked || item._id}</span>.
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
              Verification Outcome
            </label>
            <select
              value={verificationStatus}
              onChange={(e) => setVerificationStatus(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="VERIFIED_MATCH">VERIFIED_MATCH (Verified with full document support)</option>
              <option value="VERIFIED_DISCREPANCY">VERIFIED_DISCREPANCY (Discrepancy observed in record)</option>
              <option value="UNABLE_TO_VERIFY">UNABLE_TO_VERIFY (Unable to locate documentary record)</option>
              <option value="EXCLUDED">EXCLUDED (Statutorily excluded from audit stratum)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              Verification Method
            </label>
            <select
              value={verificationMethod}
              onChange={(e) => setVerificationMethod(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="PHYSICAL_DOCUMENT">Physical Document Inspection</option>
              <option value="CROSS_REGISTER">Cross-Register Statutory Match</option>
              <option value="BIOMETRIC">Biometric Attestation</option>
              <option value="AUTHORITY_ATTESTATION">Authority Officer Attestation</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">Evidence Reference / Order #</label>
            <Input
              value={evidenceRef}
              onChange={(e) => setEvidenceRef(e.target.value)}
              placeholder="e.g. CERT-VERIF-2024-889"
              className="text-xs font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">Audit Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter auditor observations or specific field notes..."
              rows={2}
              className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Committing...' : 'Commit Verification'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
