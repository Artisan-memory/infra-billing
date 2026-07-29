import { z } from 'zod';
import { isoDateSchema, moneySchema, uuidSchema } from './common';

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

/**
 * Remnawave's infra billing carries no currency and no per-node price — `amount` is a bare number
 * and a billing node holds only a name, a country and a next-billing date. So the import asks for
 * nothing beyond the connection: amounts are USD (what Remnawave bills in), and each node's monthly
 * price is derived from the provider's own payment history (total paid / months / node count).
 */
export const remnawaveImportSchema = remnawaveConnectionSchema;
export type RemnawaveImport = z.infer<typeof remnawaveImportSchema>;

/** Currency of the imported amounts. Remnawave has no currency field; it bills in USD. */
export const REMNAWAVE_CURRENCY = 'USD';

/** What one Remnawave provider brings in, and whether it maps onto an existing panel provider. */
export const remnawaveProviderPreviewSchema = z.object({
  name: z.string().describe('Provider name in Remnawave'),
  loginUrl: z.string().describe('Control panel URL').nullable(),
  nodes: z.number().int().nonnegative().describe('Billing nodes'),
  records: z.number().int().nonnegative().describe('Billing history records'),
  amount: moneySchema.describe('Sum of the billing history amounts'),
  // Monthly price each node will get: total paid / months covered / node count. Null when there is
  // nothing to divide, and the nodes then arrive unpriced.
  perNodeCost: moneySchema.describe('Derived monthly cost per node').nullable(),
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

/** Result of removing everything a previous import created, so it can be run again from scratch. */
export const remnawaveCleanupResultSchema = z.object({
  servicesDeleted: z.number().int().nonnegative().describe('Imported services removed'),
  paymentsDeleted: z.number().int().nonnegative().describe('Imported payments removed'),
});
export type RemnawaveCleanupResult = z.infer<typeof remnawaveCleanupResultSchema>;

/** `externalId` prefixes that tie an imported row back to its Remnawave record (dedup key). */
export const REMNAWAVE_NODE_PREFIX = 'remnawave:node:';
export const REMNAWAVE_BILL_PREFIX = 'remnawave:bill:';
