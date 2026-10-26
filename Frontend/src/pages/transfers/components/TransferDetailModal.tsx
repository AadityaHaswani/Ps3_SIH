import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { transferApi } from '../../../api/modules/transfer.api';
import { queryKeys } from '../../../api/queryKeys';
import type { TransferCase } from '../../../types/models';
import { useAuth } from '../../../auth';
import {
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Shield,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface TransferDetailModalProps {
  transfer: TransferCase | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TransferDetailModal: React.FC<TransferDetailModalProps> = ({
  transfer,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const transferId = transfer?.caseId || transfer?._id || '';

  const confirmMutation = useMutation({
    mutationFn: () => transferApi.confirmTransfer(transferId, { notes }),
    onSuccess: (updated) => {
      toast.success(`Transfer status updated: ${updated.status}.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.seatLedger.all });
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Confirmation failed';
      toast.error(msg);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => transferApi.rejectTransfer(transferId, { notes, reason: 'ADMINISTRATIVE_REJECTION' }),
    onSuccess: (updated) => {
      toast.success(`Transfer rejected: status ${updated.status}.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers.all });
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Rejection failed';
      toast.error(msg);
    },
  });

  if (!transfer) return null;

  const isSendingAdmin =
    user?.institutionId && String(user.institutionId) === String(transfer.sendingInstitutionId);
  const isReceivingAdmin =
    user?.institutionId && String(user.institutionId) === String(transfer.receivingInstitutionId);
  const isAuthority =
    user?.role === 'AUTHORITY_ADMIN' ||
    user?.role === 'AUTHORITY_OFFICER' ||
    user?.role === 'PLATFORM_ADMIN';

  // Can confirm if sending side pending & sending user, or receiving side pending & receiving user, or authority
  const canAct =
    (isSendingAdmin && transfer.sendingConfirmation?.status === 'PENDING') ||
    (isReceivingAdmin && transfer.receivingConfirmation?.status === 'PENDING') ||
    (isAuthority && transfer.status.startsWith('PENDING'));

  const getConfirmationBadge = (status?: string) => {
    switch (status) {
      case 'CONFIRMED':
        return (
          <Badge variant="verified" size="sm" className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> Confirmed
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="danger" size="sm" className="gap-1">
            <XCircle className="w-3 h-3" /> Rejected
          </Badge>
        );
      case 'PENDING':
      default:
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <Clock className="w-3 h-3" /> Pending Handshake
          </Badge>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
                Transfer Case: <span className="font-mono text-indigo-300">{transfer.caseId}</span>
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                Target: <span className="font-mono text-slate-300">{transfer.studentRef || 'Masked Student'}</span> • Year: <span className="font-mono text-slate-300">{transfer.academicYear}</span>
              </DialogDescription>
            </div>
            <Badge
              variant={
                transfer.status === 'CONFIRMED' || transfer.status === 'TRANSFER_CONFIRMED'
                  ? 'verified'
                  : transfer.status.startsWith('PENDING')
                  ? 'warning'
                  : 'danger'
              }
              size="sm"
            >
              {transfer.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Two-Sided Handshake Stepper */}
          <div className="grid grid-cols-2 gap-3">
            {/* Sending Side */}
            <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[11px] font-bold text-slate-300 uppercase">Sending Institution</span>
                {getConfirmationBadge(transfer.sendingConfirmation?.status)}
              </div>
              <div className="space-y-1 text-xs">
                <div className="font-mono text-indigo-300 truncate font-semibold">
                  {transfer.sendingInstitutionId}
                </div>
                <div className="text-slate-400 font-mono text-[11px]">
                  Programme: {transfer.sendingProgrammeCode || transfer.programmeCode}
                </div>
                {transfer.sendingConfirmation?.confirmedAt && (
                  <div className="text-[10px] text-slate-500 font-mono pt-1">
                    Confirmed: {new Date(transfer.sendingConfirmation.confirmedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>

            {/* Receiving Side */}
            <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="text-[11px] font-bold text-slate-300 uppercase">Receiving Institution</span>
                {getConfirmationBadge(transfer.receivingConfirmation?.status)}
              </div>
              <div className="space-y-1 text-xs">
                <div className="font-mono text-teal-300 truncate font-semibold">
                  {transfer.receivingInstitutionId}
                </div>
                <div className="text-slate-400 font-mono text-[11px]">
                  Programme: {transfer.receivingProgrammeCode || transfer.programmeCode}
                </div>
                {transfer.receivingConfirmation?.confirmedAt && (
                  <div className="text-[10px] text-slate-500 font-mono pt-1">
                    Confirmed: {new Date(transfer.receivingConfirmation.confirmedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Seat Balance Impact Notice */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-300 flex items-start gap-2.5 leading-relaxed">
            <Layers className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-slate-200">Ledger Balance Atomic Invariant</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                When confirmed, the sending seat bucket ({transfer.sendingProgrammeCode || transfer.programmeCode}) receives an immutable <span className="font-mono text-rose-300">TRANSFER_OUT (-1)</span> entry, and the receiving bucket ({transfer.receivingProgrammeCode || transfer.programmeCode}) receives a synchronous <span className="font-mono text-teal-300">TRANSFER_IN (+1)</span> entry.
              </p>
            </div>
          </div>

          {/* Action Decision Form if permitted */}
          {canAct && (
            <div className="p-3.5 bg-slate-900/90 border border-indigo-950 rounded-xl space-y-3">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider block">
                Record Handshake Decision
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional confirmation note or transfer reference number..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              <div className="flex justify-end gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={rejectMutation.isPending || confirmMutation.isPending}
                  onClick={() => rejectMutation.mutate()}
                >
                  {rejectMutation.isPending ? 'Rejecting...' : 'Reject Transfer'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={confirmMutation.isPending || rejectMutation.isPending}
                  onClick={() => confirmMutation.mutate()}
                >
                  {confirmMutation.isPending ? 'Confirming...' : 'Confirm Handshake'}
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
