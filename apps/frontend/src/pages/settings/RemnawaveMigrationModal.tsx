import {
  IconArrowLeft,
  IconDatabaseImport,
  IconLoader2,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { REMNAWAVE_CURRENCY, type RemnawavePreview } from '@infra/shared';
import { apiErrorMessage } from '@/api/client';
import { useRemnawaveCleanup, useRemnawaveImport, useRemnawavePreview } from '@/api/migration';
import { PasswordInput } from '@/components/PasswordInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDisclosure } from '@/hooks/useDisclosure';
import { formatCost, formatDateShort, formatMoney } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';

interface ConnectionForm {
  url: string;
  token: string;
  cookieName: string;
  cookieValue: string;
}

/** Discreet trigger for the one-off Remnawave import; sits at the foot of the Settings page. */
export function RemnawaveMigrationButton() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={open}
      >
        <IconDatabaseImport className="size-4" />
        {t('settings.migration.title')}
      </Button>

      <Dialog open={opened} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('settings.migration.title')}</DialogTitle>
          </DialogHeader>
          {/* Radix unmounts the content on close, so the typed token never outlives the dialog. */}
          <MigrationFlow onDone={close} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Two steps: connect, then confirm what was found. Everything imported comes from the Remnawave API
 * as-is — it holds no currency and no per-node price, so there is nothing else to ask for.
 */
function MigrationFlow({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const preview = useRemnawavePreview();
  const runImport = useRemnawaveImport();
  const cleanup = useRemnawaveCleanup();
  const [found, setFound] = useState<RemnawavePreview | null>(null);

  const { register, handleSubmit, getValues } = useForm<ConnectionForm>({
    defaultValues: { url: '', token: '', cookieName: '', cookieValue: '' },
    mode: 'onSubmit',
  });

  const connection = () => {
    const v = getValues();
    return {
      url: v.url.trim(),
      token: v.token.trim(),
      cookieName: v.cookieName.trim() || undefined,
      cookieValue: v.cookieValue.trim() || undefined,
    };
  };

  const doPreview = handleSubmit(async (v) => {
    if (!v.url.trim() || !v.token.trim()) {
      notifyError(t('settings.migration.urlAndTokenRequired'));
      return;
    }
    try {
      setFound(await preview.mutateAsync(connection()));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doImport = async () => {
    try {
      const res = await runImport.mutateAsync(connection());
      notifySuccess(
        t('settings.migration.imported', {
          providers: res.providersCreated,
          services: res.servicesCreated,
          payments: res.paymentsCreated,
        }),
      );
      // A re-run refreshes instead of duplicating; report that separately.
      if (res.providersMatched || res.servicesUpdated || res.paymentsUpdated) {
        notifySuccess(
          t('settings.migration.refreshed', {
            providers: res.providersMatched,
            services: res.servicesUpdated,
            payments: res.paymentsUpdated,
          }),
        );
      }
      onDone();
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doCleanup = async () => {
    if (!window.confirm(t('settings.migration.confirmCleanup'))) return;
    try {
      const res = await cleanup.mutateAsync();
      notifySuccess(
        t('settings.migration.cleaned', {
          services: res.servicesDeleted,
          payments: res.paymentsDeleted,
        }),
      );
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  if (found) {
    return (
      <div className="space-y-4">
        <Found preview={found} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={runImport.isPending}
            onClick={() => setFound(null)}
          >
            <IconArrowLeft className="size-4" />
            {t('common.back')}
          </Button>
          <Button
            type="button"
            disabled={runImport.isPending || found.totalProviders === 0}
            onClick={() => void doImport()}
          >
            {runImport.isPending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconDatabaseImport className="size-4" />
            )}
            {t('settings.migration.runImport')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={doPreview} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rw-url">{t('settings.migration.url')}</Label>
          <Input
            id="rw-url"
            placeholder="https://panel.example.com"
            autoComplete="off"
            {...register('url')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rw-token">{t('settings.migration.token')}</Label>
          <PasswordInput id="rw-token" {...register('token')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rw-cookie-name">{t('settings.migration.cookieName')}</Label>
          <Input id="rw-cookie-name" autoComplete="off" {...register('cookieName')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rw-cookie-value">{t('settings.migration.cookieValue')}</Label>
          <PasswordInput id="rw-cookie-value" {...register('cookieValue')} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t('settings.migration.note')}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          disabled={cleanup.isPending}
          onClick={() => void doCleanup()}
        >
          {cleanup.isPending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconTrash className="size-4" />
          )}
          {t('settings.migration.cleanup')}
        </Button>
        <Button type="submit" disabled={preview.isPending}>
          {preview.isPending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconSearch className="size-4" />
          )}
          {t('settings.migration.check')}
        </Button>
      </div>
    </form>
  );
}

/** What the panel found, per provider, and whether each maps onto one that already exists here. */
function Found({ preview }: { preview: RemnawavePreview }) {
  const { t } = useTranslation();

  if (preview.totalProviders === 0) {
    return <p className="text-sm text-muted-foreground">{t('settings.migration.previewEmpty')}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('settings.migration.previewSummary', {
          nodes: preview.totalNodes,
          records: preview.totalRecords,
          amount: formatMoney(preview.totalAmount, REMNAWAVE_CURRENCY),
        })}
      </p>
      <div className="overflow-x-auto">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-muted-foreground">
                {t('settings.migration.thProvider')}
              </TableHead>
              <TableHead className="text-muted-foreground">
                {t('settings.migration.thNodes')}
              </TableHead>
              <TableHead className="text-muted-foreground">
                {t('settings.migration.thRecords')}
              </TableHead>
              <TableHead className="text-muted-foreground">
                {t('settings.migration.thAmount')}
              </TableHead>
              <TableHead className="text-muted-foreground">
                {t('settings.migration.thPerNode')}
              </TableHead>
              <TableHead className="text-muted-foreground">
                {t('settings.migration.thLastBilled')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.providers.map((p) => (
              <TableRow key={p.name}>
                <TableCell className="font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {p.name}
                    {p.matchedProviderUuid && (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {t('settings.migration.willReuse')}
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{p.nodes}</TableCell>
                <TableCell>{p.records}</TableCell>
                <TableCell>{formatMoney(p.amount, REMNAWAVE_CURRENCY)}</TableCell>
                <TableCell>{formatCost(p.perNodeCost, REMNAWAVE_CURRENCY)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateShort(p.lastBilledAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.migration.importNote')}</p>
    </div>
  );
}
