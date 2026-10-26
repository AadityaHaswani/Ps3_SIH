import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { rosterApi, SealVerificationResult } from '../../../api/modules/roster.api';
import { queryKeys } from '../../../api/queryKeys';
import type { RosterVersion } from '../../../types/models';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  Fingerprint,
  RefreshCw,
  FileCode,
  Lock,
} from 'lucide-react';

interface VerifySealModalProps {
  version: RosterVersion | null;
  isOpen: boolean;
  onClose: () => void;
}

export const VerifySealModal: React.FC<VerifySealModalProps> = ({
  version,
  isOpen,
  onClose,
}) => {
  const versionId = version?.id || version?._id || '';
  const [verificationResult, setVerificationResult] = useState<SealVerificationResult | null>(null);
  const [receiptJson, setReceiptJson] = useState<any>(null);

  // Seal Query
  const { data: sealData, isLoading: isLoadingSeal } = useQuery({
    queryKey: queryKeys.rosters.seal(versionId),
    queryFn: () => rosterApi.getSeal(versionId),
    enabled: Boolean(versionId && isOpen),
  });

  // Verify Seal Mutation (allowed for Auditors, Authority, Platform Admins)
  const verifyMutation = useMutation({
    mutationFn: () => rosterApi.verifySeal(versionId),
    onSuccess: (data) => {
      setVerificationResult(data);
      if (data.valid) {
        toast.success('Cryptographic verification passed: Merkle root and Ed25519 signature valid.');
      } else {
        toast.error('Cryptographic verification failed: Tamper detected or invalid root.');
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || err.message || 'Seal verification failed';
      toast.error(msg);
    },
  });

  // Receipt Query / Download
  const handleDownloadReceipt = async () => {
    try {
      const receipt = await rosterApi.getReceipt(versionId);
      setReceiptJson(receipt);
      const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roster-receipt-v${version?.versionNumber || 1}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Signed cryptographic receipt downloaded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to download receipt');
    }
  };

  if (!version) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-teal-400" />
            Cryptographic Merkle Seal Verification
          </DialogTitle>
          <DialogDescription>
            Audit Version <span className="font-mono text-teal-300 font-semibold">v{version.versionNumber}</span> against SHA-256 Merkle root trees and Ed25519 digital signatures.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Manifest metadata */}
          <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-teal-400" />
                Seal Manifest
              </span>
              <Badge variant="verified" size="sm">
                Ed25519 Sealed
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Merkle Root Hash</span>
                <span className="font-mono text-teal-300 text-[11px] break-all select-all">
                  {sealData?.merkleRoot || version.merkleRoot || '—'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Algorithm</span>
                  <span className="font-mono text-slate-300">{sealData?.algorithm || 'SHA-256 + Ed25519'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Leaf Rows</span>
                  <span className="font-mono text-slate-300">{sealData?.leafCount || version.rowCount || 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Tree Depth</span>
                  <span className="font-mono text-slate-300">{sealData?.treeDepth || Math.ceil(Math.log2(version.rowCount || 2))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Verification Trigger & Output */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Independent Audit Verification
              </h4>
              <Button
                variant="primary"
                size="sm"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
                className="gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${verifyMutation.isPending ? 'animate-spin' : ''}`} />
                {verifyMutation.isPending ? 'Computing Hashes...' : 'Execute Seal Verification'}
              </Button>
            </div>

            {verificationResult && (
              <div
                className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                  verificationResult.valid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {verificationResult.valid ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1.5 text-xs">
                  <div className="font-bold text-sm">
                    {verificationResult.valid
                      ? 'Cryptographic Verification Passed (PASS)'
                      : 'Cryptographic Verification Failed (FAIL)'}
                  </div>
                  <p className="opacity-90 leading-relaxed">
                    {verificationResult.valid
                      ? 'All student row hashes match the reconstructed Merkle tree. The digital signature is authentic and no database record alterations were detected.'
                      : 'Computed Merkle root hash does not match the sealed manifest. Possible database row tampering or truncation.'}
                  </p>

                  <div className="font-mono text-[10px] text-slate-400 pt-1 space-y-0.5">
                    <div>Recorded Root: {verificationResult.merkleRoot}</div>
                    <div>Computed Root: {verificationResult.computedRoot}</div>
                    <div>Verified At: {new Date(verificationResult.verifiedAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tamper Demonstration helper note */}
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1.5 text-xs text-slate-400">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
              Cryptographic Invariance Guarantee
            </span>
            <p className="text-[11px] leading-relaxed">
              Every committed version is hashed into a binary SHA-256 Merkle tree. If any individual student record, grade, or token is modified in MongoDB, the leaf hash changes, causing the root hash to diverge and immediately failing audit verification.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadReceipt}
              className="gap-1.5 text-xs text-indigo-300"
            >
              <Download className="w-3.5 h-3.5" />
              Download Signed Receipt JSON
            </Button>

            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
