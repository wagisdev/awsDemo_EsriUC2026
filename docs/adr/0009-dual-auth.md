# ADR-0009: Dual-auth — referrer-restricted API key for basemaps, OAuth proxy for data

**Status:** Accepted

## Context

The original design (ADR-0004) routed **all** ArcGIS traffic through the
`/arcgis-proxy/*` Lambda@Edge token proxy so the browser never held any
credential. In practice, proxying the basemap style service and the
worker-fetched basemap tiles through the token proxy was messy and broke: public
CDN sprites returned `498` (invalid token) when a token was attached to requests
that were never meant to carry one. Basemaps and public/commodity services are
low-value and cheap; the thing actually worth protecting and metering is the
**data** — the Pormanes network feature services, Living Atlas add-data, portal
item lookups, and geoenrichment.

## Decision

Split traffic by value — a **dual-auth** model:

- **Basemaps + commodity/public services** are called **directly** by the ArcGIS
  SDK, authenticated by a **referrer-restricted ArcGIS API key** set client-side
  as `esriConfig.apiKey`. Hosts include `basemapstyles-api.arcgis.com`,
  `basemaps-api.arcgis.com`, `basemaps.arcgis.com`, `ibasemaps-api.arcgis.com`,
  `*.arcgisonline.com`, public sprites/fonts from `cdn.arcgis.com` /
  `static.arcgis.com`, and SDK assets from `js.arcgis.com`.
- **Data (billable/protected)** continues through the same-origin
  `/arcgis-proxy/` path, where Lambda@Edge injects a short-lived OAuth token. The
  OAuth **client secret never reaches the browser**.

The API key is delivered without committing it to the repo: it lives in Secrets
Manager (`pormanes/arcgis-apikey`), is read only by the asset-deploy step, and is
written into `web/dist/config.json` (served no-cache). The client fetches
`/config.json` at startup to obtain the key.

## Consequences

- The basemap API key is **visible in the browser by design**. Residual risk is
  accepted and mitigated by an **HTTP-referrer restriction** on its ArcGIS app and
  by it being a **low-value commodity-basemap key** with no access to the
  protected data.
- The **data and the OAuth client secret stay protected** — the high-value path is
  unchanged and still same-origin/proxied.
- Simpler and more robust: no more `498`s from tokens attached to public CDN
  requests; the SDK talks to basemap/CDN hosts the way it expects.
- Two ArcGIS apps to manage (an OAuth app for data, an API-key app for basemaps),
  each locked to the configured HTTP referrer.
- Refines ADR-0004, which now covers the DATA path only.
