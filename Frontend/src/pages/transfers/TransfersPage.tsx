import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../../auth';
import { usePermission } from '../../auth/usePermission';
import { transferApi } from '../../api/modules/transfer.api';
import { queryKeys } from '../../api/queryKeys';
import type { TransferCase } from '../../types/models';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { InitiateTransferModal } from './components/InitiateTransferModal';
import { TransferDetailModal } from './components/TransferDetailModal';
import {
  ArrowLeftRight,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Hourglass,
  Layers,
} from 'lucide-react';

export const TransfersPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const institutionId = user?.institutionId || 'SIT-DEMO-01';

  const canCreate = usePermission('transfers:create');
  const canSweep = usePermission('transfers:process-timeouts');

  const [statusFilter, setStatusFilter] = useState('');
  const [academicYear, setAcademicYear] = useState('2024-25');
  const [page, setPage] = useState(1);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferCase | null>(null);
  const [isInitiateOpen, setIsInitiateOpen] = useState(false);

  // Transfers query
  const {
    data: transfersData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.transfers.list({
      institutionId,
      status: statusFilter || undefined,
      academicYear: academicYear || undefined,
      page,
      limit: 20,
    }),
    queryFn: () =>
      transferApi.listTransfers({
        institutionId,
        status: statusFilter || undefined,
        academicYear: academicYear || undefined,
        page,
        limit: 20,
      }),
  });

  const transfers = transfersData?.items || [];
  const pagination = transfersData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  // Timeout Sweep Mutation
  const sweepMutation = useMutation({
    mutationFn: () => transferApi.processTimeouts(),
    onSuccess: (data) => {
      toast.success(
        `Timeout sweep completed: ${data.processedCount} cases evaluated, ${data.timedOutCount} timed out.`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers.all });
    },
    onError: (err: any) => {
      toast.error(err.message || 'Timeout sweep failed');
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
      case 'TRANSFER_CONFIRMED':
        return (
          <Badge variant="verified" size="sm" className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> Confirmed
          </Badge>
        );
      case 'REJECTED':
      case 'TRANSFER_REJECTED':
        return (
          <Badge variant="danger" size="sm" className="gap-1">
            <XCircle className="w-3 h-3" /> Rejected
          </Badge>
        );
      case 'TIMED_OUT':
        return (
          <Badge variant="outline" size="sm" className="gap-1 text-slate-400">
            <Hourglass className="w-3 h-3" /> Timed Out
          </Badge>
        );
      case 'PENDING_BOTH':
      case 'PENDING_RECEIVING':
      case 'PENDING_SENDING':
      default:
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <Clock className="w-3 h-3" /> {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <ArrowLeftRight className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-100">Student Transfer Handshake Governance</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Bilateral verification workflow for inter-institutional student transfers. Balances update atomically only after sending and receiving confirmations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSweep && (
            <Button
              onClick={() => sweepMutation.mutate()}
              variant="outline"
              size="sm"
              disabled={sweepMutation.isPending}
              className="gap-1.5 text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            >
              <Hourglass className="w-3.5 h-3.5" />
              {sweepMutation.isPending ? 'Sweeping...' : 'Process Timeouts'}
            </Button>
          )}

          {canCreate && (
            <Button
              onClick={() => setIsInitiateOpen(true)}
              variant="primary"
              size="sm"
              className="gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              Initiate Transfer Handshake
            </Button>
          )}

          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-3 bg-slate-900/60 border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All Transfer Statuses</option>
              <option value="PENDING_BOTH">Pending Both Handshakes</option>
              <option value="PENDING_RECEIVING">Pending Receiving Confirmation</option>
              <option value="PENDING_SENDING">Pending Sending Confirmation</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="REJECTED">Rejected</option>
              <option value="TIMED_OUT">Timed Out</option>
            </select>
          </div>

          <div className="w-36">
            <select
              value={academicYear}
              onChange={(e) => {
                setAcademicYear(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              <option value="2024-25">2024-25</option>
              <option value="2023-24">2023-24</option>
              <option value="2022-23">2022-23</option>
            </select>
          </div>

          {statusFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('');
                setPage(1);
              }}
              className="text-xs text-slate-400"
            >
              Clear Filter
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      {isLoading && (
        <div className="py-14 text-center text-xs text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40">
          Loading student transfer handshake cases...
        </div>
      )}

      {!isLoading && transfers.length === 0 && (
        <div className="p-10 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/40 space-y-2">
          <p className="text-sm font-semibold text-slate-300">No transfer cases found matching criteria.</p>
          <p className="text-xs text-slate-500">
            Initiate a transfer case to coordinate inter-institutional student movement.
          </p>
        </div>
      )}

      {!isLoading && transfers.length > 0 && (
        <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/50 shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
              <tr>
                <th className="p-3">Case ID</th>
                <th className="p-3">Student Ref</th>
                <th className="p-3">Sending Institution</th>
                <th className="p-3">Receiving Institution</th>
                <th className="p-3">Academic Year</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {transfers.map((t) => (
                <tr key={t.caseId || t._id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 font-mono font-semibold text-indigo-300 text-xs">
                    {t.caseId}
                  </td>

                  <td className="p-3 font-mono text-[11px] text-slate-200">
                    {t.studentRef || t.studentTokenId || 'STU-MIGRATION'}
                  </td>

                  <td className="p-3">
                    <div className="font-semibold text-slate-200 text-xs truncate max-w-[150px]">
                      {t.sendingInstitutionId}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">
                      {t.sendingProgrammeCode || t.programmeCode}
                    </span>
                  </td>

                  <td className="p-3">
                    <div className="font-semibold text-slate-200 text-xs truncate max-w-[150px]">
                      {t.receivingInstitutionId}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">
                      {t.receivingProgrammeCode || t.programmeCode}
                    </span>
                  </td>

                  <td className="p-3 font-mono text-slate-300">
                    {t.academicYear}
                  </td>

                  <td className="p-3">
                    {getStatusBadge(t.status)}
                  </td>

                  <td className="p-3 text-right">
                    <Button
                      onClick={() => setSelectedTransfer(t)}
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Inspect Handshake
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <div>
            Showing page <span className="font-semibold text-slate-200">{pagination.page}</span> of{' '}
            <span className="font-semibold text-slate-200">{pagination.totalPages}</span> ({pagination.total} cases)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <InitiateTransferModal
        isOpen={isInitiateOpen}
        onClose={() => setIsInitiateOpen(false)}
        defaultInstitutionId={institutionId}
      />

      <TransferDetailModal
        transfer={selectedTransfer}
        isOpen={Boolean(selectedTransfer)}
        onClose={() => setSelectedTransfer(null)}
      />
    </div>
  );
};
