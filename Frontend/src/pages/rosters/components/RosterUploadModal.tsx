import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { rosterApi } from '../../../api/modules/roster.api';
import { queryKeys } from '../../../api/queryKeys';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface RosterUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  institutionId: string;
}

export const RosterUploadModal: React.FC<RosterUploadModalProps> = ({
  isOpen,
  onClose,
  institutionId,
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [academicYear, setAcademicYear] = useState('2024-25');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [step, setStep] = useState<'SELECT' | 'PREVIEW' | 'COMMITTED'>('SELECT');
  const [uploadRecord, setUploadRecord] = useState<any>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error('No file selected');
      return rosterApi.uploadCsv(selectedFile, academicYear, institutionId);
    },
    onSuccess: async (data: any) => {
      setUploadRecord(data);
      try {
        const preview = await rosterApi.getPreview(data._id || data.id);
        setPreviewData(preview);
      } catch (_) {
        // Fallback if preview endpoint returns early
      }
      setStep('PREVIEW');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'CSV upload failed';
      setErrorMsg(msg);
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: () => rosterApi.commitUpload(uploadRecord._id || uploadRecord.id),
    onSuccess: (version) => {
      toast.success(
        `Immutable Roster Version v${version.versionNumber} successfully sealed and committed with Merkle root.`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.rosters.versions({ institutionId }) });
      queryClient.invalidateQueries({ queryKey: queryKeys.seatLedger.all });
      setStep('COMMITTED');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Commit failed';
      setErrorMsg(msg);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith('.csv')) {
        setErrorMsg('Invalid file format. Only standard .csv files are supported.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setErrorMsg('File exceeds statutory 10MB limit.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const resetAndClose = () => {
    setSelectedFile(null);
    setUploadRecord(null);
    setPreviewData(null);
    setStep('SELECT');
    setErrorMsg(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetAndClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-indigo-400" />
            Upload Institutional Student Roster (CSV)
          </DialogTitle>
          <DialogDescription>
            Multi-column student enrolment roster upload. Validates APAAR tokens, masks personal data, and constructs a verifiable cryptographic Merkle tree.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-md flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: SELECT & UPLOAD */}
        {step === 'SELECT' && (
          <div className="space-y-4 py-2">
            <div className="w-48">
              <label className="text-xs font-medium text-slate-300 block mb-1">Academic Year</label>
              <Input
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2024-25"
                className="font-mono text-xs"
              />
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-8 border-2 border-dashed border-slate-700 hover:border-indigo-500/60 rounded-xl bg-slate-900/40 text-center cursor-pointer transition-colors space-y-3"
            >
              <FileSpreadsheet className="w-10 h-10 mx-auto text-indigo-400" />
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  {selectedFile ? selectedFile.name : 'Click or drag & drop CSV roster file'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB selected`
                    : 'Maximum upload size: 10MB • Columns: apaarToken, studentName, programmeCode, academicYear, category, admissionDate'}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!selectedFile || uploadMutation.isPending}
                onClick={() => uploadMutation.mutate()}
              >
                {uploadMutation.isPending ? 'Validating & Uploading...' : 'Upload & Inspect Preview'}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW & VALIDATION RESULTS */}
        {step === 'PREVIEW' && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Rows</span>
                <span className="text-xl font-bold font-mono text-slate-100">
                  {uploadRecord?.rowCount || uploadRecord?.totalRows || previewData?.rowCount || 0}
                </span>
              </div>

              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Valid Rows</span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {uploadRecord?.validRowCount ?? uploadRecord?.rowCount ?? 0}
                </span>
              </div>

              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                <span className="text-[10px] text-rose-400 uppercase font-semibold block">Validation Errors</span>
                <span className="text-xl font-bold font-mono text-rose-400">
                  {uploadRecord?.invalidRowsCount || 0}
                </span>
              </div>
            </div>

            {/* Validation errors warning if any */}
            {uploadRecord?.invalidRowsCount > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Row Validation Warnings Detected
                </div>
                <p className="text-[11px] leading-relaxed">
                  Some rows have invalid tokens or missing mandatory fields. Committing will seal the valid cohort and record validation error logs.
                </p>
              </div>
            )}

            {/* Preview table snippet */}
            {previewData?.sampleRows && previewData.sampleRows.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Sample Masked Preview
                </span>
                <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-48">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2">Name (Masked)</th>
                        <th className="p-2">APAAR Token</th>
                        <th className="p-2">Programme</th>
                        <th className="p-2">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      {previewData.sampleRows.slice(0, 5).map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/40">
                          <td className="p-2">{row.studentNameMasked || row.studentName}</td>
                          <td className="p-2 font-mono text-indigo-300">{row.apaarTokenMasked || row.apaarToken}</td>
                          <td className="p-2 font-mono">{row.programmeCode}</td>
                          <td className="p-2 font-mono">{row.category || 'GENERAL'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-[11px] text-slate-400 leading-relaxed">
              <strong className="text-slate-300">Statutory Commit:</strong> Committing freezes this uploaded cohort as an immutable, cryptographically sealed RosterVersion with an Ed25519-signed Merkle root.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setStep('SELECT')}>
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={commitMutation.isPending}
                onClick={() => commitMutation.mutate()}
              >
                {commitMutation.isPending ? 'Sealing & Committing...' : 'Commit Immutable Version'}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: COMMITTED SUCCESS */}
        {step === 'COMMITTED' && (
          <div className="p-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-slate-100">Roster Successfully Committed</h3>
              <p className="text-xs text-slate-400 mt-1">
                The roster is now active in the immutable version chain. All student records are indexed for reconciliation.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={resetAndClose}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
