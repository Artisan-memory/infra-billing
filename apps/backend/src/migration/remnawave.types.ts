// Shapes of the Remnawave Infra Billing Controller responses we read during the one-off import
// (GET /api/infra-billing/{providers,nodes,history}). Only the fields the import consumes are
// declared; everything Remnawave adds later is simply ignored.

/** Every Remnawave response is wrapped in `{ response: ... }`. */
export interface RemnawaveEnvelope<T> {
  response: T;
}

/** Error bodies: `{ message, statusCode, errors }` (4xx) or `{ message, errorCode }` (5xx). */
export interface RemnawaveErrorBody {
  message?: string;
  statusCode?: number;
  errorCode?: string;
}

export interface RemnawaveInfraProvider {
  uuid: string;
  name: string;
  faviconLink: string | null;
  loginUrl: string | null;
  createdAt: string;
  updatedAt: string;
  billingHistory: { totalAmount: number; totalBills: number };
}

export interface RemnawaveProvidersResponse {
  total: number;
  providers: RemnawaveInfraProvider[];
}

/** A node the owner pays for. `node` is null once the underlying Remnawave node is gone. */
export interface RemnawaveBillingNode {
  uuid: string;
  nodeUuid: string | null;
  name: string | null;
  providerUuid: string;
  provider: { uuid: string; name: string; loginUrl: string | null; faviconLink: string | null };
  node: { uuid: string; name: string; countryCode: string } | null;
  nextBillingAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemnawaveNodesResponse {
  totalBillingNodes: number;
  billingNodes: RemnawaveBillingNode[];
}

/** One "I paid this provider X on this date" record. Remnawave stores no currency. */
export interface RemnawaveBillRecord {
  uuid: string;
  providerUuid: string;
  amount: number;
  billedAt: string;
  provider: { uuid: string; name: string; faviconLink: string | null };
}

export interface RemnawaveHistoryResponse {
  records: RemnawaveBillRecord[];
  total: number;
}
