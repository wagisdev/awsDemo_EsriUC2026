/**
 * Static Lambda@Edge configuration.
 *
 * Lambda@Edge does NOT support environment variables, so configuration is baked
 * into the bundle as constants. To avoid a circular dependency (the function
 * would otherwise need the secret ARN, which is only known after the secret is
 * created), we address the secret by a DETERMINISTIC NAME + REGION that the CDK
 * stack creates with exactly these values. Nothing needs to be injected at
 * deploy time.
 *
 * NOTE: `ALLOWED_HOSTS` must stay in sync with web/src/config/arcgis.ts
 * (`PROXIED_HOSTS`). This is the security allow-list that prevents the proxy
 * from being abused as an open proxy / SSRF vector.
 */

/** Same-origin path prefix mapped to the Esri proxy CloudFront behavior. */
export const PROXY_PREFIX = "/arcgis-proxy";

/** Secrets Manager secret holding {clientId, clientSecret}. */
export const SECRET_ID = "pormanes/arcgis-oauth";

/**
 * Region that hosts the secret. Lambda@Edge runs globally but Secrets Manager
 * is regional; us-east-1 co-locates with the CloudFront cert + edge function.
 */
export const SECRET_REGION = "us-east-1";

/** Requested ArcGIS app-token lifetime (max 120 for app tokens). */
export const TOKEN_EXPIRATION_MINUTES = 120;

/**
 * Referer the token is bound to. A referrer-restricted ArcGIS OAuth app issues
 * tokens tied to a `referer`, and requests must carry a matching `Referer`
 * header. Because the token is minted server-side (the browser never sees it),
 * we mint with — and forward — this single fixed value regardless of which
 * host the visitor used. It MUST be one of the app's registered referrers.
 */
export const TOKEN_REFERER = "https://demo.gis.dev";

/**
 * ArcGIS DATA hosts the proxy is allowed to forward to (dual-auth model).
 * Basemap/commodity hosts are NOT here — they use the client-side API key and
 * are fetched directly. Must stay in sync with web PROXIED_HOSTS.
 */
export const ALLOWED_HOSTS: readonly string[] = [
  "www.arcgis.com",
  "services.arcgis.com",
  ...Array.from({ length: 20 }, (_, i) => `services${i + 1}.arcgis.com`),
  "tiles.arcgis.com",
  "geoenrich.arcgis.com",
  "geocode-api.arcgis.com",
  "route-api.arcgis.com",
];
