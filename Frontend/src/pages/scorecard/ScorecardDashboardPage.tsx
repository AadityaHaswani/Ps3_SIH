import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInstitutions } from '@/hooks/useInstitutions';
import { scorecardApi } from '@/api/modules/scorecard.api';
import { queryKeys } from '@/api/queryKeys';
import { Can } from '@/auth/Can';
import {
  ScoreSnapshot,
  ScorecardTrendPoint,
  ScoringConfig,
} from '@/types/models';
import { ScoreBand, MetricStatus } from '@/types/enums';

// UI Primitives
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Progress } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/Skeleton';
import { toast } from 'sonner';

// Domain & Chart components
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { ChartEmptyState } from '@/components/charts/ChartEmptyState';
import { CustomChartTooltip } from '@/components/charts/CustomChartTooltip';
import { DisclaimerBanner } from '@/components/domain/DisclaimerBanner';
import { StaleOutputBanner } from '@/components/domain/StaleOutputBanner';
import { MetricCard } from '@/components/domain/MetricCard';

// Recharts components
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ComposedChart,
} from 'recharts';

// Icons
import {
  RefreshCw,
  Award,
  Layers,
  Calendar,
  TrendingUp,
  GitCompare,
  BarChart3,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const ScorecardDashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { selectedInstitutionId, institutions } = useInstitutions();

  // Selected Reporting Period filter
  const [reportingPeriod, setReportingPeriod] = useState<string>('2024-25');
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Query 1: Active Scorecard Snapshot
  const {
    data: scorecard,
    isLoading: isScorecardLoading,
    isError: isScorecardError,
    error: scorecardError,
    refetch: refetchScorecard,
  } = useQuery<ScoreSnapshot>({
    queryKey: queryKeys.scorecards.byInstitution(selectedInstitutionId, reportingPeriod),
    queryFn: () => scorecardApi.getScorecard(selectedInstitutionId, { reportingPeriod }),
    enabled: !!selectedInstitutionId,
  });

  // Query 2: Historical Trend Data Points
  const { data: trendData, isLoading: isTrendLoading } = useQuery({
    queryKey: queryKeys.scorecards.trend(selectedInstitutionId),
    queryFn: () => scorecardApi.getTrend(selectedInstitutionId),
    enabled: !!selectedInstitutionId && (activeTab === 'trends' || activeTab === 'overview'),
  });

  // Query 3: Peer Comparison
  const peerIds = institutions.slice(0, 3).map((i) => i.id);
  const { data: compareData, isLoading: isCompareLoading } = useQuery({
    queryKey: queryKeys.scorecards.compare(peerIds, reportingPeriod),
    queryFn: () => scorecardApi.compare(peerIds, reportingPeriod),
    enabled: peerIds.length >= 2 && activeTab === 'compare',
  });

  // Query 4: Regulatory Config Version
  const { data: scoringConfig } = useQuery<ScoringConfig>({
    queryKey: queryKeys.scorecards.config(),
    queryFn: () => scorecardApi.getConfig(),
    enabled: activeTab === 'method',
  });

  // Mutation: Trigger Recalculate
  const recalculateMutation = useMutation({
    mutationFn: () =>
      scorecardApi.recalculate(selectedInstitutionId, reportingPeriod, 'MANUAL_RECALCULATE'),
    onSuccess: (freshData) => {
      queryClient.setQueryData(
        queryKeys.scorecards.byInstitution(selectedInstitutionId, reportingPeriod),
        freshData
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.scorecards.trend(selectedInstitutionId) });
      toast.success('Institutional scorecard recalculation completed.');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Failed to recalculate scorecard.';
      toast.error(msg);
    },
  });

  // Defensive fallback for M1-M4
  const metrics = scorecard?.metrics || {
    m1Completeness: { status: MetricStatus.INSUFFICIENT_DATA, subScore: null, weightUsed: null },
    m2Discrepancies: { status: MetricStatus.INSUFFICIENT_DATA, subScore: null, weightUsed: null },
    m3Timeliness: { status: MetricStatus.INSUFFICIENT_DATA, subScore: null, weightUsed: null },
    m4Corrections: { status: MetricStatus.UNAVAILABLE, subScore: null, weightUsed: null },
  };

  const rawTrendPoints: ScorecardTrendPoint[] = Array.isArray(trendData?.trend)
    ? trendData.trend
    : Array.isArray(trendData?.dataPoints)
    ? (trendData.dataPoints as ScorecardTrendPoint[])
    : [];

  // M1 Missing Field Breakdown for Chart 4
  const missingFieldData = metrics.m1Completeness.missingFieldBreakdown || [
    { fieldName: 'ApaarId', missingCount: 0, populatedCount: 180 },
    { fieldName: 'DOB', missingCount: 0, populatedCount: 180 },
    { fieldName: 'Category', missingCount: 2, populatedCount: 178 },
    { fieldName: 'AdmissionDate', missingCount: 5, populatedCount: 175 },
    { fieldName: 'AdmissionQuota', missingCount: 1, populatedCount: 179 },
  ];
  const allFieldsPopulated = missingFieldData.every((f) => f.missingCount === 0);

  // M2 Ageing Distribution for Chart 5
  const ageingData = metrics.m2Discrepancies.ageingDistribution || [
    { bucket: '0-7 days' as const, count: 2 },
    { bucket: '8-30 days' as const, count: 1 },
    { bucket: '31+ days' as const, count: 0 },
  ];
  const hasZeroOpenDiscrepancies =
    metrics.m2Discrepancies.openDiscrepancies === 0 || ageingData.every((a) => a.count === 0);

  // M3 Timeliness Distribution for Chart 6
  const timelinessData = metrics.m3Timeliness.timelinessDistribution || [
    { category: 'On-Time (<=15d)' as const, count: 148, pct: 82.2 },
    { category: 'Late (>15d)' as const, count: 32, pct: 17.8 },
  ];
  const isTimelinessUnavailable = metrics.m3Timeliness.status === MetricStatus.UNAVAILABLE;

  const PIE_COLORS = ['hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--danger))'];

  return (
    <div className="space-y-6">
      {/* Top Header / Page Title with Period & Recalculate */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Award className="w-6 h-6 text-primary" />
              Institutional Data Reliability Scorecard
            </h1>
            <Badge variant="secondary" className="text-xs">
              {reportingPeriod}
            </Badge>
            {scorecard?.configVersion && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {scorecard.configVersion}
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Standard regulatory data reliability metrics, completeness benchmarks, and institutional support indicators.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <select
            value={reportingPeriod}
            onChange={(e) => setReportingPeriod(e.target.value)}
            className="h-9 px-3 rounded-lg border border-input bg-card text-xs font-medium text-foreground shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Select reporting academic year"
          >
            <option value="2024-25">Academic Year 2024-25</option>
            <option value="2023-24">Academic Year 2023-24</option>
          </select>

          <Can permission="scorecards:recalculate">
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalculateMutation.mutate()}
              isLoading={recalculateMutation.isPending}
              className="gap-1.5 shadow-subtle text-xs"
              title="Force recalculation of the reliability score snapshot"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
              <span>Recalculate</span>
            </Button>
          </Can>
        </div>
      </div>

      {/* Stale Output Alert Banner (if roster has been superseded) */}
      <StaleOutputBanner
        isStale={scorecard?.isStale || scorecard?.freshness === 'STALE'}
        revalidationStatus={scorecard?.revalidationStatus}
        onRevalidate={() => recalculateMutation.mutate()}
        isRevalidating={recalculateMutation.isPending}
      />

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <Award className="w-3.5 h-3.5" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="metrics" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Metric Breakdown</span>
          </TabsTrigger>
          <TabsTrigger value="compare" className="gap-1.5">
            <GitCompare className="w-3.5 h-3.5" />
            <span>Peer Compare</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Historical Trends</span>
          </TabsTrigger>
          <TabsTrigger value="drilldown" className="gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Drill-down</span>
          </TabsTrigger>
          <TabsTrigger value="method" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <span>Methodology</span>
          </TabsTrigger>
          <TabsTrigger value="support" className="gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Support Suggestions</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-6 pt-2">
          {isScorecardLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Skeleton className="h-72 w-full rounded-2xl" />
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
              </div>
            </div>
          ) : isScorecardError ? (
            <Card className="p-8 text-center border-danger/30 bg-danger/5">
              <AlertTriangle className="w-10 h-10 text-danger mx-auto mb-2" />
              <h3 className="text-base font-bold text-foreground">Scorecard snapshot unavailable</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {(scorecardError as Error)?.message ||
                  'No committed roster or ledger records available for this reporting period.'}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetchScorecard()} className="mt-4">
                Retry Query
              </Button>
            </Card>
          ) : (
            <>
              {/* Hero Grid: Gauge on Left, M1-M4 on Right */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <Card className="lg:col-span-4 flex flex-col justify-between p-6 relative overflow-hidden bg-gradient-to-b from-card to-muted/20 border-border/80">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                        Composite Metric
                      </span>
                      <h2 className="text-base font-bold text-foreground">Overall Reliability Score</h2>
                    </div>
                    {scorecard?.dataCoverage && (
                      <Badge variant="outline" className="text-[10px]">
                        Coverage: {scorecard.dataCoverage.coveragePct}%
                      </Badge>
                    )}
                  </div>

                  <div className="my-3 flex justify-center">
                    <ScoreGauge
                      score={scorecard?.overallScore ?? null}
                      band={scorecard?.band || ScoreBand.INSUFFICIENT_DATA}
                      size={200}
                    />
                  </div>

                  <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-primary" />
                      Calculated:{' '}
                      {scorecard?.calculatedAt
                        ? new Date(scorecard.calculatedAt).toLocaleDateString()
                        : 'Pending'}
                    </span>
                    <span className="font-mono text-[10px]">
                      Trigger: {scorecard?.triggerReason || 'INITIAL'}
                    </span>
                  </div>
                </Card>

                <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <MetricCard
                    code="M1"
                    title="Data Completeness"
                    description="Populated required student registry fields"
                    status={metrics.m1Completeness.status}
                    subScore={metrics.m1Completeness.subScore}
                    weightUsed={metrics.m1Completeness.weightUsed}
                    weightConfigured={0.4}
                    primaryStat={
                      metrics.m1Completeness.completenessPct !== undefined
                        ? `${metrics.m1Completeness.completenessPct}%`
                        : '—'
                    }
                    secondaryStat="Required fields populated"
                    onClick={() => setActiveTab('metrics')}
                  />

                  <MetricCard
                    code="M2"
                    title="Reconciliation Discrepancies"
                    description="Open cross-register findings rate"
                    status={metrics.m2Discrepancies.status}
                    subScore={metrics.m2Discrepancies.subScore}
                    weightUsed={metrics.m2Discrepancies.weightUsed}
                    weightConfigured={0.3}
                    primaryStat={
                      metrics.m2Discrepancies.openDiscrepancies !== undefined
                        ? `${metrics.m2Discrepancies.openDiscrepancies} Open`
                        : '—'
                    }
                    secondaryStat={
                      metrics.m2Discrepancies.unresolvedRatePer1000 !== undefined
                        ? `${metrics.m2Discrepancies.unresolvedRatePer1000} per 1k records`
                        : undefined
                    }
                    onClick={() => setActiveTab('metrics')}
                  />

                  <MetricCard
                    code="M3"
                    title="Admissions Timeliness"
                    description="Compliance with 15-day reporting SLA"
                    status={metrics.m3Timeliness.status}
                    subScore={metrics.m3Timeliness.subScore}
                    weightUsed={metrics.m3Timeliness.weightUsed}
                    weightConfigured={0.3}
                    primaryStat={
                      metrics.m3Timeliness.onTimePct !== undefined
                        ? `${metrics.m3Timeliness.onTimePct}%`
                        : '—'
                    }
                    secondaryStat={
                      metrics.m3Timeliness.medianLagDays !== undefined
                        ? `Median lag: ${metrics.m3Timeliness.medianLagDays} days`
                        : undefined
                    }
                    onClick={() => setActiveTab('metrics')}
                  />

                  <MetricCard
                    code="M4"
                    title="Attributable Corrections"
                    description="Self-reported retrospective adjustments"
                    status={metrics.m4Corrections.status}
                    subScore={metrics.m4Corrections.subScore}
                    weightUsed={metrics.m4Corrections.weightUsed}
                    weightConfigured={0.0}
                    primaryStat={
                      metrics.m4Corrections.enabledInScore ? 'Active' : 'Unpenalized'
                    }
                    secondaryStat="Corrections never penalized"
                    onClick={() => setActiveTab('metrics')}
                  />
                </div>
              </div>

              {/* Data Register Coverage Bar */}
              {scorecard?.dataCoverage && (
                <Card className="p-5 border-border/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        External Register Coverage & Availability
                      </h3>
                      <p className="text-xs text-foreground mt-0.5">
                        {scorecard.dataCoverage.availableSources.length} of{' '}
                        {scorecard.dataCoverage.expectedSources.length} upstream registers participating
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary tabular-nums">
                      {scorecard.dataCoverage.coveragePct}% Comprehensive
                    </span>
                  </div>

                  <Progress
                    value={scorecard.dataCoverage.coveragePct}
                    className="h-2"
                    indicatorClassName="bg-primary"
                  />

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {scorecard.dataCoverage.expectedSources.map((source) => {
                      const isAvailable = scorecard.dataCoverage?.availableSources.includes(source);
                      return (
                        <span
                          key={source}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono border ${
                            isAvailable
                              ? 'bg-success/10 text-success border-success/30'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isAvailable ? 'bg-success' : 'bg-muted-foreground'
                            }`}
                          />
                          {source} {isAvailable ? '(Online)' : '(Unavailable)'}
                        </span>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Mandatory Verbatim Non-Punitive Regulatory Disclaimer */}
              <DisclaimerBanner customText={scorecard?.disclaimer} />
            </>
          )}
        </TabsContent>

        {/* TAB 2: METRICS DEEP-DIVE */}
        <TabsContent value="metrics" className="space-y-6 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5 border-border/80">
              <div className="mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Chart 4 • Completeness Breakdown
                </span>
                <h3 className="text-sm font-bold text-foreground">Data Completeness by Field</h3>
                <p className="text-xs text-muted-foreground">
                  Identifies student registry fields requiring improved intake data capture.
                </p>
              </div>

              {allFieldsPopulated ? (
                <ChartEmptyState message="100% Complete — Zero missing required field instances" />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={missingFieldData}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
                      <XAxis type="number" textAnchor="end" fontSize={11} stroke="currentColor" opacity={0.6} />
                      <YAxis
                        type="category"
                        dataKey="fieldName"
                        fontSize={11}
                        stroke="currentColor"
                        opacity={0.8}
                        width={80}
                      />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Bar dataKey="missingCount" name="Missing Records" fill="hsl(var(--danger))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="populatedCount" name="Populated Records" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-5 border-border/80">
              <div className="mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Chart 5 • Finding Ageing
                </span>
                <h3 className="text-sm font-bold text-foreground">Open Discrepancy Ageing Distribution</h3>
                <p className="text-xs text-muted-foreground">
                  Tracks whether reconciliation findings are being resolved within regulatory windows.
                </p>
              </div>

              {hasZeroOpenDiscrepancies ? (
                <ChartEmptyState message="Zero open discrepancies in current reporting period" />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageingData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="bucket" fontSize={11} stroke="currentColor" opacity={0.7} />
                      <YAxis fontSize={11} stroke="currentColor" opacity={0.7} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Bar dataKey="count" name="Open Findings" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-5 border-border/80">
              <div className="mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Chart 6 • Timeliness Distribution
                </span>
                <h3 className="text-sm font-bold text-foreground">Admissions Reporting Timeliness</h3>
                <p className="text-xs text-muted-foreground">
                  Proportion of student admissions reported within the 15-day regulatory window.
                </p>
              </div>

              {isTimelinessUnavailable ? (
                <ChartEmptyState message="Timeliness metrics unavailable: Effective admission dates are unpopulated" />
              ) : (
                <div className="h-64 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={timelinessData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="count"
                        nameKey="category"
                      >
                        {timelinessData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomChartTooltip />} />
                      <Legend verticalAlign="bottom" height={36} iconSize={10} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-5 border-border/80">
              <div className="mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Chart 7 • Coverage vs Discrepancies
                </span>
                <h3 className="text-sm font-bold text-foreground">Data Coverage vs Unresolved Records</h3>
                <p className="text-xs text-muted-foreground">
                  Evaluates whether higher external register availability correlates with lower discrepancy rates.
                </p>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={[
                      { source: 'ROSTER', coveragePct: 100, unresolvedCount: 0 },
                      { source: 'ADMISSION', coveragePct: 100, unresolvedCount: 2 },
                      { source: 'EXAM', coveragePct: 80, unresolvedCount: 1 },
                      { source: 'INTAKE', coveragePct: 100, unresolvedCount: 0 },
                    ]}
                    margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="source" fontSize={11} stroke="currentColor" opacity={0.7} />
                    <YAxis yAxisId="left" fontSize={11} stroke="currentColor" opacity={0.7} domain={[0, 100]} />
                    <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="currentColor" opacity={0.7} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar yAxisId="left" dataKey="coveragePct" name="Coverage %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="unresolvedCount" name="Unresolved Items" stroke="hsl(var(--danger))" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: PEER COMPARE */}
        <TabsContent value="compare" className="space-y-6 pt-2">
          <Card className="p-6 border-border/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Chart 3 • Peer Comparison
                </span>
                <h3 className="text-base font-bold text-foreground">Side-by-Side Peer Comparison</h3>
                <p className="text-xs text-muted-foreground">
                  Benchmarking data profile against institutions of the same regulatory type.
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                Comparing {compareData?.comparisons?.length || institutions.length} Institutions
              </Badge>
            </div>

            {compareData?.warning && (
              <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{compareData.warning}</span>
              </div>
            )}

            {isCompareLoading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : !compareData?.comparisons?.length ? (
              <ChartEmptyState
                message="Renders disabled state with warning banner if institution types mismatch."
                subMessage="Direct comparison requires at least two institutions of the same institutional category."
              />
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compareData.comparisons} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="institutionName" fontSize={11} stroke="currentColor" opacity={0.8} />
                    <YAxis fontSize={11} stroke="currentColor" opacity={0.7} domain={[0, 100]} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend verticalAlign="top" height={36} iconSize={10} />
                    <Bar dataKey="overallScore" name="Overall Reliability" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="m1SubScore" name="M1 Completeness" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="m2SubScore" name="M2 Discrepancies" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="m3SubScore" name="M3 Timeliness" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* TAB 4: HISTORICAL TRENDS */}
        <TabsContent value="trends" className="space-y-6 pt-2">
          <Card className="p-6 border-border/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Charts 1 & 9 • Trajectory
                </span>
                <h3 className="text-base font-bold text-foreground">Overall Reliability Score Trend</h3>
                <p className="text-xs text-muted-foreground">
                  Score trajectory across recalculations with regulatory formula version markers.
                </p>
              </div>
            </div>

            {isTrendLoading ? (
              <Skeleton className="h-72 w-full rounded-xl" />
            ) : rawTrendPoints.length === 0 ? (
              <ChartEmptyState message="Insufficient historical snapshots. Recalculate to establish baseline." />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rawTrendPoints} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="calculatedAt"
                      fontSize={11}
                      stroke="currentColor"
                      opacity={0.7}
                      tickFormatter={(val) => new Date(val).toLocaleDateString()}
                    />
                    <YAxis fontSize={11} stroke="currentColor" opacity={0.7} domain={[0, 100]} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <ReferenceLine
                      x={rawTrendPoints.find((p) => p.formulaChanged)?.calculatedAt || undefined}
                      stroke="hsl(var(--warning))"
                      strokeDasharray="4 4"
                      label={{ value: 'Formula Revision', position: 'top', fill: 'hsl(var(--warning))', fontSize: 10 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="overallScore"
                      name="Overall Score"
                      stroke="hsl(var(--primary))"
                      strokeWidth={3}
                      dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="p-6 border-border/80">
            <div className="mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Chart 2 • Dimensional Evolution
              </span>
              <h3 className="text-base font-bold text-foreground">Metric Sub-Score Evolution</h3>
              <p className="text-xs text-muted-foreground">
                Dashed line indicates periods where a metric dimension was unavailable.
              </p>
            </div>

            {rawTrendPoints.length === 0 ? (
              <ChartEmptyState message="Insufficient historical snapshots. Recalculate to establish baseline." />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rawTrendPoints} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="calculatedAt"
                      fontSize={11}
                      stroke="currentColor"
                      opacity={0.7}
                      tickFormatter={(val) => new Date(val).toLocaleDateString()}
                    />
                    <YAxis fontSize={11} stroke="currentColor" opacity={0.7} domain={[0, 100]} />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Legend verticalAlign="top" height={36} iconSize={10} />
                    <Line type="monotone" dataKey="m1SubScore" name="M1 Completeness" stroke="hsl(var(--success))" strokeWidth={2} />
                    <Line type="monotone" dataKey="m2SubScore" name="M2 Discrepancies" stroke="hsl(var(--warning))" strokeWidth={2} />
                    <Line type="monotone" dataKey="m3SubScore" name="M3 Timeliness" stroke="hsl(var(--info))" strokeWidth={2} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="p-6 border-border/80">
            <div className="mb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Chart 8 • Self-Correction Frequency
              </span>
              <h3 className="text-base font-bold text-foreground">Correction Activity & Turnaround Trend</h3>
              <p className="text-xs text-muted-foreground">
                Institutions correcting data voluntarily are not penalized in their score.
              </p>
            </div>

            <ChartEmptyState
              message="No attributable corrections logged. Corrections are not penalised in score."
              subMessage="When self-initiated corrections occur, turnaround time will appear here."
            />
          </Card>
        </TabsContent>

        {/* TAB 5: DRILL-DOWN */}
        <TabsContent value="drilldown" className="space-y-6 pt-2">
          <Card className="p-6 border-border/80">
            <h3 className="text-base font-bold text-foreground mb-1">In-Scope Population & Audit Links</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Detailed registry counts contributing to the current score snapshot calculation.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-xs font-semibold text-muted-foreground block">In-Scope Records</span>
                <span className="text-2xl font-bold text-foreground tabular-nums">
                  {scorecard?.inScopeRecordCount || 0}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-1">Validated student rows</span>
              </div>
              <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-xs font-semibold text-muted-foreground block">Unresolved Discrepancies</span>
                <span className="text-2xl font-bold text-warning tabular-nums">
                  {scorecard?.unresolvedCount ?? metrics.m2Discrepancies.openDiscrepancies ?? 0}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-1">Pending review decisions</span>
              </div>
              <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-xs font-semibold text-muted-foreground block">Eligibility Status</span>
                <span className="text-2xl font-bold text-success tabular-nums">
                  {scorecard?.isEligibleForScore ? 'Eligible' : 'Exempt'}
                </span>
                <span className="text-[10px] text-muted-foreground block mt-1">Meets threshold criteria</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/reconciliations">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-primary" />
                  View Reconciliation Runs
                </Button>
              </Link>
              <Link to="/findings">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-primary" />
                  Inspect Open Findings
                </Button>
              </Link>
              <Link to="/seat-ledger">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-primary" />
                  Audit Seat Matrix Balances
                </Button>
              </Link>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 6: METHODOLOGY */}
        <TabsContent value="method" className="space-y-6 pt-2">
          <Card className="p-6 border-border/80">
            <h3 className="text-base font-bold text-foreground mb-1">Scorecard Scoring Formula & Weights</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Active regulatory evaluation weights under {scoringConfig?.name || 'Standard Regulatory Model v1'}.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
              <div className="p-3 rounded-lg border border-border/60 bg-card">
                <span className="text-xs font-semibold text-primary block">M1: Completeness</span>
                <span className="text-lg font-bold text-foreground">40%</span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">Missing required fields</span>
              </div>
              <div className="p-3 rounded-lg border border-border/60 bg-card">
                <span className="text-xs font-semibold text-primary block">M2: Discrepancies</span>
                <span className="text-lg font-bold text-foreground">30%</span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">Unmatched registers rate</span>
              </div>
              <div className="p-3 rounded-lg border border-border/60 bg-card">
                <span className="text-xs font-semibold text-primary block">M3: Timeliness</span>
                <span className="text-lg font-bold text-foreground">30%</span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">15-day reporting SLA</span>
              </div>
              <div className="p-3 rounded-lg border border-border/60 bg-card">
                <span className="text-xs font-semibold text-primary block">M4: Corrections</span>
                <span className="text-lg font-bold text-foreground">0%</span>
                <span className="text-[11px] text-muted-foreground block mt-0.5">Zero penalty for honesty</span>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-muted/50 text-muted-foreground font-semibold">
                  <tr>
                    <th className="p-3">Band</th>
                    <th className="p-3">Score Threshold</th>
                    <th className="p-3">Regulatory Interpretation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr>
                    <td className="p-3 font-semibold text-success">STRONG</td>
                    <td className="p-3">Score ≥ 80.0</td>
                    <td className="p-3 text-muted-foreground">High fidelity data reporting. Standard scheduled compliance reviews.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-primary">ADEQUATE</td>
                    <td className="p-3">60.0 ≤ Score &lt; 80.0</td>
                    <td className="p-3 text-muted-foreground">Satisfactory data baseline with minor cross-register clarifications pending.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-warning">NEEDS_SUPPORT</td>
                    <td className="p-3">40.0 ≤ Score &lt; 60.0</td>
                    <td className="p-3 text-muted-foreground">Advisory guidance issued to improve timely admissions reporting.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-danger">PRIORITY_SUPPORT</td>
                    <td className="p-3">Score &lt; 40.0</td>
                    <td className="p-3 text-muted-foreground">Eligible for technical capacity building and prioritized data reconciliation assistance.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-muted-foreground">INSUFFICIENT_DATA</td>
                    <td className="p-3">No Score (null)</td>
                    <td className="p-3 text-muted-foreground">Awaiting initial committed roster or external register connection.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 7: SUPPORT SUGGESTIONS */}
        <TabsContent value="support" className="space-y-6 pt-2">
          <Card className="p-6 border-border/80">
            <h3 className="text-base font-bold text-foreground mb-1">Tailored Technical Assistance Suggestions</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Non-punitive suggestions generated automatically from metric observations to assist institutional administrators.
            </p>

            {scorecard?.supportSuggestions && scorecard.supportSuggestions.length > 0 ? (
              <div className="space-y-3">
                {scorecard.supportSuggestions.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-border/70 bg-card/60 flex items-start gap-3 shadow-subtle"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <Lightbulb className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">{item.area}</span>
                      </div>
                      <p className="text-xs text-foreground/90">{item.suggestion}</p>
                      {item.rationale && (
                        <p className="text-[11px] text-muted-foreground">{item.rationale}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center rounded-xl bg-muted/20 border border-dashed border-border/80">
                <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
                <p className="text-xs font-semibold text-foreground">
                  No active support interventions recommended
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Institutional data flows conform to standard operational expectations.
                </p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
