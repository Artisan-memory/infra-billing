import { z } from 'zod';
import { periodSchema } from '../enums';
import { currencySchema, isoDateSchema, moneySchema, uuidSchema } from './common';

/**
 * One-off import of the Remnawave panel's own infra-billing records (Infra Billing Controller:
 * providers, billing nodes, billing history) into this panel.
 *
 * The Remnawave credentials are supplied per request and NEVER stored — they are only used for the
 * outbound read calls, so the panel keeps no second set of secrets after the import.
 */
export const remnawaveConnectionSchema = z.object({
  url: z.string().url().describe('Remnawave panel URL (REMNAWAVE_URL)'),
  token: z.string().min(1).describe('Remnawave API token (REMNAWAVE_TOKEN)'),
  // Panels behind a reverse-proxy cookie gate (Remnawave's recommended hardening) need it sent
  // alongside the bearer token, otherwise the proxy answers instead of the API.
  cookieName: z.string().min(1).describe('Reverse-proxy cookie name (AUTH_COOKIE_NAME)').optional(),
  cookieValue: z
    .string()
    .min(1)
    .describe('Reverse-proxy cookie value (AUTH_COOKIE_VALUE)')
    .optional(),
});
export type RemnawaveConnection = z.infer<typeof remnawaveConnectionSchema>;

export const remnawaveImportSchema = remnawaveConnectionSchema.extend({
  // Remnawave's infra billing stores bare numbers with no currency, so the owner names it here.
  currency: currencySchema.describe('Currency of the imported amounts'),
  // Where imported billing nodes land; defaults to the default project.
  projectUuid: uuidSchema.describe('Project for imported nodes').optional(),
  // Remnawave has no per-node price either — one cost is applied to every newly created service
  // (never to an already imported one, so owner edits survive a re-run).
  nodeCost: moneySchema.describe('Cost per period for each new node').optional(),
  period: periodSchema.describe('Billing period for new nodes').optional(),
  importNodes: z.boolean().describe('Import billing nodes as services').optional(),
  importHistory: z.boolean().describe('Import billing history as payments').optional(),
});
export type RemnawaveImport = z.infer<typeof remnawaveImportSchema>;

/** What one Remnawave provider brings in, and whether it maps onto an existing panel provider. */
export const remnawaveProviderPreviewSchema = z.object({
  name: z.string().describe('Provider name in Remnawave'),
  loginUrl: z.string().describe('Control panel URL').nullable(),
  nodes: z.number().int().nonnegative().describe('Billing nodes'),
  records: z.number().int().nonnegative().describe('Billing history records'),
  amount: moneySchema.describe('Sum of the billing history amounts'),
  lastBilledAt: isoDateSchema.describe('Most recent billing date').nullable(),
  // Set when a panel provider already carries the same name — the import reuses it instead of
  // creating a duplicate.
  matchedProviderUuid: uuidSchema.describe('Existing panel provider matched by name').nullable(),
});
export type RemnawaveProviderPreview = z.infer<typeof remnawaveProviderPreviewSchema>;

/** Dry run: what the import would bring in. Writes nothing. */
export const remnawavePreviewSchema = z.object({
  providers: z.array(remnawaveProviderPreviewSchema).describe('Per-provider breakdown'),
  totalProviders: z.number().int().nonnegative().describe('Providers found'),
  totalNodes: z.number().int().nonnegative().describe('Billing nodes found'),
  totalRecords: z.number().int().nonnegative().describe('History records found'),
  totalAmount: moneySchema.describe('Sum of every history amount'),
});
export type RemnawavePreview = z.infer<typeof remnawavePreviewSchema>;

/** Import summary. Nothing is ever deleted: rows are matched by their Remnawave id and refreshed. */
export const remnawaveImportResultSchema = z.object({
  providersCreated: z.number().int().nonnegative().describe('Providers created'),
  providersMatched: z.number().int().nonnegative().describe('Existing providers reused'),
  servicesCreated: z.number().int().nonnegative().describe('Services created from nodes'),
  servicesUpdated: z.number().int().nonnegative().describe('Already imported services refreshed'),
  paymentsCreated: z.number().int().nonnegative().describe('Payments created from history'),
  paymentsUpdated: z.number().int().nonnegative().describe('Already imported payments refreshed'),
});
export type RemnawaveImportResult = z.infer<typeof remnawaveImportResultSchema>;

/** `externalId` prefixes that tie an imported row back to its Remnawave record (dedup key). */
export const REMNAWAVE_NODE_PREFIX = 'remnawave:node:';
export const REMNAWAVE_BILL_PREFIX = 'remnawave:bill:';
