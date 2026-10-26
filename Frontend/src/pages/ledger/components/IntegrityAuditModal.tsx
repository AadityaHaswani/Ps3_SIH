import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ledgerApi } from '../../../api/modules/ledger.api';
import type { LedgerIntegrityReport } from '../../../types/models';
import { ShieldCheck, AlertTriangle, CheckCircle, RefreshCw, FileSearch } from 'lucide-react';

interface IntegrityAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionId?: string;
}

export const IntegrityAuditModal: React.FC<IntegrityAuditModalProps> = ({
  isOpen,
  onClose,
  institutionId,
}) => {
  const [report, setReport] = useState<LedgerIntegrityReport | null>(null);

  const mutation = useMutation({
    mutationFn: () => ledgerApi.verifyIntegrity({ institutionId }),
    onSuccess: (data) => {
      setReport(data);
    },
  });

  const handleRunAudit = () => {
    mutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-400" />
            Seat Ledger Mathematical Integrity Audit
          </DialogTitle>
          <DialogDescription>
            Independent cryptographic and transactional verification. Re-aggregates the entire immutable history of admission, withdrawal, and transfer deltas to detect any cached state drifts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!report && !mutation.isPending && (
            <div className="p-6 text-center border border-dashed border-slate-700 rounded-lg bg-slate-900/50 space-y-3">
              <FileSearch className="w-10 h-10 mx-auto text-slate-400" />
              <p className="text-sm text-slate-300">
                Click below to compute delta summation across all active seat balance buckets for institution <span className="font-mono text-teal-300">{institutionId || 'All Scopes'}</span>.
              </p>
              <Button onClick={handleRunAudit} variant="primary" className="gap-2">
                <RefreshCw className="w-4 h-4" /> Run Ledger Audit
              </Button>
            </div>
          )}

          {mutation.isPending && (
            <div className="p-10 text-center space-y-3">
              <RefreshCw className="w-8 h-8 mx-auto text-teal-400 animate-spin" />
              <p className="text-sm text-slate-300">Scanning append-only ledger entries and validating running balances...</p>
            </div>
          )}

          {report && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-lg border flex items-start gap-3 ${
                  report.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {report.ok ? (
                  <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm">
                    {report.ok ? 'Ledger Invariant Preserved (Zero Drift)' : 'Drift Discrepancy Detected'}
                  </h4>
                  <p className="text-xs opacity-90 leading-relaxed">
                    {report.ok
                      ? `All ${report.totalBucketsChecked} seat buckets mathematically match their append-only delta transaction histories. No unrecorded modifications or ledger tampering detected.`
                      : `Found ${report.driftsCount} buckets with discrepancies between cached occupancy and historical ledger entries.`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                  <div className="text-xs text-slate-400">Buckets Audited</div>
                  <div className="text-xl font-bold font-mono text-slate-100">{report.totalBucketsChecked}</div>
                </div>
                <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                  <div className="text-xs text-slate-400">Drifts Detected</div>
                  <div
                    className={`text-xl font-bold font-mono ${
                      report.driftsCount === 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {report.driftsCount}
                  </div>
                </div>
              </div>

              {report.drifts.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Drift Details
                  </h5>
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="p-2">Bucket</th>
                          <th className="p-2">Cached Occupancy</th>
                          <th className="p-2">Ledger Recomputed</th>
                          <th className="p-2">Variance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-200">
                        {report.drifts.map((d, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/50">
                            <td className="p-2 font-mono text-[11px] text-indigo-300">{d.bucketKey}</td>
                            <td className="p-2 font-mono">{d.cachedOccupancy}</td>
                            <td className="p-2 font-mono text-teal-400">{d.computedFromLedger}</td>
                            <td className="p-2">
                              <Badge variant="danger" size="sm">
                                {d.drift > 0 ? `+${d.drift}` : d.drift}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <Button
                  onClick={handleRunAudit}
                  variant="outline"
                  size="sm"
                  disabled={mutation.isPending}
                  className="gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Re-run Audit
                </Button>
                <Button onClick={onClose} variant="ghost" size="sm">
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
