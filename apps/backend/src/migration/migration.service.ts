import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '@generated/prisma/client';
import {
  DEFAULT_PROJECT_UUID,
  Period,
  REMNAWAVE_BILL_PREFIX,
  REMNAWAVE_CURRENCY,
  REMNAWAVE_NODE_PREFIX,
  RemnawaveCleanupResult,
  RemnawaveImportResult,
  RemnawavePreview,
  RemnawaveProviderPreview,
} from '@infra/shared';
import { PaymentsRepository } from '@repositories/payments/payments.repository';
import { ProvidersRepository } from '@repositories/providers/providers.repository';
import { ServicesRepository } from '@repositories/services/services.repository';
import { RemnawaveClient } from './remnawave.client';
import type {
  RemnawaveBillRecord,
  RemnawaveBillingNode,
  RemnawaveInfraProvider,
} from './remnawave.types';
import { RemnawaveConnectionDto, RemnawaveImportDto } from './dto/migration.dto';

// A panel with a long billing history pages through /history 500 at a time; give the whole read the
// same budget a manual provider sync gets.
const FETCH_TIMEOUT_MS = 120_000;

// Remnawave billing nodes are servers, and its billing history is money paid to the provider.
const NODE_SERVICE_TYPE = 'vps';
const DEFAULT_NODE_PERIOD: Period = 'monthly';
const PAYMENT_DESCRIPTION = 'Remnawave';

/** A Remnawave provider plus everything the import will attach to it. */
interface SourceProvider {
  uuid: string;
  name: string;
  loginUrl: string | null;
  faviconLink: string | null;
  nodes: RemnawaveBillingNode[];
  records: RemnawaveBillRecord[];
}

/**
 * One-off import of a Remnawave panel's own infra-billing bookkeeping (Infra Billing Controller)
 * into this panel: its providers become providers, its billing nodes become services, and its
 * billing history becomes payments.
 *
 * Nothing is ever deleted or overwritten wholesale. Imported rows carry the Remnawave record id in
 * `externalId`, so a second run matches what it created the first time and refreshes it instead of
 * duplicating — and manual edits to cost, currency and period survive.
 */
