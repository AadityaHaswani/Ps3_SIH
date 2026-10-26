import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ledgerApi } from '../../../api/modules/ledger.api';
import { queryKeys } from '../../../api/queryKeys';
import type { SeatBalance, SeatLedgerEntry } from '../../../types/models';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  History,
  FileSpreadsheet,
  Clock,
  User,
  Shield,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface BucketDetailDrawerProps {
  bucket: SeatBalance | null;
  isOpen: boolean;
  onClose: () => void;
}

export const BucketDetailDrawer: React.FC<BucketDetailDrawerProps> = ({
  bucket,
  isOpen,
  onClose,
}) => {
  const [entriesPage, setEntriesPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'entries' | 'history'>('entries');

  // Query audit entries
  const { data: entriesData, isLoading: isLoadingEntries } = useQuery({
    queryKey: queryKeys.seatLedger.entries(bucket?._id || '', entriesPage),
    queryFn: () => ledgerApi.getBalanceEntries(bucket!._id, entriesPage, 10),
    enabled: Boolean(bucket?._id && isOpen && activeTab === 'entries'),
  });

  // Query time-series history
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: queryKeys.seatLedger.history(bucket?.bucketKey || ''),
    queryFn: () => ledgerApi.getBalanceHistory(bucket!.bucketKey, bucket?.institutionId),
    enabled: Boolean(bucket?.bucketKey && isOpen && activeTab === 'history'),
  });

  if (!bucket) return null;

  const getEntryBadge = (type: string) => {
    switch (type) {
      case 'INTAKE_SET':
      case 'INTAKE_REVISED':
        return <Badge variant="primary" size="sm">{type}</Badge>;
      case 'ADMISSION':
      case 'TRANSFER_IN':
        return <Badge variant="verified" size="sm">{type}</Badge>;
      case 'WITHDRAWAL':
      case 'TRANSFER_OUT':
      case 'COMPLETION':
        return <Badge variant="danger" size="sm">{type}</Badge>;
      case 'CORRECTION_REVERSAL':
        return <Badge variant="warning" size="sm">{type}</Badge>;
      default:
        return <Badge variant="outline" size="sm">{type}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                Seat Balance Bucket: <span className="font-mono text-indigo-300">{bucket.bucketKey}</span>
              </DialogTitle>
              <DialogDescription className="mt-1">
                Programme: <strong className="text-slate-200">{bucket.programmeCode}</strong> • Year: <strong className="text-slate-200">{bucket.academicYear}</strong> • Category: <strong className="text-slate-200">{bucket.seatCategory}</strong>
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              {(bucket.isSimulated || bucket.intakeSourceMode === 'SIMULATED') && (
                <Badge variant="simulated" size="sm">
                  <Sparkles className="w-3 h-3 mr-1" /> (Simulated)
                </Badge>
              )}
              <Badge
                variant={
                  bucket.status === 'OK'
                    ? 'verified'
                    : bucket.status === 'WARNING'
                    ? 'warning'
                    : bucket.status === 'OVER_CAP_DISCREPANCY'
                    ? 'danger'
                    : 'outline'
                }
                size="sm"
              >
                {bucket.status}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Bucket KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-2">
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
            <span className="text-[11px] text-slate-400 block">Reported Occupancy</span>
            <span className="text-xl font-bold font-mono text-slate-100">{bucket.reportedOccupancy}</span>
          </div>

          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
            <span className="text-[11px] text-slate-400 block">Approved Intake</span>
            <span className="text-xl font-bold font-mono text-slate-100">
              {bucket.approvedIntake ?? 'Unset'}
            </span>
          </div>

          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
            <span className="text-[11px] text-slate-400 block">Headroom Remaining</span>
            <span
              className={`text-xl font-bold font-mono ${
                bucket.headroom === null
                  ? 'text-slate-400'
                  : bucket.headroom < 0
                  ? 'text-rose-400'
                  : bucket.headroom === 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {bucket.headroom === null
                ? '—'
                : bucket.headroom > 0
                ? `+${bucket.headroom}`
                : bucket.headroom}
            </span>
          </div>

          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
            <span className="text-[11px] text-slate-400 block">Capacity Utilisation</span>
            <span className="text-xl font-bold font-mono text-slate-100">
              {bucket.utilisationPct !== null ? `${bucket.utilisationPct.toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('entries')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'entries'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Immutable Audit Entries
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Occupancy Timeline
          </button>
        </div>

        {/* Tab Content: Entries */}
        {activeTab === 'entries' && (
          <div className="space-y-3">
            {isLoadingEntries && (
              <div className="py-12 text-center text-xs text-slate-400">
                Loading immutable audit ledger entries...
              </div>
            )}

            {!isLoadingEntries && entriesData && (
              <>
                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5 text-right">Occupancy Delta</th>
                        <th className="p-2.5 text-right">Intake Delta</th>
                        <th className="p-2.5">Balance After</th>
                        <th className="p-2.5">Actor</th>
                        <th className="p-2.5">Source / Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      {entriesData.items.map((entry: SeatLedgerEntry) => (
                        <tr key={entry._id} className="hover:bg-slate-800/40">
                          <td className="p-2.5 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                            {new Date(entry.effectiveDate).toLocaleDateString()}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            {getEntryBadge(entry.type)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-semibold">
                            {entry.delta > 0 ? (
                              <span className="text-emerald-400">+{entry.delta}</span>
                            ) : entry.delta < 0 ? (
                              <span className="text-rose-400">{entry.delta}</span>
                            ) : (
                              <span className="text-slate-500">0</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-400">
                            {entry.intakeDelta !== 0 ? (
                              <span className="text-indigo-400 font-semibold">
                                {entry.intakeDelta > 0 ? `+${entry.intakeDelta}` : entry.intakeDelta}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-[11px] text-slate-300">
                            Occ: {entry.balanceAfter?.reportedOccupancy ?? '—'} / Cap:{' '}
                            {entry.balanceAfter?.approvedIntake ?? '—'}
                          </td>
                          <td className="p-2.5 text-slate-400 text-[11px]">
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-500" />
                              <span>{entry.actor?.role || 'SYSTEM'}</span>
                            </div>
                          </td>
                          <td className="p-2.5 text-slate-400 text-[11px] truncate max-w-[150px]">
                            {entry.sourceReference || entry.reason || '—'}
                          </td>
                        </tr>
                      ))}

                      {entriesData.items.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500">
                            No ledger entries found for this bucket.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {entriesData.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
                    <div>
                      Page {entriesData.pagination.page} of {entriesData.pagination.totalPages} ({entriesData.pagination.total} entries)
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={entriesPage <= 1}
                        onClick={() => setEntriesPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={entriesPage >= entriesData.pagination.totalPages}
                        onClick={() => setEntriesPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab Content: History Chart */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {isLoadingHistory && (
              <div className="py-12 text-center text-xs text-slate-400">
                Loading snapshot timeline...
              </div>
            )}

            {!isLoadingHistory && historyData && historyData.length > 0 && (
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
                <h4 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-teal-400" />
                  Occupancy vs. Approved Capacity Trendline
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="snapshotDate"
                        stroke="#64748b"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(d) => new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Line
                        type="stepAfter"
                        dataKey="approvedIntake"
                        name="Approved Capacity Ceiling"
                        stroke="#6366f1"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="occupancy"
                        name="Reported Occupancy"
                        stroke="#0d9488"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {!isLoadingHistory && (!historyData || historyData.length === 0) && (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                No historical snapshot points recorded yet for this bucket.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
