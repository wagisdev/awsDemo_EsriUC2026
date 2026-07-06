/**
 * Single source of truth for infrastructure configuration.
 * Values here intentionally mirror the edge + web configs (kept in sync by
 * documentation, since the three packages don't share a build).
 */

/** Public hostname served by CloudFront (Cloudflare DNS-only / grey cloud). */
export const DOMAIN_NAME = "demo.gis.dev";

/**
 * Region for CloudFront-coupled resources. The ACM certificate for a
 * distribution, a CLOUDFRONT-scope WAF WebACL, and Lambda@Edge functions are
 * ONLY supported in us-east-1, so these must live there.
 */
export const EDGE_REGION = "us-east-1";

/**
 * Preferred region for everything else (per project standard). The private
 * static-site origin bucket lives here.
 */
export const SITE_REGION = "us-west-2";

/** Deterministic Secrets Manager name (matches edge/src/config.ts SECRET_ID). */
export const ARCGIS_SECRET_NAME = "pormanes/arcgis-oauth";

/**
 * Strict Content Security Policy. Everything the app needs is same-origin
 * (ArcGIS traffic is proxied through /arcgis-proxy), so script/connect are
 * locked to 'self'. 'wasm-unsafe-eval' + worker/blob are required by the
 * ArcGIS Maps SDK (WebAssembly + web workers). Google Fonts hosts are allowed
 * for the Outfit typeface.
 */
// `https://js.arcgis.com` is the ArcGIS SDK's CDN for PUBLIC, non-billable
// static assets: web workers, localization (t9n), wasm, sprites, fonts. The SDK
// requires these at runtime. All BILLABLE/PROTECTED traffic (basemap tiles,
// feature data, enrichment) is proxied through the same origin (/arcgis-proxy),
// so it is covered by 'self' — no ArcGIS data host is whitelisted here.
// ArcGIS SDK CDN — public, non-billable static assets (workers, t9n, wasm).
const ARCGIS_CDN = "https://js.arcgis.com";
// Public Esri CDN for basemap sprites/fonts.
const ARCGIS_STATIC = "https://cdn.arcgis.com https://static.arcgis.com";
// Basemap/commodity service hosts. Under the dual-auth model these are reached
// DIRECTLY with the referrer-restricted API key (not via the proxy), so they
// must be allowed here. DATA hosts (services*.arcgis.com) are NOT listed — they
// are proxied to the same origin and covered by 'self'.
// *.arcgisonline.com covers the classic imagery/tile hosts (server.*, services.*)
// which the imagery basemap tiles are served from.
const ARCGIS_BASEMAP =
  "https://basemapstyles-api.arcgis.com https://basemaps-api.arcgis.com " +
  "https://basemaps.arcgis.com https://ibasemaps-api.arcgis.com " +
  "https://*.arcgisonline.com";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' blob: ${ARCGIS_CDN}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${ARCGIS_CDN}`,
  `font-src 'self' https://fonts.gstatic.com ${ARCGIS_CDN} ${ARCGIS_STATIC}`,
  // www.arcgis.com is allowed for IMAGES only (public portal item + basemap
  // gallery thumbnails). Its data APIs remain proxied (not in connect-src).
  `img-src 'self' data: blob: ${ARCGIS_CDN} ${ARCGIS_STATIC} ${ARCGIS_BASEMAP} https://www.arcgis.com`,
  `connect-src 'self' ${ARCGIS_CDN} ${ARCGIS_STATIC} ${ARCGIS_BASEMAP}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** AWS-managed WAF rule groups applied at the CloudFront edge. */
export const WAF_MANAGED_RULE_GROUPS = [
  "AWSManagedRulesCommonRuleSet",
  "AWSManagedRulesKnownBadInputsRuleSet",
  "AWSManagedRulesAmazonIpReputationList",
] as const;

/** Rate limit (requests / 5 min / IP) to blunt map-scraping bots. */
export const WAF_RATE_LIMIT = 2000;
