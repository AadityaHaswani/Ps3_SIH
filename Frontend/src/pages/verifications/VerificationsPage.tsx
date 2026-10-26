import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { systemApi, type VerificationFilters } from '@/api/modules/system.api';
import { queryKeys } from '@/api/queryKeys';
import { useAuth, Can } from '@/auth';
import {
  ShieldCheck,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileCheck2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { RequestVerificationModal } from './RequestVerificationModal';
import { ReviewVerificationModal } from './ReviewVerificationModal';
import type { VerificationRecord } from '@/types/models';

const STATUS_TABS = ['ALL', 'PENDING', 'VERIFIED', 'REJECTED', 'CONFLICT', 'UNABLE_TO_VERIFY'];

export const VerificationsPage: React.FC = () => {
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('ALL');
  const [subjectTypeFilter, setSubjectTypeFilter] = useState('ALL');
  const [searchSubject, setSearchSubject] = useState('');

  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [reviewingRecord, setReviewingRecord] = useState<VerificationRecord | null>(null);

  const activeFilters: VerificationFilters = {
    page,
    limit: 20,
    ...(activeTab !== 'ALL' ? { status: activeTab } : {}),
    ...(subjectTypeFilter !== 'ALL' ? { subjectType: subjectTypeFilter } : {}),
    ...(user?.institutionId ? { institutionId: user.institutionId } : {}),
  };

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: queryKeys.verifications.list(activeFilters as Record<string, unknown>),
    queryFn: () => systemApi.listVerifications(activeFilters),
  });

  const records = data?.items || [];
  const pagination = data?.pagination;

  const filteredRecords = records.filter((r) => {
    if (!searchSubject.trim()) return true;
    return r.subjectId.toLowerCase().includes(searchSubject.toLowerCase());
  });

  const getLabelBadge = (label: string) => {
    switch (label) {
      case 'AUTHORITY_VERIFIED':
        return <Badge variant="success" size="sm">AUTHORITY VERIFIED</Badge>;
      case 'AUTHORITY_VERIFIED_SIMULATED':
        return <Badge variant="warning" size="sm">SIMULATED VERIFIED</Badge>;
      case 'SELF_DECLARED':
        return <Badge variant="outline" size="sm">SELF DECLARED</Badge>;
      case 'CONFLICT':
        return <Badge variant="destructive" size="sm">CONFLICT</Badge>;
      default:
        return <Badge variant="outline" size="sm">{label}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            VERIFIED
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            PENDING REVIEW
          </span>
        );
      case 'CONFLICT':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500">
            <AlertTriangle className="w-3.5 h-3.5" />
            CONFLICT
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
            <XCircle className="w-3.5 h-3.5" />
            REJECTED
          </span>
        );
      default:
        return <span className="text-[11px] text-muted-foreground">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Field & Intake Verifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Independent verification registry for approved seat intakes and institutional credentials.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Can permission="verification:request">
            <Button size="sm" onClick={() => setIsRequestOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Request Verification
            </Button>
          </Can>
        </div>
      </div>

      {/* Assurance Labels Banner */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="space-y-1">
          <span className="font-semibold text-success flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            AUTHORITY_VERIFIED
          </span>
          <p className="text-muted-foreground leading-relaxed text-[11px]">
            Directly anchored to official government or board registries via authentic cryptographic proof.
          </p>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-amber-500 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            AUTHORITY_VERIFIED_SIMULATED
          </span>
          <p className="text-muted-foreground leading-relaxed text-[11px]">
            Verified through simulated sandbox endpoints. Explicitly tagged to prevent mock data masquerading as live legal clearance.
          </p>
        </div>
        <div className="space-y-1">
          <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
            <FileCheck2 className="w-4 h-4" />
            SELF_DECLARED
          </span>
          <p className="text-muted-foreground leading-relaxed text-[11px]">
            Institution self-attested capacity, awaiting regulatory reconciliation or field audit.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="space-y-3">
        <div className="flex border-b border-border gap-2 overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setPage(1);
              }}
              className={`pb-2.5 px-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by subject ID (e.g. BTECH_CSE_2024)..."
              value={searchSubject}
              onChange={(e) => setSearchSubject(e.target.value)}
              className="w-full text-xs rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>

          <div>
            <select
              value={subjectTypeFilter}
              onChange={(e) => {
                setSubjectTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-xl border border-border bg-background px-3 py-2 text-foreground focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="ALL">All Subject Types</option>
              <option value="SEAT_INTAKE">Seat Intake Capacity</option>
              <option value="STUDENT_ROSTER">Student Roster Record</option>
              <option value="EXAM_REGISTRATION">Exam Registration</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
              <tr>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Field</th>
                <th className="py-3 px-4">Snapshot Value</th>
                <th className="py-3 px-4">Assurance Label</th>
                <th className="py-3 px-4">Source Mode</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
                    Querying verification records...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                    <p className="font-medium text-foreground">No verification records found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Request a verification or adjust the filter parameters.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => (
                  <tr key={rec._id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono font-semibold text-foreground block">
                        {rec.subjectId}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{rec.subjectType}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">{rec.fieldPath}</td>
                    <td className="py-3 px-4 font-mono font-semibold text-foreground">
                      {String(rec.valueSnapshot)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{getLabelBadge(rec.label)}</td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {rec.sourceMode}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{getStatusBadge(rec.status)}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Can permission="verification:review">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReviewingRecord(rec)}
                          className="h-7 text-xs text-primary hover:text-primary font-semibold"
                        >
                          Review Evidence
                        </Button>
                      </Can>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-muted/20">
            <span>
              Showing {filteredRecords.length} of {pagination.total} records (Page {pagination.page}{' '}
              of {pagination.totalPages})
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="h-7 text-xs gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <RequestVerificationModal
        isOpen={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
      />

      <ReviewVerificationModal
        record={reviewingRecord}
        isOpen={Boolean(reviewingRecord)}
        onClose={() => setReviewingRecord(null)}
      />
    </div>
  );
};