@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    private readonly providers: ProvidersRepository,
    private readonly services: ServicesRepository,
    private readonly payments: PaymentsRepository,
  ) {}

  /** Dry run: connect, count what is there, and say which providers already exist here. */
  async preview(dto: RemnawaveConnectionDto): Promise<RemnawavePreview> {
    const sources = await this.fetchSources(dto);
    const matches = await this.existingProvidersByName();

    let totalNodes = 0;
    let totalRecords = 0;
    let totalAmount = new Decimal(0);
    const providers: RemnawaveProviderPreview[] = sources.map((src) => {
      const amount = sumAmounts(src.records);
      totalNodes += src.nodes.length;
      totalRecords += src.records.length;
      totalAmount = totalAmount.plus(amount);
      return {
        name: src.name,
        loginUrl: src.loginUrl,
        nodes: src.nodes.length,
        records: src.records.length,
        amount: amount.toFixed(2),
        perNodeCost: perNodeMonthlyCost(src.records, src.nodes.length),
        lastBilledAt: lastBilledAt(src.records),
        matchedProviderUuid: matches.get(normalizeName(src.name)) ?? null,
      };
    });

    return {
      providers,
      totalProviders: providers.length,
      totalNodes,
      totalRecords,
      totalAmount: totalAmount.toFixed(2),
    };
  }

  /** Run the import. Returns what was created versus refreshed. */
  async import(dto: RemnawaveImportDto): Promise<RemnawaveImportResult> {
    const sources = await this.fetchSources(dto);
    const matches = await this.existingProvidersByName();

    const result: RemnawaveImportResult = {
      providersCreated: 0,
      providersMatched: 0,
      servicesCreated: 0,
      servicesUpdated: 0,
      paymentsCreated: 0,
      paymentsUpdated: 0,
    };

    for (const src of sources) {
      // Reuse a provider of the same name — the owner may already track this hoster here, and its
      // spend belongs on the same card. Only a genuinely new name creates a provider, always
      // `manual`: the import brings records, not API credentials.
      const matched = matches.get(normalizeName(src.name));
      let providerUuid: string;
      if (matched) {
        providerUuid = matched;
        result.providersMatched += 1;
      } else {
        const created = await this.providers.create({
          name: src.name,
          kind: 'manual',
          loginUrl: src.loginUrl,
          faviconLink: src.faviconLink,
        });
        providerUuid = created.uuid;
        // Keep the map current so two Remnawave providers with the same name land on one provider.
        matches.set(normalizeName(src.name), providerUuid);
        result.providersCreated += 1;
      }

      if (src.nodes.length > 0) {
        // Remnawave has no per-node price, only what was paid to the provider — derive one from it.
        const cost = perNodeMonthlyCost(src.records, src.nodes.length);
        const counts = await this.upsertNodes(providerUuid, src.nodes, cost);
        result.servicesCreated += counts.created;
        result.servicesUpdated += counts.updated;
      }
      if (src.records.length > 0) {
        const counts = await this.upsertRecords(providerUuid, src.records);
        result.paymentsCreated += counts.created;
        result.paymentsUpdated += counts.updated;
      }
    }

    this.logger.log(
      `Remnawave import: providers +${result.providersCreated}/~${result.providersMatched}, ` +
        `services +${result.servicesCreated}/~${result.servicesUpdated}, ` +
        `payments +${result.paymentsCreated}/~${result.paymentsUpdated}`,
    );
    return result;
  }

  /** Billing nodes → services, priced from the provider's payment history (`perNodeCost`). */
  private async upsertNodes(
    providerUuid: string,
    nodes: RemnawaveBillingNode[],
    perNodeCost: string | null,
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const n of nodes) {
      const externalId = `${REMNAWAVE_NODE_PREFIX}${n.uuid}`;
      const name = n.name?.trim() || n.node?.name?.trim() || 'Remnawave node';
      const countryCode = normalizeCountryCode(n.node?.countryCode);
      const nextBillingAt = parseDate(n.nextBillingAt);
      const existing = await this.services.findByExternalId(providerUuid, externalId);

      if (!existing) {
        await this.services.create({
          providerUuid,
          // Providers are shared across projects, so land nodes in the default project; the owner
          // reassigns them on the Services page.
          projectUuid: DEFAULT_PROJECT_UUID,
          externalId,
          name,
          type: NODE_SERVICE_TYPE,
          countryCode: countryCode ?? 'XX',
          // Derived from the payment history; 0 when there is nothing to divide (renders as "—").
          cost: perNodeCost ?? '0.00',
          currency: REMNAWAVE_CURRENCY,
          period: DEFAULT_NODE_PERIOD,
          nextBillingAt,
          isActive: true,
          // Not `isManaged`: there is no connector behind these, the owner edits them freely.
          isManaged: false,
          meta: remnawaveNodeMeta(n, perNodeCost),
        });
        created += 1;
      } else {
        // Re-run: refresh what Remnawave owns, plus the derived price — more history makes it more
        // accurate. An owner-edited price (costOverridden) is never touched.
        const data: Prisma.ServiceUpdateInput = {
          nextBillingAt,
          meta: remnawaveNodeMeta(n, perNodeCost),
        };
        if (!existing.nameOverridden) data.name = name;
        if (perNodeCost && !existing.costOverridden) data.cost = perNodeCost;
        // Don't downgrade a country the owner filled in when Remnawave has no node record left.
        if (countryCode) data.countryCode = countryCode;
        await this.services.update(existing.uuid, data);
        updated += 1;
      }
    }

    return { created, updated };
  }

  /** Billing history → payments (`topup`: money paid to the provider, counted as spend). */
  private async upsertRecords(
    providerUuid: string,
    records: RemnawaveBillRecord[],
  ): Promise<{ created: number; updated: number }> {
    const known = new Set(await this.payments.listExternalIds(providerUuid));
    let created = 0;
    let updated = 0;

    for (const r of records) {
      const externalId = `${REMNAWAVE_BILL_PREFIX}${r.uuid}`;
      const paymentDate = parseDate(r.billedAt);
      if (!paymentDate) {
        this.logger.warn(`Remnawave bill ${r.uuid} has an unusable billedAt — skipped`);
        continue;
      }
      await this.payments.upsertExternal(providerUuid, externalId, {
        amount: new Decimal(r.amount ?? 0).toFixed(2),
        currency: REMNAWAVE_CURRENCY,
        type: 'topup',
        description: PAYMENT_DESCRIPTION,
        paymentDate,
        // Remnawave bills the provider, not an individual node, so there is no service to link.
        serviceUuid: null,
      });
      if (known.has(externalId)) updated += 1;
      else created += 1;
    }

    return { created, updated };
  }

  /** Read providers + nodes + history and group them per provider. */
  private async fetchSources(creds: RemnawaveConnectionDto): Promise<SourceProvider[]> {
    const client = new RemnawaveClient(creds);
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    let providers: RemnawaveInfraProvider[];
    let nodes: RemnawaveBillingNode[];
    let records: RemnawaveBillRecord[];
    try {
      providers = await client.fetchProviders(signal);
      nodes = await client.fetchBillingNodes(signal);
      records = await client.fetchHistory(signal);
    } catch (e) {
      throw new BadRequestException(
        signal.aborted
          ? `Remnawave did not answer within ${FETCH_TIMEOUT_MS / 1000}s`
          : e instanceof Error
            ? e.message
            : 'Remnawave request failed',
      );
    }

    const sources = new Map<string, SourceProvider>();
    const ensure = (
      uuid: string,
      seed: { name: string; loginUrl?: string | null; faviconLink?: string | null },
    ): SourceProvider => {
      const found = sources.get(uuid);
      if (found) return found;
      const created: SourceProvider = {
        uuid,
        name: seed.name?.trim() || 'Remnawave provider',
        loginUrl: seed.loginUrl ?? null,
        faviconLink: seed.faviconLink ?? null,
        nodes: [],
        records: [],
      };
      sources.set(uuid, created);
      return created;
    };

    for (const p of providers) ensure(p.uuid, p);
    // Nodes and records embed their provider, so a provider missing from /providers still imports.
    for (const n of nodes)
      ensure(n.providerUuid, n.provider ?? { name: n.name ?? '' }).nodes.push(n);
    for (const r of records) ensure(r.providerUuid, r.provider ?? { name: '' }).records.push(r);
    return Array.from(sources.values());
  }

  /**
   * Remove everything a previous import created, so it can be run again from scratch. Scoped by the
   * `remnawave:` externalId namespace, so hand-entered services and payments are never touched.
   *
   * Providers are left alone: they may already carry other data, and a re-import matches them by
   * name and reuses them anyway. Deleting one by hand cascades to whatever is left under it.
   */
  async cleanup(): Promise<RemnawaveCleanupResult> {
    const paymentsDeleted = await this.payments.deleteByExternalIdPrefix(REMNAWAVE_BILL_PREFIX);
    const servicesDeleted = await this.services.deleteByExternalIdPrefix(REMNAWAVE_NODE_PREFIX);
    this.logger.log(
      `Remnawave cleanup: removed ${servicesDeleted} service(s), ${paymentsDeleted} payment(s)`,
    );
    return { servicesDeleted, paymentsDeleted };
  }

  /** Panel providers keyed by normalized name, for reuse instead of creating duplicates. */
  private async existingProvidersByName(): Promise<Map<string, string>> {
    const rows = await this.providers.listAll();
    const map = new Map<string, string>();
    // First writer wins, so the oldest provider of a given name is the one reused.
    for (const p of rows) {
      const key = normalizeName(p.name);
      if (!map.has(key)) map.set(key, p.uuid);
    }
    return map;
  }
}

