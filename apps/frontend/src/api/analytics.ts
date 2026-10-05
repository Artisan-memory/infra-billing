import { useQuery } from '@tanstack/react-query';
import type { AnalyticsSummary, BalancePoint, ForecastPoint } from '@infra/shared';
import { api } from './client';
import { API_PATH } from '@infra/shared';

export function useSummary() {
  return useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: async () => (await api.get<AnalyticsSummary>(API_PATH.ANALYTICS.SUMMARY)).data,
  });
}

export function useForecast(months = 12, monthsBack = 3) {
  return useQuery({
    queryKey: ['analytics', 'forecast', months, monthsBack],
    queryFn: async () =>
      (
        await api.get<ForecastPoint[]>(API_PATH.ANALYTICS.FORECAST, {
          params: { months, monthsBack },
        })
      ).data,
  });
}

/** Balance snapshots of one provider account, oldest first. */
export function useBalanceHistory(accountUuid?: string) {
  return useQuery({
    queryKey: ['balance-history', accountUuid],
    enabled: Boolean(accountUuid),
    queryFn: async () =>
      (await api.get<BalancePoint[]>(API_PATH.PROVIDER_ACCOUNTS.BALANCE_HISTORY(accountUuid!)))
        .data,
  });
}
