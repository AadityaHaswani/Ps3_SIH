import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { ledgerApi } from '../../../api/modules/ledger.api';
import { queryKeys } from '../../../api/queryKeys';
import { Scale, ArrowRight, Info, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';

interface MassBalanceCalculatorProps {
  institutionId: string;
  defaultProgramme?: string;
  defaultAcademicYear?: string;
}

export const MassBalanceCalculator: React.FC<MassBalanceCalculatorProps> = ({
  institutionId,
  defaultProgramme = 'CS-BTECH',
  defaultAcademicYear = '2024-25',
}) => {
  const [programmeCode, setProgrammeCode] = useState(defaultProgramme);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [previousAcademicYear, setPreviousAcademicYear] = useState('');
  const [entrants, setEntrants] = useState(0);
  const [exits, setExits] = useState(0);
  const [retentionRate, setRetentionRate] = useState(1.0);

  // Trigger query on parameter change
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.seatLedger.massBalance({
      institutionId,
      programmeCode,
      academicYear,
      previousAcademicYear: previousAcademicYear || undefined,
      entrants,
      exits,
      retentionRate,
    }),
    queryFn: () =>
      ledgerApi.getMassBalance({
        institutionId,
        programmeCode,
        academicYear,
        previousAcademicYear: previousAcademicYear || undefined,
        entrants,
        exits,
        retentionRate,
      }),
    enabled: Boolean(institutionId && programmeCode && academicYear),
  });

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'RECONCILED':
        return (
          <Badge variant="verified" size="md" className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled (Balance Preserved)
          </Badge>
        );
      case 'COHORT_CARRYOVER_MISMATCH':
        return (
          <Badge variant="danger" size="md" className="gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Cohort Carryover Discrepancy
          </Badge>
        );
      case 'INSUFFICIENT_HISTORICAL_DATA':
        return (
          <Badge variant="outline" size="md" className="gap-1.5 text-slate-400">
            <HelpCircle className="w-3.5 h-3.5" /> Insufficient Historical Data
          </Badge>
        );
      case 'INSUFFICIENT_CURRENT_DATA':
        return (
          <Badge variant="outline" size="md" className="gap-1.5 text-slate-400">
            <HelpCircle className="w-3.5 h-3.5" /> Insufficient Current Data
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" size="md">
            {status || 'Unknown Status'}
          </Badge>
        );
    }
  };

  return (
    <Card className="p-6 bg-slate-900/60 border-slate-800 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-base">
              Academic Cohort Mass-Balance Calculator
            </h3>
            <p className="text-xs text-slate-400">
              Cross-year conservation law: Baseline Cohort × Retention + Entrants - Exits = Expected Continuing
            </p>
          </div>
        </div>

        {data && getStatusBadge(data.status)}
      </div>

      {/* Control Filters */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="col-span-1 md:col-span-1">
          <label className="text-xs font-medium text-slate-300 block mb-1">Programme</label>
          <Input
            value={programmeCode}
            onChange={(e) => setProgrammeCode(e.target.value.toUpperCase())}
            placeholder="CS-BTECH"
            className="uppercase font-mono text-xs"
          />
        </div>

        <div className="col-span-1 md:col-span-1">
          <label className="text-xs font-medium text-slate-300 block mb-1">Current Year</label>
          <Input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2024-25"
            className="font-mono text-xs"
          />
        </div>

        <div className="col-span-1 md:col-span-1">
          <label className="text-xs font-medium text-slate-300 block mb-1">
            Prior Baseline Year
          </label>
          <Input
            value={previousAcademicYear}
            onChange={(e) => setPreviousAcademicYear(e.target.value)}
            placeholder="Auto-derived"
            className="font-mono text-xs"
          />
        </div>

        <div className="col-span-1 md:col-span-1">
          <label className="text-xs font-medium text-slate-300 block mb-1">
            Entrants (+Lateral)
          </label>
          <Input
            type="number"
            min="0"
            value={entrants}
            onChange={(e) => setEntrants(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="text-xs"
          />
        </div>

        <div className="col-span-1 md:col-span-1">
          <label className="text-xs font-medium text-slate-300 block mb-1">
            Exits (-Withdrawal)
          </label>
          <Input
            type="number"
            min="0"
            value={exits}
            onChange={(e) => setExits(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="text-xs"
          />
        </div>

        <div className="col-span-2 md:col-span-1">
          <label className="text-xs font-medium text-slate-300 block mb-1">
            Retention ({Math.round(retentionRate * 100)}%)
          </label>
          <input
            type="range"
            min="0.5"
            max="1.0"
            step="0.01"
            value={retentionRate}
            onChange={(e) => setRetentionRate(parseFloat(e.target.value))}
            className="w-full accent-teal-500 mt-2 cursor-pointer"
          />
        </div>
      </div>

      {isLoading && (
        <div className="py-8 text-center text-xs text-slate-400">
          Computing cross-year cohort transition model...
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg text-xs">
          Unable to compute cohort balance: {(error as any)?.message || 'Query error'}
        </div>
      )}

      {data && !isLoading && (
        <div className="space-y-4">
          {/* Visual Equation Card */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs md:text-sm font-mono">
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-center">
                <span className="block text-[10px] uppercase text-slate-400">Baseline ({data.previousAcademicYear || 'Prior'})</span>
                <span className="font-bold text-slate-100 text-base">{data.baselinePreviousCohortCount ?? 'N/A'}</span>
              </div>

              <span className="text-slate-500 font-bold">×</span>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-center">
                <span className="block text-[10px] uppercase text-slate-400">Retention</span>
                <span className="font-bold text-teal-400 text-base">{Math.round(data.retentionRate * 100)}%</span>
              </div>

              <span className="text-slate-500 font-bold">+</span>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-center">
                <span className="block text-[10px] uppercase text-slate-400">Entrants</span>
                <span className="font-bold text-indigo-400 text-base">+{data.entrants}</span>
              </div>

              <span className="text-slate-500 font-bold">-</span>

              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-center">
                <span className="block text-[10px] uppercase text-slate-400">Exits</span>
                <span className="font-bold text-amber-400 text-base">-{data.exits}</span>
              </div>

              <span className="text-slate-500 font-bold">=</span>

              <div className="p-2.5 rounded bg-indigo-950/40 border border-indigo-700/50 text-center">
                <span className="block text-[10px] uppercase text-indigo-300">Expected Continuing</span>
                <span className="font-bold text-indigo-300 text-base">{data.expectedContinuingCount ?? 'N/A'}</span>
              </div>
            </div>

            <ArrowRight className="hidden md:block w-5 h-5 text-slate-600 shrink-0" />

            <div className="flex items-center gap-4 shrink-0">
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-center min-w-[110px]">
                <span className="block text-[10px] uppercase text-slate-400">Reported Current</span>
                <span className="font-bold text-slate-100 text-base">{data.reportedCurrentCount ?? 'N/A'}</span>
              </div>

              <div className="text-center min-w-[80px]">
                <span className="block text-[10px] uppercase text-slate-400 mb-1">Variance</span>
                {data.discrepancyDelta !== null && data.discrepancyDelta !== undefined ? (
                  <Badge
                    variant={data.discrepancyDelta === 0 ? 'verified' : 'danger'}
                    size="md"
                    className="font-mono text-sm"
                  >
                    {data.discrepancyDelta > 0 ? `+${data.discrepancyDelta}` : data.discrepancyDelta}
                  </Badge>
                ) : (
                  <span className="text-xs text-slate-500 font-mono">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Explanation Alert */}
          <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-lg text-xs text-slate-300 flex items-start gap-2.5 leading-relaxed">
            <Info className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-slate-200">{data.explanation}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Evaluation timestamp: {new Date(data.evaluatedAt).toLocaleString()} • Provisional status: {data.isProvisional ? 'Yes (Provisional)' : 'No (Audited)'}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
