import axios, { type AxiosInstance } from 'axios';
import type { RemnawaveConnection } from '@infra/shared';
import { REQUEST_TIMEOUT_MS } from '@connectors/common/http';
import {
  RemnawaveBillRecord,
  RemnawaveBillingNode,
  RemnawaveEnvelope,
  RemnawaveErrorBody,
  RemnawaveHistoryResponse,
  RemnawaveInfraProvider,
  RemnawaveNodesResponse,
  RemnawaveProvidersResponse,
} from './remnawave.types';

// Billing history is the only paginated endpoint (`start`/`size`, size capped at 500 by the API).
const HISTORY_PAGE_SIZE = 500;
const MAX_HISTORY_PAGES = 200; // safety cap (100k records) so a broken `total` can't loop forever

/**
 * Read-only client for a Remnawave panel's Infra Billing Controller. Built per import from the
 * credentials typed into the panel — nothing is cached or persisted.
 *
 * Auth is the API token as a bearer header. Panels hardened with the reverse-proxy cookie gate also
 * need that cookie, otherwise the proxy (not the API) answers — usually with an HTML page, which is
 * reported as such instead of a JSON parse failure.
 */
export class RemnawaveClient {
  private readonly http: AxiosInstance;

  constructor(creds: RemnawaveConnection) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${creds.token}`,
      Accept: 'application/json',
    };
    if (creds.cookieName && creds.cookieValue) {
      headers.Cookie = `${creds.cookieName}=${creds.cookieValue}`;
    }
    this.http = axios.create({
      baseURL: normalizeRemnawaveUrl(creds.url),
      timeout: REQUEST_TIMEOUT_MS,
      headers,
    });
    this.http.interceptors.response.use((res) => {
      // A cookie gate / wrong host answers 200 with HTML. Say so, rather than blaming the payload.
      const type = String(res.headers['content-type'] ?? '');
      if (type && !type.includes('json')) {
        throw new Error(
          'Remnawave returned a non-JSON response — check the panel URL and the reverse-proxy cookie',
        );
      }
      return res;
    }, describeError);
  }

  async fetchProviders(signal: AbortSignal): Promise<RemnawaveInfraProvider[]> {
    const { data } = await this.http.get<RemnawaveEnvelope<RemnawaveProvidersResponse>>(
      '/api/infra-billing/providers',
      { signal },
    );
    return data.response?.providers ?? [];
  }

  async fetchBillingNodes(signal: AbortSignal): Promise<RemnawaveBillingNode[]> {
    const { data } = await this.http.get<RemnawaveEnvelope<RemnawaveNodesResponse>>(
      '/api/infra-billing/nodes',
      { signal },
    );
    return data.response?.billingNodes ?? [];
  }

  /** Whole billing history, paged until `total` is reached (default page size would be 50). */
  async fetchHistory(signal: AbortSignal): Promise<RemnawaveBillRecord[]> {
    const out: RemnawaveBillRecord[] = [];
    for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
      const { data } = await this.http.get<RemnawaveEnvelope<RemnawaveHistoryResponse>>(
        '/api/infra-billing/history',
        { params: { start: page * HISTORY_PAGE_SIZE, size: HISTORY_PAGE_SIZE }, signal },
      );
      const records = data.response?.records ?? [];
      out.push(...records);
      // Short page = last page. `total` guards the case where the API keeps returning full pages.
      if (records.length < HISTORY_PAGE_SIZE || out.length >= (data.response?.total ?? 0)) break;
    }
    return out;
  }
}

/**
 * Accept whatever the owner pastes: trailing slashes, and a trailing `/api` (the endpoints below
 * already carry the `/api` prefix, so keeping it would produce `/api/api/...`).
 */
export function normalizeRemnawaveUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
}

/** Turn an axios failure into a message that names the likely cause. */
function describeError(e: unknown): never {
  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    if (status === 401 || status === 403) {
      throw new Error(
        'Remnawave rejected the credentials (HTTP ' +
          status +
          ') — check the API token, and the reverse-proxy cookie if the panel is behind one',
      );
    }
    if (status === 404) {
      throw new Error(
        'Remnawave infra-billing API not found (HTTP 404) — check the panel URL and that the panel is 2.0 or newer',
      );
    }
    const body = e.response?.data as RemnawaveErrorBody | string | undefined;
    const message = typeof body === 'object' && body?.message ? body.message : e.message;
    throw new Error(`Remnawave: ${message}`);
  }
  throw e;
}
