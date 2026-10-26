import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { reconciliationApi } from '../../../api/modules/reconciliation.api';
import { rosterApi } from '../../../api/modules/roster.api';
import { queryKeys } from '../../../api/queryKeys';
import { PlayCircle, AlertCircle, Layers } from 'lucide-react';

interface CreateReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionId: string;
}

export const CreateReconciliationModal: React.FC<CreateReconciliationModalProps> = ({
  isOpen,
  onClose,
  institutionId,
}) => {
  const queryClient = useQueryClient();
  const [academicYear, setAcademicYear] = useState('2024-25');
  const [rosterVersionId, setRosterVersionId] = useState('');
  const [programmeCodesInput, setProgrammeCodesInput] = useState('');
  const [sources, setSources] = useState<string[]>(['ROSTER', 'ADMISSION', 'EXAM', 'INTAKE']);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Simulation toggles
  const [simulateAdmissionGap, setSimulateAdmissionGap] = useState(false);
  const [simulateExamMismatch, setSimulateExamMismatch] = useState(false);

  // Fetch committed roster versions for this institution
  const { data: rosterVersionsData } = useQuery({
    queryKey: queryKeys.rosters.versions({ institutionId, academicYear }),
    queryFn: () => rosterApi.listVersions({ institutionId, academicYear }),
    enabled: isOpen,
  });

  const committedVersions = rosterVersionsData?.items || [];

  const handleSourceToggle = (source: string) => {
    if (sources.includes(source)) {
      if (sources.length <= 2) {
        toast.warning('At least two sources are required for multi-register reconciliation.');
        return;
      }
      setSources(sources.filter((s) => s !== source));
    } else {
      setSources([...sources, source]);
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      const programmes = programmeCodesInput
        .split(',')
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean);

      const simulationToggles: Record<string, boolean> = {};
      if (simulateAdmissionGap) simulationToggles.simulateAdmissionGap = true;
      if (simulateExamMismatch) simulationToggles.simulateExamMismatch = true;

      return reconciliationApi.createRun({
        institutionId,
        academicYear,
        rosterVersionId: rosterVersionId || (committedVersions[0]?._id ?? 'draft-v1'),
        sources,
        programmeCodes: programmes.length > 0 ? programmes : undefined,
        simulationToggles: Object.keys(simulationToggles).length > 0 ? simulationToggles : undefined,
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.isReplay
          ? 'Reconciliation run replayed (idempotent result).'
          : 'Three-way match completed successfully. Findings and triangulation summary ready.'
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliations.all });
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to start reconciliation run';
      setErrorMsg(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    mutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-indigo-400" />
            Initiate Three-Way Reconciliation Run
          </DialogTitle>
          <DialogDescription>
            Triangulate student enrolments across Institutional Roster, Admission Register, Exam Portal, and Sanctioned Intake.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-md flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Academic Year</label>
              <Input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2024-25"
                className="font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Target Roster Version</label>
              {committedVersions.length > 0 ? (
                <select
                  value={rosterVersionId || committedVersions[0]?._id}
                  onChange={(e) => setRosterVersionId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                >
                  {committedVersions.map((v) => (
                    <option key={v._id} value={v._id}>
                      v{v.versionNumber} ({v.rowCount} records) - {new Date(v.committedAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={rosterVersionId}
                  onChange={(e) => setRosterVersionId(e.target.value)}
                  placeholder="e.g. 660f... or draft-v1"
                  className="font-mono text-xs"
                />
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              Programme Code Filter (Optional)
            </label>
            <Input
              value={programmeCodesInput}
              onChange={(e) => setProgrammeCodesInput(e.target.value)}
              placeholder="e.g. CS-BTECH, ME-BTECH (leave blank for all)"
              className="text-xs font-mono uppercase"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">Comma-separated programme codes.</span>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">
              Registers for Triangulation
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {['ROSTER', 'ADMISSION', 'EXAM', 'INTAKE'].map((source) => (
                <label
                  key={source}
                  className={`p-2.5 rounded-lg border flex items-center gap-2 cursor-pointer transition-colors ${
                    sources.includes(source)
                      ? 'bg-indigo-950/40 border-indigo-700/60 text-slate-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={sources.includes(source)}
                    onChange={() => handleSourceToggle(source)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-xs">{source}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Simulation Toggles */}
          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 space-y-2">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Evaluation & Simulation Knobs
            </span>
            <div className="flex flex-col gap-1.5 text-xs text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateAdmissionGap}
                  onChange={(e) => setSimulateAdmissionGap(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600"
                />
                <span>Simulate Admission Register Gap (Evaluate unconfirmed admission records)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateExamMismatch}
                  onChange={(e) => setSimulateExamMismatch(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600"
                />
                <span>Simulate Exam Registry Discrepancy (Evaluate weak match resolution)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Executing Three-Way Match...' : 'Execute Match'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
