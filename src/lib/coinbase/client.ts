import "server-only";

import { generateCdpJwt } from "./jwt";

/**
 * Low-level authenticated HTTP client for Coinbase Advanced Trade's REST
 * API. Shared by every venue adapter (CFM today; INTX/whatever replaces it
 * later) since auth, retry, and pagination mechanics are identical across
 * venues -- only which product_ids/endpoints get called differs, and that
 * lives in lib/coinbase/venues/*.
 *
 * UNVERIFIED AGAINST LIVE COINBASE: this client is written from confirmed
 * documentation (docs/COINBASE_INTEGRATION.md) but has never made a real
 * request -- no credentials exist yet. Per docs/VALIDATION_CHECKLIST.md,
 * it must not be trusted with real trading history until that checklist
 * passes.
 */

const API_HOST = "api.coinbase.com";
const BASE_PATH = "/api/v3/brokerage";
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 500;

export interface CoinbaseClientConfig {
  apiKeyName: string;
  privateKeyPem: string;
}

export class CoinbaseApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "CoinbaseApiError";
  }
}

export class CoinbaseRestClient {
  constructor(private readonly config: CoinbaseClientConfig) {}

  async get<T>(path: string, params?: Record<string, string | string[] | number | undefined>): Promise<T> {
    return this.request<T>("GET", path, params);
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    params?: Record<string, string | string[] | number | undefined>,
  ): Promise<T> {
    const query = buildQueryString(params);
    const fullPath = `${BASE_PATH}${path}`;
    const url = `https://${API_HOST}${fullPath}${query}`;

    let attempt = 0;
    let backoff = INITIAL_BACKOFF_MS;

    for (;;) {
      const jwt = await generateCdpJwt({
        keyName: this.config.apiKeyName,
        privateKeyPem: this.config.privateKeyPem,
        method,
        host: API_HOST,
        path: fullPath,
      });

      // Never cacheable at the fetch level: the Authorization header carries
      // a fresh nonce + timestamp on every call (required for CDP's replay
      // protection), so Next.js's fetch cache -- which keys on headers too
      // -- would never actually get a hit here even if asked to try. Any
      // caching for this client has to happen above this layer.
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const retryable = response.status === 429 || response.status >= 500;
      attempt += 1;

      if (!retryable || attempt > MAX_RETRIES) {
        // Never include response headers/body verbatim in the thrown error
        // -- they could theoretically echo request metadata. Status + path
        // is enough to diagnose without risking a leak into logs/notifications.
        throw new CoinbaseApiError(
          `Coinbase API request failed (${response.status})`,
          response.status,
          path,
        );
      }

      // Respect Coinbase's own rate-limit signal when present, otherwise
      // exponential backoff. Never busy-loop on 429.
      const remaining = response.headers.get("CB-RATE-LIMIT-REMAINING");
      const waitMs = remaining === "0" ? backoff * 2 : backoff;
      await sleep(waitMs);
      backoff *= 2;
    }
  }

  /**
   * Drains a cursor-paginated GET endpoint to completion, yielding one
   * page's items at a time. Callers decide how many pages to actually
   * fetch (e.g. stop once sequence_timestamp passes a known watermark).
   */
  async *paginate<TItem>(
    path: string,
    itemsKey: string,
    params: Record<string, string | string[] | number | undefined> = {},
    maxPages = 200,
  ): AsyncGenerator<TItem[]> {
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const response = await this.get<Record<string, unknown>>(path, {
        ...params,
        cursor,
      });
      const items = (response[itemsKey] as TItem[] | undefined) ?? [];
      yield items;

      const nextCursor = response.cursor as string | undefined;
      const hasMore = Boolean(nextCursor) && items.length > 0;
      if (!hasMore) return;
      cursor = nextCursor;
    }

    // Quedarse sin páginas con Coinbase diciendo que hay más es un hueco en
    // los datos, y un hueco en los datos no puede pasar en silencio.
    //
    // Antes se salía del bucle sin más y la sincronización se daba por buena
    // con parte del histórico: exactamente la forma de fallo que dejó una
    // compra sin registrar y convirtió una semana de operaciones en una
    // posición fantasma. Un error ruidoso deja las cifras viejas -- que se
    // sabe que son viejas -- en vez de cifras nuevas y falsas.
    throw new Error(
      `Coinbase sigue devolviendo páginas de ${path} después de ${maxPages}. La sincronización se detiene en vez de guardar un histórico incompleto.`,
    );
  }
}

function buildQueryString(params?: Record<string, string | string[] | number | undefined>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, v);
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