/** Case- and whitespace-insensitive provider name, so "Aeza " matches an existing "aeza". */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function sumAmounts(records: RemnawaveBillRecord[]): Decimal {
  return records.reduce((acc, r) => acc.plus(new Decimal(r.amount ?? 0)), new Decimal(0));
}

/**
 * Per-node monthly cost, derived from what was actually paid: total paid / months covered / node
 * count. Remnawave prices nothing per node — the only money it knows is the provider's billing
 * history — so this spreads that across the provider's nodes.
 *
 * The same figure comes out whether the owner logged one payment per invoice or one per node, since
 * both give the same monthly total. Null when there is nothing to divide (no nodes, no payments, or
 * a non-positive total), and the node then arrives unpriced.
 */
function perNodeMonthlyCost(records: RemnawaveBillRecord[], nodeCount: number): string | null {
  if (nodeCount <= 0 || records.length === 0) return null;
  const total = sumAmounts(records);
  if (total.lte(0)) return null;
  const dates = records
    .map((r) => parseDate(r.billedAt))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return null;
  return total.div(monthsCovered(dates)).div(nodeCount).toFixed(2);
}

/** Calendar months from the first payment to the last, inclusive (so a single payment is 1). */
function monthsCovered(sorted: Date[]): number {
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const months =
    (last.getUTCFullYear() - first.getUTCFullYear()) * 12 +
    (last.getUTCMonth() - first.getUTCMonth()) +
    1;
  return Math.max(1, months);
}

function lastBilledAt(records: RemnawaveBillRecord[]): string | null {
  let latest: Date | null = null;
  for (const r of records) {
    const d = parseDate(r.billedAt);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest ? latest.toISOString() : null;
}

/** Remnawave dates are ISO strings, but never trust a remote payload with a `new Date()`. */
function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO 3166-1 alpha-2, or null when Remnawave has no usable code (its own placeholder is "XX"). */
function normalizeCountryCode(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) && code !== 'XX' ? code : null;
}

/** Keep the Remnawave ids on the service so the row can be traced back after the import. */
function remnawaveNodeMeta(
  n: RemnawaveBillingNode,
  perNodeCost: string | null,
): Prisma.InputJsonValue {
  return {
    remnawave: {
      billingNodeUuid: n.uuid,
      nodeUuid: n.nodeUuid,
      providerName: n.provider?.name ?? null,
      countryCode: n.node?.countryCode ?? null,
      nextBillingAt: n.nextBillingAt,
      // Flags the price as derived from the provider's payment history, not read from Remnawave.
      costEstimatedFromHistory: perNodeCost !== null,
    },
  };
}
