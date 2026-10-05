import type { AnalyticsSummary } from '@infra/shared';
import type { TFunction } from 'i18next';
import type { InkState } from '@/components/ink/InkGlyph';
import { formatDateShort, formatMoney } from '@/utils/format';

type Upcoming = AnalyticsSummary['upcomingBillings'][number];

export const dayLabel = (t: TFunction, n: number) =>
  n <= 0
    ? t('dashboard.due.today')
    : n === 1
      ? t('dashboard.due.tomorrow')
      : t('dashboard.due.inDays', { n });

export const agoLabel = (t: TFunction, n: number) =>
  n <= 0
    ? t('dashboard.ago.today')
    : n === 1
      ? t('dashboard.ago.yesterday')
      : t('dashboard.ago.daysAgo', { n });

/** Glyph of an upcoming charge: severity wins, then what we know about the balance. */
export function upcomingState(b: Upcoming): InkState {
  if (b.severity === 'critical') return 'failed';
  if (b.severity === 'warning') return 'warn';
  if (b.covered == null) return 'pending';
  return b.covered ? 'ok' : 'warn';
}

export function coverageLabel(t: TFunction, covered: boolean | null): string {
  if (covered == null) return t('dashboard.upcoming.balanceUnknown');
  return covered ? t('dashboard.upcoming.balanceOk') : t('dashboard.upcoming.insufficientBalance');
}

export const byDaysUntil = (a: Upcoming, b: Upcoming) => a.daysUntil - b.daysUntil;

/**
 * "Provider · label" — the analytics rows carry a label only for multi-account providers, '' for
 * the original unlabelled one (named by `mainLabel`, i.e. t('common.accountMain')).
 */
export const withAccount = (
  providerName: string,
  accountLabel: string | null,
  mainLabel: string,
) => (accountLabel == null ? providerName : `${providerName} · ${accountLabel || mainLabel}`);

/** Deep link that opens the provider card focused on one of its accounts. */
export const accountLink = (providerUuid: string, accountUuid: string) =>
  `/providers?selected=${providerUuid}&account=${accountUuid}`;

export interface AttentionProvider {
  uuid: string;
  name: string;
  accountUuid: string;
  accountLabel: string | null;
  faviconLink: string | null;
  loginUrl: string | null;
  iconName: string | null;
  iconBg: string | null;
}

export interface AttentionRow {
  key: string;
  state: 'failed' | 'warn';
  provider: AttentionProvider;
  /** Set when the row is about one service rather than the whole provider account. */
  service: { uuid: string; name: string } | null;
  note: string;
  when: string;
  amount: string;
}

interface AttentionInput {
  overdue: AnalyticsSummary['overdueBillings'];
  upcoming: AnalyticsSummary['upcomingBillings'];
  runway: AnalyticsSummary['balanceRunway'];
  topUps: AnalyticsSummary['balanceTopUps'];
}

/**
 * Everything on the dashboard that needs the owner's hand, failures first: overdue charges,
 * charges the balance won't cover, balances about to run dry, then the softer warnings.
 */
export function buildAttentionRows(
  t: TFunction,
  { overdue, upcoming, runway, topUps }: AttentionInput,
): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const critical = upcoming.filter((b) => b.severity === 'critical').sort(byDaysUntil);

  for (const b of overdue) {
    rows.push({
      key: `overdue:${b.serviceUuid}`,
      state: 'failed',
      provider: {
        uuid: b.providerUuid,
        name: b.providerName,
        accountUuid: b.accountUuid,
        accountLabel: b.accountLabel,
        faviconLink: b.providerFaviconLink,
        loginUrl: b.providerLoginUrl,
        iconName: b.providerIconName,
        iconBg: b.providerIconBg,
      },
      service: { uuid: b.serviceUuid, name: b.name },
      note: t('dashboard.attention.overdue', { ago: agoLabel(t, b.daysOverdue) }),
      when: formatDateShort(b.nextBillingAt),
      amount: formatMoney(b.cost, b.currency),
    });
  }

  for (const b of critical) {
    const balance =
      b.accountBalance != null
        ? t('dashboard.attention.balance', {
            amount: formatMoney(b.accountBalance, b.accountBalanceCurrency),
          })
        : null;
    rows.push({
      key: `critical:${b.serviceUuid}`,
      state: 'failed',
      provider: {
        uuid: b.providerUuid,
        name: b.providerName,
        accountUuid: b.accountUuid,
        accountLabel: b.accountLabel,
        faviconLink: b.providerFaviconLink,
        loginUrl: b.providerLoginUrl,
        iconName: b.providerIconName,
        iconBg: b.providerIconBg,
      },
      service: { uuid: b.serviceUuid, name: b.name },
      // Critical always means "not covered" or "unknown", never a covered charge.
      note: [coverageLabel(t, b.covered === true ? false : b.covered), balance]
        .filter(Boolean)
        .join(' · '),
      when: dayLabel(t, b.daysUntil),
      amount: formatMoney(b.cost, b.currency),
    });
  }

  const runwayRow = (r: AnalyticsSummary['balanceRunway'][number]): AttentionRow => ({
    key: `runway:${r.accountUuid}`,
    state: r.severity === 'critical' ? 'failed' : 'warn',
    provider: {
      uuid: r.providerUuid,
      name: r.providerName,
      accountUuid: r.accountUuid,
      accountLabel: r.accountLabel,
      faviconLink: r.providerFaviconLink,
      loginUrl: r.providerLoginUrl,
      iconName: r.providerIconName,
      iconBg: r.providerIconBg,
    },
    service: null,
    note: `${t('dashboard.attention.runsOut', { when: dayLabel(t, r.daysLeft) })} · ${t(
      'dashboard.attention.perDay',
      { amount: formatMoney(r.burnPerDay, r.currency) },
    )}`,
    when: formatDateShort(r.depletionAt),
    amount: formatMoney(r.balance, r.currency),
  });

  rows.push(...runway.filter((r) => r.severity === 'critical').map(runwayRow));
  rows.push(...runway.filter((r) => r.severity === 'warning').map(runwayRow));

  for (const u of topUps) {
    // Top-ups only matter here when they would save a critical charge on the same account.
    const soonest = critical.find((b) => b.accountUuid === u.accountUuid);
    if (!soonest) continue;
    rows.push({
      key: `topup:${u.accountUuid}`,
      state: 'warn',
      provider: {
        uuid: u.providerUuid,
        name: u.providerName,
        accountUuid: u.accountUuid,
        accountLabel: u.accountLabel,
        faviconLink: u.providerFaviconLink ?? soonest.providerFaviconLink,
        loginUrl: u.providerLoginUrl ?? soonest.providerLoginUrl,
        iconName: u.providerIconName ?? soonest.providerIconName,
        iconBg: u.providerIconBg ?? soonest.providerIconBg,
      },
      service: null,
      note: t('dashboard.attention.topUp'),
      when: dayLabel(t, soonest.daysUntil),
      amount: formatMoney(u.amount, u.currency),
    });
  }

  return rows;
}
