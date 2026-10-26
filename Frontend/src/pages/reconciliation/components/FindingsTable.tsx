import React from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import type { ReconciliationFinding } from '../../../types/models';
import { Eye, ShieldAlert, CheckCircle2, Clock, HelpCircle } from 'lucide-react';

interface FindingsTableProps {
  findings: ReconciliationFinding[];
  isLoading: boolean;
  onSelectFinding: (finding: ReconciliationFinding) => void;
}

export const FindingsTable: React.FC<FindingsTableProps> = ({
  findings,
  isLoading,
  onSelectFinding,
}) => {
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
        return (
          <Badge variant="verified" size="sm" className="gap-1">
            <CheckCircle2 className="w-3 h-3" /> {status}
          </Badge>
        );
      case 'DISMISSED':
        return (
          <Badge variant="outline" size="sm" className="text-slate-400">
            {status}
          </Badge>
        );
      case 'CLARIFICATION_REQUESTED':
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <HelpCircle className="w-3 h-3" /> Clarification
          </Badge>
        );
      case 'PENDING':
      default:
        return (
          <Badge variant="secondary" size="sm" className="gap-1">
            <Clock className="w-3 h-3" /> Pending Review
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="py-14 text-center text-xs text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40">
        Loading reconciliation findings...
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="py-14 text-center text-xs text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40 space-y-1">
        <p className="font-semibold text-slate-300">No reconciliation findings found.</p>
        <p className="text-slate-500">All student records reconciled or no findings match current criteria.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/50 shadow-sm">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
          <tr>
            <th className="p-3">Finding Type</th>
            <th className="p-3">Severity</th>
            <th className="p-3">Student & Identifiers</th>
            <th className="p-3">Programme / Year</th>
            <th className="p-3">Confidence</th>
            <th className="p-3">Review Status</th>
            <th className="p-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80 text-slate-200">
          {findings.map((f) => (
            <tr key={f._id} className="hover:bg-slate-800/40 transition-colors">
              <td className="p-3">
                <span className="font-mono font-semibold text-indigo-300 text-xs block">
                  {f.type}
                </span>
                <span className="text-[10px] text-slate-500 truncate max-w-[180px] block">
                  {f.explanation?.observed || f.runId}
                </span>
              </td>

              <td className="p-3">
                {getSeverityBadge(f.severity)}
              </td>

              <td className="p-3">
                <div className="font-medium text-slate-200">
                  {f.recordRef?.studentNameMasked || 'Masked Student'}
                </div>
                <div className="font-mono text-[11px] text-slate-400">
                  {f.recordRef?.apaarTokenMasked || f.recordRef?.applicationNo || '—'}
                </div>
              </td>

              <td className="p-3 font-mono text-[11px] text-slate-300">
                {f.recordRef?.programmeCode || '—'}
                {f.recordRef?.category ? ` (${f.recordRef.category})` : ''}
              </td>

              <td className="p-3">
                <span
                  className={`text-[11px] font-semibold ${
                    f.matchConfidence === 'STRONG'
                      ? 'text-emerald-400'
                      : f.matchConfidence === 'MODERATE'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {f.matchConfidence || 'STRONG'}
                </span>
              </td>

              <td className="p-3">
                {getReviewStatusBadge(f.reviewStatus)}
              </td>

              <td className="p-3 text-right">
                <Button
                  onClick={() => onSelectFinding(f)}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs text-indigo-400 hover:text-indigo-300"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  Inspect & Review
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
