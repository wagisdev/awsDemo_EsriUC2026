# ADR-0004: Hide the ArcGIS token behind a Lambda@Edge proxy

**Status:** Accepted — **refined / partially superseded by [ADR-0009](0009-dual-auth.md).**
The token proxy now covers **DATA only** (feature services, Living Atlas add-data,
`www.arcgis.com` item lookups, geoenrichment); **basemaps and public/commodity
services use a client-side, referrer-restricted API key** and are not proxied.
The client-side mechanism also changed: URL rewriting now uses
`urlUtils.addProxyRule` (worker-safe) instead of `esriConfig` request
interceptors, because the SDK fetches tiles/features inside web workers where
interceptor functions do not run. The proxied request format is
`/arcgis-proxy/?<fullTargetUrl>` (target URL in the query string).

## Context

ArcGIS content requires authentication. The naive approach embeds an API key or
token in the client, which is trivially extractable, invites abuse, and skews
Esri's pay-as-you-go metering. Requirements: no client credentials, accurate
metering, and no scraping of code/data.

## Decision

Route ArcGIS **data** traffic through the app's own origin at `/arcgis-proxy/*`,
where a **Lambda@Edge** Origin Request function attaches a short-lived token
obtained via OAuth 2.0 **client-credentials** (app auth). The client rewrites
outbound data URLs to the proxy path; the OAuth client secret never reaches the
browser.

> Originally this covered all ArcGIS traffic via an `esriConfig` request
> interceptor. It now covers data only, and rewriting uses the worker-safe
> `urlUtils.addProxyRule` — see the Status note above and ADR-0009.

Token lifecycle (shared `TokenManager`, run at the edge and in the dev
middleware):

1. **Global-scope cache** across warm invocations.
2. **Reactive 5-minute buffer** — refresh before expiry (`now + 5min ≥ expiry`).
3. **Concurrency promise lock** — cache the in-flight refresh Promise so parallel
   tile requests share one token fetch (no thundering herd).

## Consequences

- No OAuth token or client secret in the browser; those credentials stay in
  Secrets Manager. (Per ADR-0009 the browser does hold a referrer-restricted
  basemap API key, which grants no access to this proxied data.)
- The proxy behavior has caching **disabled**, so every proxied data/enrichment
  request reaches Esri and is metered accurately.
- The proxy is constrained by a host allow-list to avoid becoming an open proxy.
- Slight added latency on the proxy path (token attach + origin rewrite), offset
  by edge caching of the token and Esri's own CDN for tiles.
- The dev middleware mirrors the exact contract so local development is also
  token-free.
