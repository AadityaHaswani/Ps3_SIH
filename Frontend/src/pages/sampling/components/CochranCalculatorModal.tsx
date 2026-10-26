import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { samplingApi } from '../../../api/modules/sampling.api';
import { rosterApi } from '../../../api/modules/roster.api';
import { queryKeys } from '../../../api/queryKeys';
import { Calculator, Sparkles, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface CochranCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionId: string;
}

export const CochranCalculatorModal: React.FC<CochranCalculatorModalProps> = ({
  isOpen,
  onClose,
  institutionId,
}) => {
  const queryClient = useQueryClient();

  const [academicYear, setAcademicYear] = useState('2024-25');
  const [rosterVersionId, setRosterVersionId] = useState('');
  const [programmeCode, setProgrammeCode] = useState('');
  const [confidenceLevel, setConfidenceLevel] = useState(0.95);
  const [marginOfError, setMarginOfError] = useState(0.05);
  const [riskTargetedCount, setRiskTargetedCount] = useState(0);

  // Fetch committed roster versions for selection
  const { data: rosterVersionsData } = useQuery({
    queryKey: queryKeys.rosters.versions({ institutionId, academicYear }),
    queryFn: () => rosterApi.listVersions({ institutionId, academicYear }),
    enabled: isOpen,
  });

  const committedVersions = rosterVersionsData?.items || [];
  const selectedRosterId = rosterVersionId || committedVersions[0]?._id || '';

  // Preview Query
  const { data: previewData, isLoading: isPreviewLoading } = useQuery({
    queryKey: ['sampling', 'previewSize', selectedRosterId, confidenceLevel, marginOfError, riskTargetedCount],
    queryFn: () =>
      samplingApi.previewSize({
        institutionId,
        rosterVersionId: selectedRosterId,
        academicYear,
        programmeCode: programmeCode || undefined,
        confidenceLevel,
        marginOfError,
        riskTargetedCount,
      }),
    enabled: Boolean(selectedRosterId && isOpen),
  });

  // Create Run Mutation
  const createMutation = useMutation({
    mutationFn: () =>
      samplingApi.createRun({
        institutionId,
        rosterVersionId: selectedRosterId,
        academicYear,
        programmeCode: programmeCode || undefined,
        samplingParameters: {
          confidenceLevel,
          marginOfError,
          expectedProportion: 0.5,
        },
        riskTargetedCount,
      }),
    onSuccess: (run) => {
      toast.success(
        `Sampling run ${run.runId} initiated: ${run.totalSampleSize || run.sampleSize || 'sample'} items drawn cryptographically.`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.sampling.runs({}) });
      onClose();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to create sampling run';
      toast.error(msg);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-400" />
            Cochran Formula + Finite Population Correction Calculator
          </DialogTitle>
          <DialogDescription>
            Calculates mathematically rigorous sample sizes based on Cochran&apos;s formula: <span className="font-mono text-indigo-300">n₀ = (Z² × p × (1-p)) / e²</span> with FPC adjustment: <span className="font-mono text-indigo-300">n = n₀ / (1 + (n₀ - 1) / N)</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Target Version & Year */}
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
                  value={selectedRosterId}
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
                  placeholder="Enter Roster Version ID"
                  className="font-mono text-xs"
                />
              )}
            </div>
          </div>

          {/* Statistical Knobs */}
          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl space-y-4">
            <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
              Statistical Assurance Parameters
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Confidence Level Z ({Math.round(confidenceLevel * 100)}%)
                </label>
                <select
                  value={confidenceLevel}
                  onChange={(e) => setConfidenceLevel(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 font-mono"
                >
                  <option value={0.90}>90% Confidence (Z = 1.645)</option>
                  <option value={0.95}>95% Confidence (Z = 1.960)</option>
                  <option value={0.99}>99% Confidence (Z = 2.576)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Margin of Error e ({Math.round(marginOfError * 100)}%)
                </label>
                <select
                  value={marginOfError}
                  onChange={(e) => setMarginOfError(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 font-mono"
                >
                  <option value={0.03}>±3% Precision</option>
                  <option value={0.05}>±5% Standard (Regulatory Default)</option>
                  <option value={0.07}>±7% Tolerated</option>
                  <option value={0.10}>±10% Screening</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Risk-Targeted Sample
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={riskTargetedCount}
                  onChange={(e) => setRiskTargetedCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Mathematical Results Preview */}
          {previewData && (
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
              <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Computed Stratified Sample Size Breakdown
              </span>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-center pt-1">
                <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Population (N)</span>
                  <span className="text-lg font-bold font-mono text-slate-200">{previewData.populationSize}</span>
                </div>

                <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Cochran (n₀)</span>
                  <span className="text-lg font-bold font-mono text-slate-200">{previewData.cochranInitialSize}</span>
                </div>

                <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800">
                  <span className="text-[10px] text-teal-400 uppercase font-semibold block">FPC Random Sample</span>
                  <span className="text-lg font-bold font-mono text-teal-400">{previewData.recommendedRandomSample}</span>
                </div>

                <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800">
                  <span className="text-[10px] text-indigo-400 uppercase font-semibold block">Total Sample (n)</span>
                  <span className="text-lg font-bold font-mono text-indigo-300">
                    {previewData.totalSampleSize || (previewData.recommendedRandomSample + previewData.riskTargetedCount)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {isPreviewLoading && (
            <div className="py-6 text-center text-xs text-slate-400">
              Evaluating population size and computing FPC...
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={createMutation.isPending || !selectedRosterId}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Drawing Cryptographic Sample...' : 'Draw Assurance Sample Run'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
