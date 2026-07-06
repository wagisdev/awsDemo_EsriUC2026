# Pormanes.NET Map Viewer — Design

A single-page map viewer that shows Pormanes.NET's network plans — both
currently-deployed and future/planned build-out — for Brgy. San Isidro, Almagro
Island, Western Samar. Built for the Esri UC 2026 demo.

The defining constraint: **the protected data and the OAuth client secret never
reach the browser.** The system runs a **dual-auth** model that splits traffic by
value (see ADR-0009):

- **Basemaps + commodity/public services** are called **directly** by the ArcGIS
  SDK, authenticated by a **referrer-restricted ArcGIS API key** set client-side
  as `esriConfig.apiKey`. The key is present in the browser but is protected by an
  HTTP-referrer restriction on its ArcGIS app; it is a low-value commodity key, not
  a secret in the same sense as the OAuth client secret.
- **Data (billable/protected)** — the Pormanes network feature services, Living
  Atlas add-data, portal item lookups (`www.arcgis.com`), and geoenrichment — go
  through the same-origin `/arcgis-proxy/` path, where a **Lambda@Edge** function
  injects a short-lived OAuth token. The OAuth **client secret never reaches the
  browser**.

This keeps the credentials worth protecting off the client, keeps Esri's
pay-as-you-go metering accurate on the billable data path, and prevents the
protected data from being scraped directly — while avoiding the fragility of
proxying public basemap/CDN traffic (which broke: public sprites returned `498`
when a token was attached).

## Repository layout

```
web/     React 19 + Vite + TypeScript frontend (ArcGIS Maps SDK for JS)
edge/    Lambda@Edge "token injector" + shared TokenManager
infra/   AWS CDK (TypeScript) — CloudFront, WAF, Lambda@Edge, S3, Secrets Manager
docs/    Design, security, ADRs, diagrams, deployment runbook
.github/ CI/CD (OIDC deploy workflow)
```

npm workspaces tie the three packages together. Everything is TypeScript.

## Request flow

```
Browser (demo.gis.dev)
  │
  ├──────────────────────────────────────────────► Esri basemap + public CDN hosts (DIRECT)
  │   basemapstyles-api / basemaps-api / ibasemaps-api / *.arcgisonline.com,
  │   cdn.arcgis.com / static.arcgis.com sprites+fonts, js.arcgis.com SDK assets.
  │   Auth: referrer-restricted API key (esriConfig.apiKey). NOT proxied.
  │
  ▼  DNS-only (Cloudflare grey cloud) — real client IP preserved
CloudFront distribution  ── WAF (managed rules + rate limit)
  │
  ├── /index.html, /assets/*   →  S3 (private, OAC).   Cache: 3 days in prod / OFF in dev.
  │                               CloudFront Function adds CSP + security headers.
  │
  ├── /config.json             →  S3 (private, OAC). Served no-cache. Carries the
  │                               referrer-restricted API key (written at deploy time).
  │
  └── /arcgis-proxy/?<url>      →  Lambda@Edge (Origin Request). Cache: DISABLED.
        DATA path only: feature services, Living Atlas add-data,
        www.arcgis.com item lookups, geoenrichment.
        1. validate upstream host against allow-list
        2. get token (cached at edge; refresh w/ 5-min buffer; promise lock)
        3. rewrite origin to the real Esri host + append OAuth token
        │
        ▼
      Esri Location Platform data services / geoenrichment
```

## Frontend

- **Stack:** React 19, Vite, TypeScript, `@arcgis/core` (ArcGIS Maps SDK for JS).
- **Look & feel:** frosted-glass panels over a dark high-tech map background,
  cyan/blue accents, Outfit typeface — replicating https://pormanes.net.
- **Dual-auth client:** at startup the app fetches `/config.json` (served
  no-cache) to obtain the referrer-restricted API key and sets it as
  `esriConfig.apiKey`, so basemap and public/commodity hosts are called directly.
  For the DATA hosts, `urlUtils.addProxyRule` (worker-safe) rewrites outbound URLs
  to the same-origin `/arcgis-proxy/?<fullTargetUrl>` (target URL in the query
  string). `addProxyRule` is used instead of `esriConfig.request.interceptors`
  because the SDK fetches tiles/features inside web workers where interceptor
  functions never run. Dummy tokens + auth-dialog suppression keep the SDK from
  prompting. See `web/src/map/arcgisProxy.ts` + `web/src/config/arcgis.ts`.
- **Operational layers** (all Feature Layers — see ADR-0003):

  | Layer | Item | Sublayer | Geometry |
  |-------|------|----------|----------|
  | Access Points | `dc8dd34b…` | 0 | point |
  | Infrastructure Nodes | `dc8dd34b…` | 1 | point |
  | Backbone Run | `dc8dd34b…` | 2 | polyline |
  | Planned Coverage | `e67eeddc…` | 3 | polygon |

  Symbology is authored on the services and consumed as-is. The client only adds
  filtering and widgets.

