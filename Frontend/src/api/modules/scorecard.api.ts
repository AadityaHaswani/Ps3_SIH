import { apiClient } from '../client';
import { ApiEnvelope } from '@/types/api';
import {
  ScoreSnapshot,
  ScorecardTrendPoint,
  ScorecardCompareItem,
  ScoringConfig,
} from '@/types/models';

export interface ScorecardParams {
  reportingPeriod?: string;
  configVersion?: string;
  refresh?: boolean;
}

export const scorecardApi = {
  // Get active scorecard snapshot for institution
  getScorecard: async (
    institutionId: string,
    params?: ScorecardParams
  ): Promise<ScoreSnapshot> => {
    const res = await apiClient.get<ApiEnvelope<ScoreSnapshot>>(
      `/scorecards/institutions/${institutionId}`,
      { params }
    );
    return res.data.data;
  },

  // Get metric sub-dimension details (completeness by field, ageing distribution, timeliness)
  getMetrics: async (
    institutionId: string,
    reportingPeriod = '2024-25'
  ): Promise<ScoreSnapshot['metrics'] & { reportingPeriod: string }> => {
    const res = await apiClient.get<ApiEnvelope<ScoreSnapshot['metrics'] & { reportingPeriod: string }>>(
      `/scorecards/institutions/${institutionId}/metrics`,
      { params: { reportingPeriod } }
    );
    return res.data.data;
  },

  // Get historical score trend points
  getTrend: async (
    institutionId: string,
    configVersion?: string
  ): Promise<{ trend?: ScorecardTrendPoint[]; dataPoints?: number | ScorecardTrendPoint[] }> => {
    const res = await apiClient.get<ApiEnvelope<{ trend?: ScorecardTrendPoint[]; dataPoints?: number | ScorecardTrendPoint[] }>>(
      `/scorecards/institutions/${institutionId}/trend`,
      { params: { configVersion } }
    );
    return res.data.data;
  },

  // Compare multiple institutions (anonymized for institutions, transparent for authorities)
  compare: async (
    institutions: string[],
    reportingPeriod = '2024-25'
  ): Promise<{
    comparisons: ScorecardCompareItem[];
    isDirectlyComparable: boolean;
    warning?: string;
  }> => {
    const res = await apiClient.get<
      ApiEnvelope<{
        comparisons: ScorecardCompareItem[];
        isDirectlyComparable: boolean;
        warning?: string;
      }>
    >('/scorecards/compare', {
      params: {
        institutions: institutions.join(','),
        reportingPeriod,
      },
    });
    return res.data.data;
  },

  // Recalculate scorecard snapshot
  recalculate: async (
    institutionId: string,
    reportingPeriod = '2024-25',
    triggerReason = 'MANUAL_RECALCULATE'
  ): Promise<ScoreSnapshot> => {
    const res = await apiClient.post<ApiEnvelope<ScoreSnapshot>>(
      '/scorecards/recalculate',
      {
        institutionId,
        reportingPeriod,
        triggerReason,
      }
    );
    return res.data.data;
  },

  // Get active regulatory scoring configuration
  getConfig: async (version?: string): Promise<ScoringConfig> => {
    const res = await apiClient.get<ApiEnvelope<ScoringConfig>>('/scorecards/config', {
      params: { version },
    });
    return res.data.data;
  },
};
