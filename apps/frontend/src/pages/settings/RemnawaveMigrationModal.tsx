import { IconDatabaseImport, IconInfoCircle, IconLoader2, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { DEFAULT_PROJECT_UUID, type Period, type RemnawavePreview } from '@infra/shared';
import { apiErrorMessage } from '@/api/client';
import { useRemnawaveImport, useRemnawavePreview } from '@/api/migration';
import { useProjects } from '@/api/projects';
import { useSettings } from '@/api/settings';
import { PasswordInput } from '@/components/PasswordInput';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CURRENCY_OPTIONS, useEnums } from '@/constants';
import { useDisclosure } from '@/hooks/useDisclosure';
import { formatDateShort, formatMoney } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';

interface MigrationForm {
  url: string;
  token: string;
  cookieName: string;
  cookieValue: string;
  currency: string;
  projectUuid: string;
  nodeCost: string;
  period: Period;
  importNodes: boolean;
  importHistory: boolean;
}

/** Opens the one-off Remnawave import. Lives in the Settings page header. */
export function RemnawaveMigrationButton() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={open}>
        <IconDatabaseImport className="size-4" />
        {t('settings.migration.title')}
      </Button>

      <Dialog open={opened} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {t('settings.migration.title')}
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                {t('settings.migration.oneOff')}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {/* Radix unmounts the content on close, so the form (and the typed token) resets. */}
          <MigrationForm onDone={close} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The Remnawave URL, API token and (if the panel is behind a cookie gate) the proxy cookie are
 * typed in here and sent per request — the panel stores none of them.
 */
function MigrationForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const enums = useEnums();
  const { data: settings } = useSettings();
  const { data: projects } = useProjects();
  const preview = useRemnawavePreview();
  const runImport = useRemnawaveImport();
  const [result, setResult] = useState<RemnawavePreview | null>(null);

  const { control, register, handleSubmit, getValues, watch } = useForm<MigrationForm>({
    defaultValues: {
      url: '',
      token: '',
      cookieName: '',
      cookieValue: '',
      // Amounts in Remnawave carry no currency, so default to the panel's base currency.
      currency: settings?.baseCurrency ?? 'RUB',
      projectUuid: DEFAULT_PROJECT_UUID,
      nodeCost: '',
      period: 'monthly',
      importNodes: true,
      importHistory: true,
    },
    mode: 'onSubmit',
  });

  const connection = (v: MigrationForm) => ({
    url: v.url.trim(),
    token: v.token.trim(),
    cookieName: v.cookieName.trim() || undefined,
    cookieValue: v.cookieValue.trim() || undefined,
  });

  const doPreview = async () => {
    const v = getValues();
    if (!v.url.trim() || !v.token.trim()) {
      notifyError(t('settings.migration.urlAndTokenRequired'));
      return;
    }
    try {
      setResult(await preview.mutateAsync(connection(v)));
    } catch (e) {
      setResult(null);
      notifyError(apiErrorMessage(e));
    }
  };

  const doImport = handleSubmit(async (v) => {
    if (!v.importNodes && !v.importHistory) {
      notifyError(t('settings.migration.nothingSelected'));
      return;
    }
    if (!window.confirm(t('settings.migration.confirmImport'))) return;
    try {
      const res = await runImport.mutateAsync({
        ...connection(v),
        currency: v.currency,
        projectUuid: v.projectUuid,
        nodeCost: v.nodeCost.trim() || undefined,
        period: v.period,
        importNodes: v.importNodes,
        importHistory: v.importHistory,
      });
      notifySuccess(
        t('settings.migration.imported', {
          providers: res.providersCreated,
          services: res.servicesCreated,
          payments: res.paymentsCreated,
        }),
      );
      // A re-run refreshes instead of duplicating; say so when there was nothing new.
      if (res.servicesUpdated || res.paymentsUpdated || res.providersMatched) {
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
  });

  const importNodes = watch('importNodes');
  const busy = preview.isPending || runImport.isPending;

  return (
    <form onSubmit={doImport} className="space-y-4">
      <Alert>
        <IconInfoCircle />
        <AlertTitle>{t('settings.migration.safetyTitle')}</AlertTitle>
        <AlertDescription>
          <p>{t('settings.migration.safetyNoDelete')}</p>
          <p>{t('settings.migration.safetyIdempotent')}</p>
          <p>{t('settings.migration.safetyProviderMatch')}</p>
          <p>{t('settings.migration.safetyCredentials')}</p>
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rw-url">{t('settings.migration.url')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.migration.urlDesc')}</p>
          <Input
            id="rw-url"
            placeholder="https://panel.example.com"
            autoComplete="off"
            {...register('url')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rw-token">{t('settings.migration.token')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.migration.tokenDesc')}</p>
          <PasswordInput id="rw-token" {...register('token')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rw-cookie-name">{t('settings.migration.cookieName')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.migration.cookieDesc')}</p>
          <Input id="rw-cookie-name" autoComplete="off" {...register('cookieName')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rw-cookie-value">{t('settings.migration.cookieValue')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.migration.cookieValueDesc')}</p>
          <PasswordInput id="rw-cookie-value" {...register('cookieValue')} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="rw-currency">{t('settings.migration.currency')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.migration.currencyDesc')}</p>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="rw-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rw-project">{t('settings.migration.project')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.migration.projectDesc')}</p>
          <Controller
            control={control}
            name="projectUuid"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="rw-project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map((p) => (
                    <SelectItem key={p.uuid} value={p.uuid}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rw-node-cost">{t('settings.migration.nodeCost')}</Label>
          <p className="text-xs text-muted-foreground">{t('settings.migration.nodeCostDesc')}</p>
          <div className="flex gap-2">
            <Input
              id="rw-node-cost"
              inputMode="decimal"
              placeholder="0.00"
              disabled={!importNodes}
              {...register('nodeCost')}
            />
            <Controller
              control={control}
              name="period"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="rw-period"
                    className="w-[130px]"
                    disabled={!importNodes}
                    aria-label={t('settings.migration.period')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {enums.periodOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <Controller
          control={control}
          name="importNodes"
          render={({ field }) => (
            <div className="flex items-start gap-2">
              <Checkbox
                id="rw-import-nodes"
                checked={field.value}
                onCheckedChange={(c) => field.onChange(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="rw-import-nodes">{t('settings.migration.importNodes')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.migration.importNodesDesc')}
                </p>
              </div>
            </div>
          )}
        />
        <Controller
          control={control}
          name="importHistory"
          render={({ field }) => (
            <div className="flex items-start gap-2">
              <Checkbox
                id="rw-import-history"
                checked={field.value}
                onCheckedChange={(c) => field.onChange(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="rw-import-history">{t('settings.migration.importHistory')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('settings.migration.importHistoryDesc')}
                </p>
              </div>
            </div>
          )}
        />
      </div>

      {result && <PreviewTable preview={result} currency={watch('currency')} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={doPreview}>
          {preview.isPending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconSearch className="size-4" />
          )}
          {t('settings.migration.check')}
        </Button>
        <Button type="submit" disabled={busy}>
          {runImport.isPending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconDatabaseImport className="size-4" />
          )}
          {t('settings.migration.runImport')}
        </Button>
      </div>
    </form>
  );
}

/** Dry-run breakdown: what each Remnawave provider brings in, and whether it maps onto an existing one. */
function PreviewTable({ preview, currency }: { preview: RemnawavePreview; currency: string }) {
  const { t } = useTranslation();

  if (preview.providers.length === 0) {
    return (
      <Alert>
        <IconInfoCircle />
        <AlertTitle>{t('settings.migration.previewEmpty')}</AlertTitle>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {t('settings.migration.previewSummary', {
          providers: preview.totalProviders,
          nodes: preview.totalNodes,
          records: preview.totalRecords,
          amount: formatMoney(preview.totalAmount, currency),
        })}
      </p>
      <div className="overflow-x-auto">
        <Table className="min-w-[520px]">
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
                    {p.matchedProviderUuid ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {t('settings.migration.willReuse')}
                      </Badge>
                    ) : (
                      <Badge className="border-transparent bg-brand/15 text-[10px] text-brand uppercase tracking-wide">
                        {t('settings.migration.willCreate')}
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{p.nodes}</TableCell>
                <TableCell>{p.records}</TableCell>
                <TableCell>{formatMoney(p.amount, currency)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateShort(p.lastBilledAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
