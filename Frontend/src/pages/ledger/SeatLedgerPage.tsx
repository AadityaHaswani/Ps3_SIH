import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth';
import { usePermission } from '../../auth/usePermission';
import { ledgerApi } from '../../api/modules/ledger.api';
import { queryKeys } from '../../api/queryKeys';
import type { SeatBalance } from '../../types/models';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { BucketTable } from './components/BucketTable';
import { BucketDetailDrawer } from './components/BucketDetailDrawer';
import { MassBalanceCalculator } from './components/MassBalanceCalculator';
import { DeclareIntakeModal } from './components/DeclareIntakeModal';
import { ApproveIntakeModal } from './components/ApproveIntakeModal';
import { IntegrityAuditModal } from './components/IntegrityAuditModal';
import {
  FileSpreadsheet,
  PlusCircle,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Scale,
  BookOpen,
  Filter,
  RefreshCw,
  Search,
} from 'lucide-react';

export const SeatLedgerPage: React.FC = () => {
  const { user } = useAuth();
  const institutionId = user?.institutionId || 'SIT-DEMO-01';

  // Permissions
  const canDeclare = usePermission('seat-intake:declare');
  const canApprove = usePermission('seat-intake:approve');
  const canAudit = usePermission('seat-ledger:audit');

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [searchProgramme, setSearchProgramme] = useState('');
  const [academicYear, setAcademicYear] = useState('2024-25');
  const [seatCategory, setSeatCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'balances' | 'massBalance' | 'rules'>('balances');

  // Modal states
  const [selectedBucket, setSelectedBucket] = useState<SeatBalance | null>(null);
  const [isDeclareOpen, setIsDeclareOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [activeBucketForAction, setActiveBucketForAction] = useState<SeatBalance | null>(null);

  // Seat Balances Query
  const {
    data: balancesData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.seatLedger.balances({
      institutionId,
      academicYear: academicYear || undefined,
      programmeCode: searchProgramme || undefined,
      seatCategory: seatCategory || undefined,
      status: statusFilter || undefined,
      page,
      limit: 20,
    }),
    queryFn: () =>
      ledgerApi.getBalances({
        institutionId,
        academicYear: academicYear || undefined,
        programmeCode: searchProgramme || undefined,
        seatCategory: seatCategory || undefined,
        status: statusFilter || undefined,
        page,
        limit: 20,
      }),
  });

  // Occupancy Rules Query
  const { data: rulesData } = useQuery({
    queryKey: queryKeys.seatLedger.rules(true),
    queryFn: () => ledgerApi.getOccupancyRules(true),
    enabled: activeTab === 'rules',
  });

  const buckets = balancesData?.items || [];
  const pagination = balancesData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  // Calculate quick stats from current list
  const countOk = buckets.filter((b: SeatBalance) => b.status === 'OK').length;
  const countWarning = buckets.filter((b: SeatBalance) => b.status === 'WARNING').length;
  const countOverCap = buckets.filter((b: SeatBalance) => b.status === 'OVER_CAP_DISCREPANCY').length;
  const countUnverified = buckets.filter((b: SeatBalance) => b.status === 'INTAKE_UNVERIFIED').length;

  const handleQuickDeclare = (bucket: SeatBalance) => {
    setActiveBucketForAction(bucket);
    setIsDeclareOpen(true);
  };

  const handleQuickApprove = (bucket: SeatBalance) => {
    setActiveBucketForAction(bucket);
    setIsApproveOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-100">Seat Ledger & Capacity Matrix</h1>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            Append-only transactional ledger tracking sanctioned vs actual student enrolment. Ensures double-entry consistency across all institutional cohorts and seat categories.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canAudit && (
            <Button
              onClick={() => setIsAuditOpen(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 border-teal-500/30 text-teal-300 hover:bg-teal-500/10"
            >
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              Verify Ledger Integrity
            </Button>
          )}

          {canApprove && (
            <Button
              onClick={() => {
                setActiveBucketForAction(null);
                setIsApproveOpen(true);
              }}
              variant="outline"
              size="sm"
              className="gap-1.5 text-teal-400 border-teal-500/30 hover:bg-teal-500/10"
            >
              <PlusCircle className="w-4 h-4" />
              Approve Sanctioned Intake
            </Button>
          )}

          {canDeclare && (
            <Button
              onClick={() => {
                setActiveBucketForAction(null);
                setIsDeclareOpen(true);
              }}
              variant="primary"
              size="sm"
              className="gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              Declare Intake Capacity
            </Button>
          )}
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <div className="text-[11px] text-slate-400 font-medium">Total Buckets</div>
          <div className="text-2xl font-bold font-mono text-slate-100 mt-1">{pagination.total}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Across all cohorts</div>
        </Card>

        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Healthy Capacity
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{countOk}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">&lt;90% utilised</div>
        </Card>

        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <div className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" /> Warning Near Cap
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{countWarning}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">≥90% utilised</div>
        </Card>

        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <div className="text-[11px] text-rose-400 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Over-Cap Discrepancies
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1">{countOverCap}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">&gt;100% capacity</div>
        </Card>

        <Card className="p-3 bg-slate-900/60 border-slate-800 col-span-2 md:col-span-1">
          <div className="text-[11px] text-blue-400 font-medium flex items-center gap-1">
            <Layers className="w-3 h-3" /> Unverified Declarations
          </div>
          <div className="text-2xl font-bold font-mono text-blue-400 mt-1">{countUnverified}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Pending authority check</div>
        </Card>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('balances')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === 'balances'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Seat Balance Matrix
        </button>

        <button
          onClick={() => setActiveTab('massBalance')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === 'massBalance'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          Cohort Mass-Balance Calculator
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === 'rules'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Occupancy Governance Rules
        </button>
      </div>

      {/* Tab 1: Balances & Table */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <Card className="p-3 bg-slate-900/60 border-slate-800">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[180px]">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={searchProgramme}
                    onChange={(e) => {
                      setSearchProgramme(e.target.value.toUpperCase());
                      setPage(1);
                    }}
                    placeholder="Search Programme Code (e.g. CS-BTECH)..."
                    className="pl-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="w-36">
                <select
                  value={academicYear}
                  onChange={(e) => {
                    setAcademicYear(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                >
                  <option value="">All Academic Years</option>
                  <option value="2024-25">2024-25</option>
                  <option value="2023-24">2023-24</option>
                  <option value="2022-23">2022-23</option>
                </select>
              </div>

              <div className="w-36">
                <select
                  value={seatCategory}
                  onChange={(e) => {
                    setSeatCategory(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                >
                  <option value="">All Categories</option>
                  <option value="ALL">ALL (Aggregated)</option>
                  <option value="GENERAL">GENERAL</option>
                  <option value="OBC">OBC</option>
                  <option value="SC">SC</option>
                  <option value="ST">ST</option>
                  <option value="EWS">EWS</option>
                </select>
              </div>

              <div className="w-44">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">All Statuses</option>
                  <option value="OK">OK</option>
                  <option value="WARNING">WARNING (≥90%)</option>
                  <option value="OVER_CAP_DISCREPANCY">OVER_CAP_DISCREPANCY</option>
                  <option value="INTAKE_UNVERIFIED">INTAKE_UNVERIFIED</option>
                  <option value="NO_INTAKE_CONFIGURED">NO_INTAKE_CONFIGURED</option>
                </select>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchProgramme('');
                  setAcademicYear('2024-25');
                  setSeatCategory('');
                  setStatusFilter('');
                  setPage(1);
                }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Reset Filters
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 px-2.5 ml-auto text-xs gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </Card>

          {/* Table */}
          <BucketTable
            buckets={buckets}
            isLoading={isLoading}
            onSelectBucket={(b) => setSelectedBucket(b)}
            onQuickDeclare={canDeclare ? handleQuickDeclare : undefined}
            onQuickApprove={canApprove ? handleQuickApprove : undefined}
            canDeclare={canDeclare}
            canApprove={canApprove}
          />

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <div>
                Showing page <span className="font-semibold text-slate-200">{pagination.page}</span> of{' '}
                <span className="font-semibold text-slate-200">{pagination.totalPages}</span> ({pagination.total} total buckets)
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
      )}

      {/* Tab 2: Mass Balance Calculator */}
      {activeTab === 'massBalance' && (
        <MassBalanceCalculator
          institutionId={institutionId}
          defaultProgramme="CS-BTECH"
          defaultAcademicYear="2024-25"
        />
      )}

      {/* Tab 3: Occupancy Governance Rules */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <Card className="p-4 bg-slate-900/60 border-slate-800">
            <h3 className="font-semibold text-sm text-slate-100 mb-1">Configured Occupancy Rules</h3>
            <p className="text-xs text-slate-400">
              Rules defining utilisation thresholds, active counting strategies, and policy citations.
            </p>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rulesData?.map((rule) => (
              <Card key={rule._id} className="p-4 bg-slate-900/60 border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-sm text-indigo-300 font-mono">{rule.name}</h4>
                    <span className="text-[11px] font-mono text-slate-400">{rule.ruleVersion}</span>
                  </div>
                  <Badge variant={rule.isActive ? 'verified' : 'outline'} size="sm">
                    {rule.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {rule.description || 'Standard capacity compliance rule.'}
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Warning Threshold</span>
                    <span className="font-mono font-semibold text-amber-400">{rule.warningThresholdPct}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Counting Strategy</span>
                    <span className="font-mono text-slate-300">{rule.countingStrategy || 'STANDARD_OCCUPANCY'}</span>
                  </div>
                  {rule.policySourceRef && (
                    <div className="col-span-2">
                      <span className="text-[10px] text-slate-500 block">Policy Source Reference</span>
                      <span className="font-mono text-[11px] text-slate-400">{rule.policySourceRef}</span>
                    </div>
                  )}
                </div>
              </Card>
            ))}

            {(!rulesData || rulesData.length === 0) && (
              <div className="col-span-2 p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
                No occupancy rules configured or loaded.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bucket Detail Modal */}
      <BucketDetailDrawer
        bucket={selectedBucket}
        isOpen={Boolean(selectedBucket)}
        onClose={() => setSelectedBucket(null)}
      />

      {/* Declare Intake Modal */}
      <DeclareIntakeModal
        isOpen={isDeclareOpen}
        onClose={() => setIsDeclareOpen(false)}
        institutionId={institutionId}
        defaultProgramme={activeBucketForAction?.programmeCode || 'CS-BTECH'}
        defaultAcademicYear={activeBucketForAction?.academicYear || '2024-25'}
      />

      {/* Approve Intake Modal */}
      <ApproveIntakeModal
        isOpen={isApproveOpen}
        onClose={() => setIsApproveOpen(false)}
        institutionId={institutionId}
        defaultProgramme={activeBucketForAction?.programmeCode || 'CS-BTECH'}
        defaultAcademicYear={activeBucketForAction?.academicYear || '2024-25'}
        defaultCategory={activeBucketForAction?.seatCategory || 'ALL'}
        currentApprovedIntake={activeBucketForAction?.approvedIntake ?? 60}
      />

      {/* Integrity Audit Modal */}
      <IntegrityAuditModal
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
        institutionId={institutionId}
      />
    </div>
  );
};