- **Widgets** (`web/src/widgets/`): Layers, live Coordinates readout, Ruler,
  Drawing, Coordinate Conversion, Buffers, Data Enrichment, attribute Table,
  Filter (current vs. planned), Add Data (Living Atlas only), Share, plus a **Home**
  button in the toolbar that resets to the Planned Coverage framing (it replaced the
  on-map +/- zoom control). The UI-chrome widgets are built on the stable
  **`@arcgis/map-components`** web components (v5.1.9, matched to `@arcgis/core`
  5.1.9) rather than the deprecated JS-API widget classes — `arcgis-layer-list`,
  `arcgis-basemap-gallery`, `arcgis-coordinate-conversion`, the dedicated
  `arcgis-distance-measurement-2d` + `arcgis-area-measurement-2d`,
  `arcgis-feature-table`, and `arcgis-sketch` — bound to the imperatively-created
  `MapView` via each component's `.view` property (see ADR-0010). The Buffer tool
  uses `geometry/operators/geodesicBufferOperator` (`load()` then `execute()`)
  instead of the deprecated `geometryEngine`.
- **View framing & refinements:** the default view fits the Planned Coverage extent
  then steps one zoom level closer; navigation is **not** locked (users can pan and
  zoom out freely). The attribute table's layer picker excludes Planned Coverage,
  and the basemap gallery panel is widened so its thumbnail grid shows two columns.
- **Current vs. future filter:** discovered dynamically — the app queries the
  service for distinct `status` values, classifies each as current/future by
  keyword, and builds a `definitionExpression` (falls back to `dateDeployed` if
  no status values classify). See `web/src/widgets/filter/lifecycle.ts`.
- **Share:** the current view (center, zoom, basemap, visible layers, lifecycle
  filter) is encoded entirely in the URL query string — no backend, no
  short-link service. See `web/src/widgets/share/`.

## Edge token injector

`edge/src/handler.ts` runs as a CloudFront **Origin Request** trigger on
`/arcgis-proxy/*`. The reusable `edge/src/tokenManager.ts` implements the three
required patterns:

1. **Global-scope cache** — one long-lived token held outside the handler,
   surviving warm invocations.
2. **Reactive 5-minute buffer** — a token is treated as stale once
   `now + 5min ≥ expiry`, so it is refreshed *before* it dies.
3. **Concurrency promise lock** — the in-flight refresh Promise (not the string)
   is cached, so a burst of parallel tile requests share one token fetch instead
   of stampeding the OAuth endpoint.

The OAuth client id/secret live in Secrets Manager and are read only on a cold
start or a refresh window. The upstream host is validated against an allow-list
to prevent the proxy being abused as an open proxy / SSRF vector.

The same lifecycle logic runs locally via a Vite dev middleware
(`web/dev/arcgisProxyDevPlugin.ts`) so `npm run dev` stays token-free too.

## Infrastructure (AWS CDK)

A single stack in **us-east-1** (`infra/lib/edge-stack.ts`), because the ACM
certificate for a CloudFront distribution, a CLOUDFRONT-scope WAF WebACL, and
Lambda@Edge are all us-east-1-only. The private origin bucket is co-located there
(see ADR-0002).

- **S3** — private, Block All Public Access, SSE-S3, TLS enforced, reachable only
  via CloudFront Origin Access Control (OAC).
- **CloudFront** — two behaviors (static S3 / Esri proxy), TLS 1.2+, WAF attached.
- **WAF** — AWS managed rule groups (common, known-bad-inputs, IP reputation) +
  an IP rate-based rule against scraping bots.
- **CloudFront Function** — attaches CSP + HSTS + other security headers.
- **Lambda@Edge** — the token injector (`nodejs22.x`, 128 MB, `/arcgis-proxy/*`
  Origin Request, caching disabled).
- **Secrets Manager** — two secrets, created by CDK with placeholders and
  populated out-of-band: `pormanes/arcgis-oauth` (`{clientId, clientSecret}`, read
  by Lambda@Edge only) and `pormanes/arcgis-apikey` (`{apiKey}`, read only by the
  asset-deploy step, which writes it into `web/dist/config.json`). No Lambda ever
  reads the API key.

See [diagrams/architecture.md](diagrams/architecture.md) for the diagram and
[../docs/adr/](adr/) for the decision record.

## CI/CD

GitHub Actions deploys on push to `main`, running the deploy job in the GitHub
**`production`** Environment (Node 24 runners). It authenticates to AWS with
**OIDC** (no long-lived keys); the trust policy is scoped to the subject
`repo:wagisdev/awsDemo_EsriUC2026_Sec:environment:production`. Beyond assuming the
CDK bootstrap roles for `cdk deploy`, the deploy role carries scoped,
least-privilege permissions the asset-upload step runs with directly (CFN
`DescribeStacks`, read the `pormanes/arcgis-apikey` secret, S3 sync on the site
bucket, CloudFront invalidation). See [SECURITY.md](SECURITY.md) §6 and
[DEPLOYMENT.md](DEPLOYMENT.md).

## Documentation index

- [SECURITY.md](SECURITY.md) — security design in depth
- [DEPLOYMENT.md](DEPLOYMENT.md) — deploy runbook + manual configuration values
- [diagrams/architecture.md](diagrams/architecture.md) — infrastructure diagram
- [adr/](adr/) — architecture decision records
