import { IconExternalLink } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { InkGlyph } from '@/components/ink/InkGlyph';
import { ProviderIcon } from '@/components/ProviderIcon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { providerFavicon } from '@/utils/favicon';
import { CardHeadRow } from '@/components/ink/CardHeadRow';
import { type AttentionRow, accountLink, withAccount } from './dashboardUtils';

export function AttentionTable({ rows }: { rows: AttentionRow[] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeadRow title={t('dashboard.attention.title')} count={rows.length} />
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 pl-6">
              <span className="sr-only">{t('dashboard.table.status')}</span>
            </TableHead>
            <TableHead>{t('dashboard.attention.colSubject')}</TableHead>
            <TableHead>{t('dashboard.attention.colNote')}</TableHead>
            <TableHead>{t('dashboard.attention.colWhen')}</TableHead>
            <TableHead className="text-right">{t('dashboard.attention.colAmount')}</TableHead>
            <TableHead className="w-10 pr-6">
              <span className="sr-only">{t('dashboard.attention.openCabinet')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const failed = r.state === 'failed';
            const providerName = withAccount(
              r.provider.name,
              r.provider.accountLabel,
              t('common.accountMain'),
            );
            const providerHref = accountLink(r.provider.uuid, r.provider.accountUuid);
            return (
              <TableRow key={r.key} className={cn(failed && '*:bg-fail-bg')}>
                <TableCell className="pl-6">
                  <InkGlyph
                    state={r.state}
                    label={
                      failed ? t('dashboard.attention.critical') : t('dashboard.attention.warning')
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderIcon
                      name={r.provider.name}
                      src={providerFavicon(r.provider)}
                      iconName={r.provider.iconName}
                      iconBg={r.provider.iconBg}
                      size={18}
                    />
                    {r.service ? (
                      <>
                        <Link
                          to={`/services?selected=${r.service.uuid}`}
                          className="truncate hover:underline"
                        >
                          {r.service.name}
                        </Link>
                        <Link
                          to={providerHref}
                          className="truncate text-[13px] text-ink-2 hover:underline"
                        >
                          {providerName}
                        </Link>
                      </>
                    ) : (
                      <Link to={providerHref} className="truncate hover:underline">
                        {providerName}
                      </Link>
                    )}
                  </div>
                </TableCell>
                <TableCell className={cn('text-[13px]', failed ? 'text-destructive' : 'text-warn')}>
                  {r.note}
                </TableCell>
                <TableCell className="text-[13px] text-ink-2">{r.when}</TableCell>
                <TableCell className="text-right">{r.amount}</TableCell>
                <TableCell className="pr-6">
                  {r.provider.loginUrl && (
                    <Button variant="ghost" size="icon-xs" className="text-ink-3" asChild>
                      <a
                        href={r.provider.loginUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t('dashboard.attention.openCabinetOf', {
                          name: providerName,
                        })}
                        title={r.provider.loginUrl}
                      >
                        <IconExternalLink />
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
