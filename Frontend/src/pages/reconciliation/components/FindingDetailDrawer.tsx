import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { reconciliationApi } from '../../../api/modules/reconciliation.api';
import { queryKeys } from '../../../api/queryKeys';
import type { ReconciliationFinding } from '../../../types/models';
import { useAuth } from '../../../auth';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Clock,
  ArrowRight,
  Shield,
  Layers,
  Sparkles,
  GitCompare,
} from 'lucide-react';

interface FindingDetailDrawerProps {
  finding: ReconciliationFinding | null;
  isOpen: boolean;
  onClose: () => void;
  onFindingUpdated?: (updated: ReconciliationFinding) => void;
}

export const FindingDetailDrawer: React.FC<FindingDetailDrawerProps> = ({
  finding,
  isOpen,
  onClose,
  onFindingUpdated,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Review decision state
  const [action, setAction] = useState<'CONFIRM' | 'DISMISS' | 'REQUEST_CLARIFICATION' | 'RESOLVE'>('CONFIRM');
  const [reason, setReason] = useState('VERIFIED_RECORD_DISCREPANCY');
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Review permissions: PLATFORM_ADMIN, AUTHORITY_ADMIN, AUTHORITY_OFFICER
  const canReview =
    user?.role === 'PLATFORM_ADMIN' ||
    user?.role === 'AUTHORITY_ADMIN' ||
    user?.role === 'AUTHORITY_OFFICER';

  const reviewMutation = useMutation({
    mutationFn: (payload: { action: typeof action; reason: string; note: string }) =>
      reconciliationApi.reviewFinding(finding!._id, payload),
    onSuccess: (updated) => {
      toast.success(`Review recorded: Finding status updated to ${updated.reviewStatus}. Institutional scorecard marked for refresh.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.findings.detail(finding!._id) });
      if (onFindingUpdated) onFindingUpdated(updated);
      setNote('');
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to submit review decision';
      setErrorMsg(msg);
    },
  });

  if (!finding) return null;

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    reviewMutation.mutate({ action, reason, note });
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
      case 'HIGH':
        return <Badge variant="danger" size="sm">{sev}</Badge>;
      case 'MEDIUM':
        return <Badge variant="warning" size="sm">{sev}</Badge>;
      case 'LOW':
      case 'INFO':
        return <Badge variant="outline" size="sm">{sev}</Badge>;
      default:
        return <Badge variant="outline" size="sm">{sev}</Badge>;
    }
  };

  const getReviewStatusBadge = (status: string) => {
    switch (status) {
      case 'RESOLVED':
      case 'CONFIRMED':
        return <Badge variant="verified" size="sm">{status}</Badge>;
      case 'DISMISSED':
        return <Badge variant="outline" size="sm" className="text-slate-400">{status}</Badge>;
      case 'CLARIFICATION_REQUESTED':
        return <Badge variant="warning" size="sm">{status}</Badge>;
      case 'PENDING':
      default:
        return <Badge variant="secondary" size="sm">{status}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <GitCompare className="w-5 h-5 text-indigo-400" />
                Finding: <span className="font-mono text-indigo-300">{finding.type}</span>
              </DialogTitle>
              <DialogDescription className="mt-1">
                Run ID: <span className="font-mono text-slate-300">{finding.runId}</span> • Confidence: <span className="font-semibold text-slate-200">{finding.matchConfidence || 'STRONG'}</span>
              </DialogDescription>
            </div>

            <div className="flex items-center gap-2">
              {getSeverityBadge(finding.severity)}
              {getReviewStatusBadge(finding.reviewStatus)}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Masked Student Record Context */}
          <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Target Record</span>
              <div className="font-semibold text-slate-200 text-sm mt-0.5">
                {finding.recordRef?.studentNameMasked || 'Masked Student'}
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">APAAR Identifier</span>
              <div className="font-mono text-xs text-indigo-300 mt-0.5">
                {finding.recordRef?.apaarTokenMasked || 'APAAR-XXXX-XXXX'}
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Application / Row</span>
              <div className="font-mono text-xs text-slate-300 mt-0.5">
                {finding.recordRef?.applicationNo || finding.recordRef?.rowKey || '—'}
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Programme / Category</span>
              <div className="font-mono text-xs text-slate-300 mt-0.5">
                {finding.recordRef?.programmeCode || '—'} ({finding.recordRef?.category || 'GEN'})
              </div>
            </div>
          </div>

          {/* Explanation Alert Box */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Sparkles className="w-4 h-4 text-teal-400" />
              Triangulation Engine Explanation
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Expected Criteria</span>
                <p className="text-slate-300 leading-relaxed">{finding.explanation?.expected || 'Active matching registration across registers.'}</p>
              </div>

              <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Observed Discrepancy</span>
                <p className="text-slate-300 leading-relaxed">{finding.explanation?.observed || 'Difference observed in cross-register attributes.'}</p>
              </div>
            </div>

            {finding.explanation?.ruleApplied && (
              <div className="text-[11px] text-slate-400 pt-1">
                <span className="font-semibold text-slate-300">Rule Applied:</span> {finding.explanation.ruleApplied} • <span className="font-semibold text-slate-300">Next Action:</span> {finding.explanation.nextAction || 'Review by authorized officer.'}
              </div>
            )}
          </div>

          {/* Side-by-Side Candidate Comparison */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Side-by-Side Multi-Register Comparison
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Primary Roster Record */}
              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-indigo-300">Institutional Roster Record</span>
                  <Badge variant="outline" size="sm">Primary</Badge>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Student Name:</span>
                    <span className="font-mono text-slate-200">{finding.recordRef?.studentNameMasked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">APAAR Token:</span>
                    <span className="font-mono text-slate-200">{finding.recordRef?.apaarTokenMasked}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Programme:</span>
                    <span className="font-mono text-slate-200">{finding.recordRef?.programmeCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Category:</span>
                    <span className="font-mono text-slate-200">{finding.recordRef?.category || 'GENERAL'}</span>
                  </div>
                </div>
              </div>

              {/* External Register Sources */}
              <div className="p-3.5 bg-slate-900/70 border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-teal-300">External Register Matches</span>
                  <Badge variant="outline" size="sm">External</Badge>
                </div>

                {finding.sourceRefs && finding.sourceRefs.length > 0 ? (
                  <div className="space-y-2.5 text-xs">
                    {finding.sourceRefs.map((src, idx) => (
                      <div key={idx} className="p-2 bg-slate-950/60 rounded border border-slate-800/80 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-teal-400">{src.source}</span>
                          <span className="font-mono text-[10px] text-slate-500">{src.sourceMode || 'STATUTORY'}</span>
                        </div>
                        <div className="text-[11px] text-slate-300">
                          ID: <span className="font-mono text-slate-400">{src.identifierMasked || src.identifier || src.sourceRecordId || '—'}</span>
                        </div>
                        {src.attributes && (
                          <div className="text-[10px] font-mono text-slate-400 truncate">
                            {JSON.stringify(src.attributes)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No matching external register record found.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Field-Level Differences */}
          {finding.fieldDiffs && finding.fieldDiffs.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Field Diffs Detected
              </h4>
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2">Field</th>
                      <th className="p-2">Roster Value</th>
                      <th className="p-2">External Source Value</th>
                      <th className="p-2">External Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {finding.fieldDiffs.map((diff, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="p-2 font-mono text-indigo-300">{diff.field}</td>
                        <td className="p-2 font-mono text-slate-200">{diff.rosterValue ?? String(diff.expected ?? '—')}</td>
                        <td className="p-2 font-mono text-rose-300">{diff.sourceValue ?? String(diff.observed ?? '—')}</td>
                        <td className="p-2 text-slate-400">{diff.source || 'EXTERNAL'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Historical Review Audit Trail */}
          {finding.reviewHistory && finding.reviewHistory.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Review Decision History
              </h4>
              <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-900/40">
                {finding.reviewHistory.map((rev, idx) => (
                  <div key={idx} className="p-3 text-xs flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" size="sm">{rev.action}</Badge>
                        <span className="font-semibold text-slate-300">{rev.by}</span>
                        <span className="text-[10px] text-slate-500">({rev.role})</span>
                      </div>
                      {rev.note && <p className="text-slate-400 mt-1">{rev.note}</p>}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {new Date(rev.at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review Decision Form */}
          {canReview ? (
            <form onSubmit={handleReviewSubmit} className="p-4 bg-slate-900/90 border border-indigo-950 rounded-xl space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                  Record Officer Review Decision
                </h4>
              </div>

              {errorMsg && (
                <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-md">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Decision Action</label>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="CONFIRM">CONFIRM (Confirm Discrepancy)</option>
                    <option value="DISMISS">DISMISS (False Positive / Tolerated Variance)</option>
                    <option value="REQUEST_CLARIFICATION">REQUEST_CLARIFICATION (Flag to Institution)</option>
                    <option value="RESOLVE">RESOLVE (Resolved with Documentary Evidence)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Decision Category / Reason</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="VERIFIED_RECORD_DISCREPANCY">Verified Record Discrepancy</option>
                    <option value="ORTHOGRAPHIC_NAME_VARIATION">Orthographic Name Spelling Variation</option>
                    <option value="APPROVED_LATERAL_MIGRATION">Approved Lateral Migration</option>
                    <option value="EXTERNAL_REGISTER_SYNC_LAG">External Register Sync Lag</option>
                    <option value="DOCUMENTARY_PROOF_VERIFIED">Documentary Proof Verified</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Audit Trail Note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Enter explanatory notes for regulatory review history..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md p-2.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={reviewMutation.isPending}
                >
                  {reviewMutation.isPending ? 'Committing...' : 'Commit Review Decision'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="p-3 bg-slate-950/60 rounded-md border border-slate-800 text-xs text-slate-400">
              Review decisions can only be submitted by authorized regulatory officers (Platform Admin, Authority Admin, or Authority Officer).
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
