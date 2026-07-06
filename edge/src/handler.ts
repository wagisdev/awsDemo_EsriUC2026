import type {
  CloudFrontRequestHandler,
  CloudFrontRequest,
  CloudFrontResultResponse,
} from "aws-lambda";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { TokenManager, type ArcgisCredentials } from "./tokenManager";
import {
  ALLOWED_HOSTS,
  PROXY_PREFIX,
  SECRET_ID,
  SECRET_REGION,
  TOKEN_EXPIRATION_MINUTES,
  TOKEN_REFERER,
} from "./config";

/**
 * Lambda@Edge "token injector" — Origin Request trigger on /arcgis-proxy/*.
 *
 * Request shape (produced by the client's urlUtils.addProxyRule with
 * proxyUrl "/arcgis-proxy/"): the FULL target URL is the query string, e.g.
 *   /arcgis-proxy/?https://services.arcgis.com/ORG/.../query?f=json&where=1=1
 *
 * We use addProxyRule (not esriConfig request interceptors) because the SDK
 * fetches tiles/features in web workers, where interceptor functions do not
 * run but serializable proxy rules do.
 *
 * This function:
 *   1. Extracts the target URL, validates its host against an allow-list
 *      (prevents the proxy being abused as an open proxy / SSRF vector).
 *   2. Obtains a valid ArcGIS app token from the shared TokenManager
 *      (global-scope cache + 5-min refresh buffer + concurrency promise lock).
 *   3. Rewrites the request to the real upstream origin and appends the token,
 *      so the browser never sees a credential.
 *
 * The OAuth client id/secret live in Secrets Manager; because the token is
 * cached at the edge for up to ~2h, the secret is only read on a cold start or
 * a refresh window.
 */

// ---- Module (global) scope: survives warm invocations ---------------------

const secretsClient = new SecretsManagerClient({ region: SECRET_REGION });

// Cache the parsed credentials so we don't re-read the secret on every refresh.
let cachedCredentials: ArcgisCredentials | null = null;

async function getCredentials(): Promise<ArcgisCredentials> {
  if (cachedCredentials) return cachedCredentials;
  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: SECRET_ID }),
  );
  if (!result.SecretString) {
    throw new Error(`Secret ${SECRET_ID} has no SecretString`);
  }
  const parsed = JSON.parse(result.SecretString) as {
    clientId?: string;
    clientSecret?: string;
  };
  if (!parsed.clientId || !parsed.clientSecret) {
    throw new Error(`Secret ${SECRET_ID} missing clientId/clientSecret`);
  }
  cachedCredentials = { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
  return cachedCredentials;
}

const tokenManager = new TokenManager({
  getCredentials,
  requestedExpirationMinutes: TOKEN_EXPIRATION_MINUTES,
  referer: TOKEN_REFERER,
});

// ---- Helpers ---------------------------------------------------------------

function deny(status: string, message: string): CloudFrontResultResponse {
  return {
    status,
    statusDescription: message,
    headers: {
      "content-type": [{ key: "Content-Type", value: "application/json" }],
      "cache-control": [{ key: "Cache-Control", value: "no-store" }],
    },
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Extract the target URL from the request. The whole target URL is the query
 * string (addProxyRule format); it may be raw or percent-encoded.
 */
export function parseTargetUrl(uri: string, querystring: string): URL | null {
  if (!uri.startsWith(PROXY_PREFIX)) return null;
  if (!querystring) return null;
  let candidate = querystring;
  if (!/^https?:\/\//i.test(candidate)) {
    try {
      candidate = decodeURIComponent(querystring);
    } catch {
      return null;
    }
  }
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function rewriteToUpstream(
  request: CloudFrontRequest,
  target: URL,
  token: string,
): void {
  // Append the token to the target's own query params; never alter the
  // response format (`f`) — vector tiles/sprites/glyphs are binary.
  target.searchParams.set("token", token);

  request.uri = target.pathname;
  request.querystring = target.searchParams.toString();

  // Dynamically override the origin to the real ArcGIS host.
  request.origin = {
    custom: {
      domainName: target.host,
      port: 443,
      protocol: "https",
      path: "",
      // CloudFront origin SSL protocols only allow up to TLSv1.2 (TLSv1.3 is
      // not a valid value here and makes the origin override invalid).
      sslProtocols: ["TLSv1.2"],
      readTimeout: 30,
      keepaliveTimeout: 5,
      customHeaders: {},
    },
  };
  // The Host header must match the upstream origin, not the CloudFront domain.
  request.headers.host = [{ key: "Host", value: target.host }];
  // The token is bound to TOKEN_REFERER, so the request must carry a matching
  // Referer header. We set it ourselves rather than trusting the browser's,
  // so it's consistent regardless of which host the visitor used.
  request.headers.referer = [{ key: "Referer", value: TOKEN_REFERER }];
}

// ---- Handler ---------------------------------------------------------------

export const handler: CloudFrontRequestHandler = async (event) => {
  const request = event.Records[0].cf.request;

  const target = parseTargetUrl(request.uri, request.querystring);
  if (!target) {
    return deny("400", "Missing or malformed proxy target");
  }
  if (!ALLOWED_HOSTS.includes(target.host)) {
    return deny("403", `Host not allowed: ${target.host}`);
  }

  try {
    const token = await tokenManager.getToken();
    rewriteToUpstream(request, target, token);
    return request;
  } catch (err) {
    return deny("502", `Token acquisition failed: ${(err as Error).message}`);
  }
};
