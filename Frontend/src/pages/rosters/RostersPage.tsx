import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { usePermission } from '../../auth/usePermission';
import { rosterApi } from '../../api/modules/roster.api';
import { queryKeys } from '../../api/queryKeys';
import type { RosterVersion } from '../../types/models';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { RosterUploadModal } from './components/RosterUploadModal';
import { VersionCompareModal } from './components/VersionCompareModal';
import { ImpactAssessmentDrawer } from './components/ImpactAssessmentDrawer';
import { VerifySealModal } from './components/VerifySealModal';
import {
  FileCode,
  UploadCloud,
  ShieldCheck,
  GitCompare,
  Activity,
  Download,
  Copy,
  RefreshCw,
  CheckCircle2,
  Clock,
  Layers,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

export const RostersPage: React.FC = () => {
  const { user } = useAuth();
  const institutionId = user?.institutionId || 'SIT-DEMO-01';

  // Permissions
  const canUpload = usePermission('rosters:upload');

  const [academicYear, setAcademicYear] = useState('2024-25');
  const [page, setPage] = useState(1);

  // Modal states
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedVersionForCompare, setSelectedVersionForCompare] = useState<RosterVersion | null>(null);
  const [selectedVersionForImpact, setSelectedVersionForImpact] = useState<RosterVersion | null>(null);
  const [selectedVersionForSeal, setSelectedVersionForSeal] = useState<RosterVersion | null>(null);

  // Chain-head query
  const { data: chainHeadData, isLoading: isLoadingChainHead } = useQuery({
    queryKey: queryKeys.rosters.chainHead(institutionId, academicYear),
    queryFn: () => rosterApi.getChainHead(institutionId, academicYear),
  });

  // Versions Query
  const {
    data: versionsData,
    isLoading: isLoadingVersions,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.rosters.versions({ institutionId, academicYear, page }),
    queryFn: () => rosterApi.listVersions({ institutionId, academicYear, page, limit: 15 }),
  });

  const versions = versionsData?.items || [];
  const pagination = versionsData?.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Merkle root hash copied to clipboard');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
              <FileCode className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-100">Roster Versions & Merkle Seal Cryptography</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Immutable student roster versioning chain with cryptographic Ed25519 Merkle tree seals. Auditable proof against unauthorized tampering.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canUpload && (
            <Button
              onClick={() => setIsUploadOpen(true)}
              variant="primary"
              size="sm"
              className="gap-1.5"
            >
              <UploadCloud className="w-4 h-4" />
              Upload New Roster (CSV)
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

      {/* Chain-Head Attestation Hero Card */}
      {chainHeadData && (
        <Card className="p-5 bg-gradient-to-r from-slate-900/90 to-slate-950/90 border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-teal-500/10 text-teal-400">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-200">Current Cryptographic Chain-Head</span>
                <span className="text-[10px] text-slate-400 block font-mono">
                  Institution: <strong className="text-slate-200">{institutionId}</strong> • Academic Year: <strong className="text-slate-200">{academicYear}</strong>
                </span>
              </div>
            </div>

            <Badge variant="verified" size="sm" className="font-mono gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Chain Attested
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs pt-1">
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/70">
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Head Version</span>
              <span className="text-lg font-bold font-mono text-indigo-300">
                v{chainHeadData.versionNumber || chainHeadData.sequenceNumber || 1}
              </span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/70 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase text-slate-500 font-semibold block">Merkle Root</span>
                {chainHeadData.merkleRoot && (
                  <button
                    onClick={() => copyToClipboard(chainHeadData.merkleRoot!)}
                    className="text-slate-500 hover:text-slate-300 text-[10px] flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
              </div>
              <span className="font-mono text-teal-300 text-[11px] truncate block select-all mt-1">
                {chainHeadData.merkleRoot || '—'}
              </span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/70">
              <span className="text-[10px] uppercase text-slate-500 font-semibold block">Attestation Date</span>
              <span className="font-mono text-slate-300 text-xs block mt-1">
                {(chainHeadData.committedAt || chainHeadData.attestedAt)
                  ? new Date((chainHeadData.committedAt || chainHeadData.attestedAt)!).toLocaleDateString()
                  : 'Recent'}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Version Chain Table */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-100">Committed Versions Timeline</h3>
          </div>

          <div className="w-36">
            <select
              value={academicYear}
              onChange={(e) => {
                setAcademicYear(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              <option value="2024-25">2024-25</option>
              <option value="2023-24">2023-24</option>
              <option value="2022-23">2022-23</option>
            </select>
          </div>
        </div>

        {isLoadingVersions && (
          <div className="py-14 text-center text-xs text-slate-400 border border-slate-800 rounded-xl bg-slate-900/40">
            Loading committed roster versions...
          </div>
        )}

        {!isLoadingVersions && versions.length === 0 && (
          <div className="p-10 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/40 space-y-2">
            <p className="text-sm font-semibold text-slate-300">No committed versions found for this academic year.</p>
            <p className="text-xs text-slate-500">
              Upload a student roster CSV to generate the initial version and Merkle seal.
            </p>
          </div>
        )}

        {!isLoadingVersions && versions.length > 0 && (
          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/50 shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                <tr>
                  <th className="p-3">Version</th>
                  <th className="p-3">Records</th>
                  <th className="p-3">Merkle Root Hash</th>
                  <th className="p-3">Integrity Seal</th>
                  <th className="p-3">Committed Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {versions.map((v) => (
                  <tr key={v._id || v.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3">
                      <div className="font-mono font-bold text-indigo-300 text-sm">
                        v{v.versionNumber}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {v.programmeCode || 'ALL_PROGRAMMES'}
                      </span>
                    </td>

                    <td className="p-3 font-mono font-semibold text-slate-100">
                      {v.rowCount} records
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-teal-300">
                        <span className="truncate max-w-[180px]">{v.merkleRoot || '—'}</span>
                        {v.merkleRoot && (
                          <button
                            onClick={() => copyToClipboard(v.merkleRoot!)}
                            className="text-slate-500 hover:text-slate-300"
                            title="Copy Merkle root"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={v.isSealed ? 'verified' : 'outline'} size="sm">
                          {v.isSealed ? 'Ed25519 Sealed' : 'Pending Seal'}
                        </Badge>
                        {v.isAnchored && (
                          <Badge variant="outline" size="sm" className="font-mono text-[10px] text-indigo-400">
                            Seq #{v.anchorSequence}
                          </Badge>
                        )}
                      </div>
                    </td>

                    <td className="p-3 text-slate-400 whitespace-nowrap text-[11px] font-mono">
                      {new Date(v.committedAt).toLocaleDateString()}
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          onClick={() => setSelectedVersionForSeal(v)}
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-teal-400 hover:text-teal-300 gap-1"
                          title="Verify cryptographic Merkle seal"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verify Seal
                        </Button>

                        <Button
                          onClick={() => setSelectedVersionForCompare(v)}
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-indigo-400 hover:text-indigo-300 gap-1"
                          title="Compare version diff"
                        >
                          <GitCompare className="w-3.5 h-3.5" />
                          Diff
                        </Button>

                        <Button
                          onClick={() => setSelectedVersionForImpact(v)}
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200 gap-1"
                          title="Inspect blast-radius impact"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          Impact
                        </Button>
                      </div>
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
              <span className="font-semibold text-slate-200">{pagination.totalPages}</span> ({pagination.total} versions)
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
      </div>

      {/* Modals */}
      <RosterUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        institutionId={institutionId}
      />

      <VersionCompareModal
        version={selectedVersionForCompare}
        isOpen={Boolean(selectedVersionForCompare)}
        onClose={() => setSelectedVersionForCompare(null)}
      />

      <ImpactAssessmentDrawer
        version={selectedVersionForImpact}
        isOpen={Boolean(selectedVersionForImpact)}
        onClose={() => setSelectedVersionForImpact(null)}
      />

      <VerifySealModal
        version={selectedVersionForSeal}
        isOpen={Boolean(selectedVersionForSeal)}
        onClose={() => setSelectedVersionForSeal(null)}
      />
    </div>
  );
};
