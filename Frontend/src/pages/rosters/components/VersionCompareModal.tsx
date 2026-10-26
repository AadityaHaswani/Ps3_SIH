import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { rosterApi } from '../../../api/modules/roster.api';
import { queryKeys } from '../../../api/queryKeys';
import type { RosterVersion } from '../../../types/models';
import { GitCompare, Plus, Minus, Edit2, Check } from 'lucide-react';

interface VersionCompareModalProps {
  version: RosterVersion | null;
  compareWithId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const VersionCompareModal: React.FC<VersionCompareModalProps> = ({
  version,
  compareWithId,
  isOpen,
  onClose,
}) => {
  const versionId = version?.id || version?._id || '';

  const { data: diffResult, isLoading, error } = useQuery({
    queryKey: queryKeys.rosters.compare(versionId, compareWithId || 'predecessor'),
    queryFn: () => rosterApi.compareVersions(versionId, compareWithId),
    enabled: Boolean(versionId && isOpen),
  });

  if (!version) return null;

  const summary = diffResult?.diffSummary || {
    addedCount: 0,
    removedCount: 0,
    modifiedCount: 0,
    unchangedCount: 0,
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'ADDED':
        return (
          <Badge variant="verified" size="sm" className="gap-1">
            <Plus className="w-3 h-3" /> Added
          </Badge>
        );
      case 'REMOVED':
        return (
          <Badge variant="danger" size="sm" className="gap-1">
            <Minus className="w-3 h-3" /> Removed
          </Badge>
        );
      case 'MODIFIED':
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <Edit2 className="w-3 h-3" /> Modified
          </Badge>
        );
      case 'UNCHANGED':
      default:
        return (
          <Badge variant="outline" size="sm" className="text-slate-500">
            Unchanged
          </Badge>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-indigo-400" />
            Roster Version Diff Comparison
          </DialogTitle>
          <DialogDescription>
            Comparing Version <span className="font-mono text-indigo-300 font-semibold">v{version.versionNumber}</span> against {compareWithId ? `Version ${compareWithId}` : 'immediate predecessor'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Added</span>
              <span className="text-xl font-bold font-mono text-emerald-400">+{summary.addedCount}</span>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-rose-400 uppercase font-semibold block">Removed</span>
              <span className="text-xl font-bold font-mono text-rose-400">-{summary.removedCount}</span>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-amber-400 uppercase font-semibold block">Modified</span>
              <span className="text-xl font-bold font-mono text-amber-400">{summary.modifiedCount}</span>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Unchanged</span>
              <span className="text-xl font-bold font-mono text-slate-100">{summary.unchangedCount}</span>
            </div>
          </div>

          {isLoading && (
            <div className="py-12 text-center text-xs text-slate-400">
              Computing cryptographic row-by-row version diff...
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg text-xs">
              Unable to compute diff: {(error as any)?.message || 'Query error'}
            </div>
          )}

          {/* Changed rows table */}
          {!isLoading && diffResult && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Row-Level Mutations ({diffResult.rows?.length || 0} modified/added/removed rows)
              </h4>

              <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Action</th>
                      <th className="p-2.5">Student Name (Masked)</th>
                      <th className="p-2.5">APAAR Identifier</th>
                      <th className="p-2.5">Programme</th>
                      <th className="p-2.5">Field Diffs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {diffResult.rows?.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="p-2.5 whitespace-nowrap">{getActionBadge(row.action)}</td>
                        <td className="p-2.5">{row.studentNameMasked}</td>
                        <td className="p-2.5 font-mono text-indigo-300 text-[11px]">{row.apaarTokenMasked}</td>
                        <td className="p-2.5 font-mono">{row.programmeCode}</td>
                        <td className="p-2.5 text-[11px] font-mono text-slate-400">
                          {row.diffs
                            ? Object.entries(row.diffs)
                                .map(([k, v]) => `${k}: ${String(v.base ?? '—')} → ${String(v.target ?? '—')}`)
                                .join(', ')
                            : '—'}
                        </td>
                      </tr>
                    ))}

                    {(!diffResult.rows || diffResult.rows.length === 0) && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">
                          No modified rows detected. Versions are identical in enrolment content.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
