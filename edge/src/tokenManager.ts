/**
 * Portable ArcGIS OAuth 2.0 (client-credentials / app auth) token manager.
 *
 * This module is intentionally framework-agnostic so the exact same token
 * lifecycle logic runs in two places:
 *   1. Lambda@Edge (production) — credentials come from AWS Secrets Manager.
 *   2. The Vite dev middleware (local) — credentials come from env vars.
 *
 * It implements the three patterns from the architecture:
 *   - Global-scope caching: the caller holds one long-lived TokenManager whose
 *     state survives across warm invocations / requests.
 *   - Reactive 5-minute safety buffer: a token is treated as stale once
 *     `now + BUFFER >= expiresAt`, so it is refreshed *before* it dies.
 *   - Concurrency promise lock: the in-flight refresh Promise is cached (not the
 *     resolved string), so a burst of parallel tile requests share ONE token
 *     fetch instead of stampeding the OAuth endpoint ("thundering herd").
 */

/** Safety buffer before real expiry at which we proactively refresh. */
export const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/** Default ArcGIS OAuth 2.0 token endpoint (ArcGIS Online / Location Platform). */
export const DEFAULT_TOKEN_URL =
  "https://www.arcgis.com/sharing/rest/oauth2/token";

export interface ArcgisCredentials {
  clientId: string;
  clientSecret: string;
}

export interface TokenManagerOptions {
  /** Resolves the OAuth app credentials (Secrets Manager or env). */
  getCredentials: () => Promise<ArcgisCredentials>;
  /** Override for tests; defaults to the public ArcGIS OAuth endpoint. */
  tokenUrl?: string;
  /** Injectable clock (ms since epoch); defaults to Date.now. */
  now?: () => number;
  /** Injectable fetch; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Requested token lifetime in minutes (max 2h for app tokens). ArcGIS returns
   * the authoritative `expires_in`; this is only the request hint.
   */
  requestedExpirationMinutes?: number;
  /**
   * Referer to bind the token to (required for referrer-restricted apps).
   * Requests using the token must send a matching `Referer` header.
   */
  referer?: string;
}

interface CachedToken {
  token: string;
  /** Absolute expiry (ms since epoch) as reported by ArcGIS. */
  expiresAt: number;
}

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number; // seconds
  error?: { code?: number; message?: string; messageCode?: string };
}

export class TokenManager {
  private readonly getCredentials: () => Promise<ArcgisCredentials>;
  private readonly tokenUrl: string;
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;
  private readonly requestedExpirationMinutes: number;
  private readonly referer?: string;

  /** Global-scope cache: the last known-good token. */
  private cached: CachedToken | null = null;
  /** Concurrency promise lock: the in-flight refresh, if any. */
  private inflight: Promise<CachedToken> | null = null;

  constructor(options: TokenManagerOptions) {
    this.getCredentials = options.getCredentials;
    this.tokenUrl = options.tokenUrl ?? DEFAULT_TOKEN_URL;
    this.now = options.now ?? Date.now;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestedExpirationMinutes = options.requestedExpirationMinutes ?? 120;
    this.referer = options.referer;
  }

  /** True when there is no cached token or it is within the safety buffer. */
  private isStale(): boolean {
    if (!this.cached) return true;
    return this.now() + REFRESH_BUFFER_MS >= this.cached.expiresAt;
  }

  /**
   * Returns a valid token, refreshing if necessary. Concurrent callers during a
   * refresh share the same in-flight Promise.
   */
  async getToken(): Promise<string> {
    if (!this.isStale() && this.cached) {
      return this.cached.token;
    }
    if (this.inflight) {
      const shared = await this.inflight;
      return shared.token;
    }
    this.inflight = this.refresh();
    try {
      const fresh = await this.inflight;
      this.cached = fresh;
      return fresh.token;
    } finally {
      // Release the lock whether we succeeded or failed so the next call retries.
      this.inflight = null;
    }
  }

  /** Performs the actual OAuth 2.0 client-credentials exchange. */
  private async refresh(): Promise<CachedToken> {
    const { clientId, clientSecret } = await this.getCredentials();
    const body = new URLSearchParams({
      f: "json",
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      expiration: String(this.requestedExpirationMinutes),
    });
    // Bind the token to a referer for referrer-restricted apps.
    if (this.referer) body.set("referer", this.referer);

    const requestedAt = this.now();
    const res = await this.fetchImpl(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`ArcGIS token endpoint returned HTTP ${res.status}`);
    }

    const data = (await res.json()) as OAuthTokenResponse;
    // ArcGIS returns HTTP 200 even for auth errors, with an `error` payload.
    if (data.error || !data.access_token) {
      const msg = data.error?.message ?? "unknown error";
      throw new Error(`ArcGIS token request failed: ${msg}`);
    }

    const expiresInMs = (data.expires_in ?? this.requestedExpirationMinutes * 60) * 1000;
    return {
      token: data.access_token,
      expiresAt: requestedAt + expiresInMs,
    };
  }
}
