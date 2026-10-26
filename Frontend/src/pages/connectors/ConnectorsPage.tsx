import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { systemApi } from '@/api/modules/system.api';
import { queryKeys } from '@/api/queryKeys';
import {
  Link2,
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldCheck,
  Server,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDistanceToNow } from 'date-fns';

export const ConnectorsPage: React.FC = () => {
  const {
    data,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery({
    queryKey: queryKeys.connectors.status,
    queryFn: () => systemApi.getConnectorsStatus(),
    refetchInterval: 30000, // Background poll every 30s
  });

  const connectors = data?.connectors || [];
  const timestamp = data?.timestamp;

  const healthyCount = connectors.filter(
    (c) => c.status === 'HEALTHY' || c.status === 'UP'
  ).length;
  const downCount = connectors.filter(
    (c) => c.status === 'DOWN' || c.status === 'OFFLINE'
  ).length;
  const simulatedCount = connectors.filter((c) => c.isSimulated).length;
  const avgLatency =
    connectors.length > 0
      ? Math.round(
          connectors.reduce((acc, c) => acc + (c.latencyMs || 0), 0) /
            connectors.length
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Link2 className="w-6 h-6 text-primary" />
            Upstream Registry Connectors
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time health telemetry, latency metrics, and simulated vs live registry governance.
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
            <RefreshCw
              className={`w-4 h-4 ${isLoading || isRefetching ? 'animate-spin' : ''}`}
            />
            {isRefetching ? 'Checking...' : 'Check Health'}
          </Button>
        </div>
      </div>

      {/* Domain Governance Alert */}
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 text-xs text-foreground space-y-1.5 leading-relaxed">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <ShieldCheck className="w-4 h-4" />
          Controlled Connector Registry & Integrity Boundary
        </div>
        <p className="text-muted-foreground">
          Callers cannot supply or override trusted <code className="text-foreground font-mono bg-primary/10 px-1 py-0.5 rounded">sourceMode</code>.
          Connectors operating in <code className="text-foreground font-mono bg-primary/10 px-1 py-0.5 rounded">SIMULATED</code> mode
          produce <code className="text-primary font-mono font-medium">AUTHORITY_VERIFIED_SIMULATED</code> assurance
          labels and cannot grant authentic regulatory verifications. Zero secrets or API keys are transmitted across telemetry channels.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Registered Connectors</p>
            <p className="text-2xl font-bold text-foreground mt-1">{connectors.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Server className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Operational</p>
            <p className="text-2xl font-bold text-success mt-1">{healthyCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Simulated Gateways</p>
            <p className="text-2xl font-bold text-amber-500 mt-1">{simulatedCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Avg Latency</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {avgLatency} <span className="text-xs font-normal text-muted-foreground">ms</span>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Connectors Matrix */}
      {isLoading ? (
        <div className="p-12 text-center border border-border rounded-xl bg-card">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
          <p className="text-sm text-muted-foreground">Probing upstream registry connectors...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl border border-destructive/30 bg-destructive/5 text-center text-sm text-destructive">
          Failed to fetch connectors status. Please ensure backend services are reachable.
        </div>
      ) : connectors.length === 0 ? (
        <div className="p-12 text-center border border-border rounded-xl bg-card">
          <Link2 className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium text-foreground">No registered connectors found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Registered upstream gateways will appear here with active health probes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connectors.map((c) => {
            const isHealthy = c.status === 'HEALTHY' || c.status === 'UP';
            const isDown = c.status === 'DOWN' || c.status === 'OFFLINE';
            const lastCheckTime = c.lastCheckedAt || c.lastChecked || timestamp;

            return (
              <div
                key={c.id}
                className="p-5 rounded-xl border border-border bg-card hover:border-border/80 transition-shadow shadow-sm flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base text-foreground">{c.name}</h3>
                        {c.isSimulated && (
                          <Badge variant="warning" size="sm">
                            (Simulated)
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">
                        ID: {c.id}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {isHealthy ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          HEALTHY
                        </span>
                      ) : isDown ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3 h-3" />
                          OFFLINE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3" />
                          {c.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mode & Subject Types */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Execution Mode:</span>
                      <span className="font-medium text-foreground font-mono">
                        {c.mode || (c.isSimulated ? 'SIMULATED' : 'LIVE')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Response Latency:</span>
                      <span
                        className={`font-mono font-medium ${
                          c.latencyMs < 100
                            ? 'text-emerald-500'
                            : c.latencyMs < 500
                            ? 'text-amber-500'
                            : 'text-rose-500'
                        }`}
                      >
                        {c.latencyMs} ms
                      </span>
                    </div>

                    {c.supportedSubjectTypes && c.supportedSubjectTypes.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] text-muted-foreground block mb-1">
                          Supported Subjects:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {c.supportedSubjectTypes.map((type) => (
                            <span
                              key={type}
                              className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-foreground border border-border/60"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Diagnostic / Error message */}
                  {(c.error || c.errorMessage) && (
                    <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 font-mono">
                      {c.error || c.errorMessage}
                    </div>
                  )}
                </div>

                {/* Footer timestamp */}
                <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last probe:
                  </span>
                  <span>
                    {lastCheckTime
                      ? formatDistanceToNow(new Date(lastCheckTime), { addSuffix: true })
                      : 'Just now'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upstream Gateways Reference Table */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          Statutory Registry Topology Reference
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-left">
                <th className="pb-2 font-medium">Connector Gateway</th>
                <th className="pb-2 font-medium">Domain Authority</th>
                <th className="pb-2 font-medium">Sync Protocol</th>
                <th className="pb-2 font-medium">Audit Trail Policy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-muted-foreground">
              <tr>
                <td className="py-2.5 font-medium text-foreground">mock-authority-intake</td>
                <td className="py-2.5">Central Regulatory Authority (AICTE / UGC)</td>
                <td className="py-2.5 font-mono text-[11px]">HTTPS / Signed JSON</td>
                <td className="py-2.5">Immutable Intake Quota Anchoring</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-foreground">admission-register</td>
                <td className="py-2.5">State & Central Counselling Authorities</td>
                <td className="py-2.5 font-mono text-[11px]">Bilateral Webhook</td>
                <td className="py-2.5">Seat Acceptance Token Verification</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-foreground">exam-board</td>
                <td className="py-2.5">Affiliated Examining University / Board</td>
                <td className="py-2.5 font-mono text-[11px]">Batch Digest Exchange</td>
                <td className="py-2.5">Enrolment & Examination Registry Validation</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-foreground">failing-connector</td>
                <td className="py-2.5">Circuit-Breaker & Fault Injection Testbed</td>
                <td className="py-2.5 font-mono text-[11px]">Fault Simulated Timeout</td>
                <td className="py-2.5">Resilience & Fallback Testing</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
