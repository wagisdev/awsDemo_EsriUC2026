# Security Design

The security model rests on one principle: **the credentials worth protecting —
the OAuth client secret and access to the billable/protected data — never reach
the client.** The system runs a deliberate **dual-auth** split (see ADR-0009); the
controls below layer defense around the high-value path.

## 1. Credential isolation (the core control)

Traffic is split by value:

- **The OAuth client secret is the strong control.** The ArcGIS OAuth **client
  id/secret live only in AWS Secrets Manager** (`pormanes/arcgis-oauth`), never in
  the repo, the build, or the client bundle. A **Lambda@Edge** function exchanges
  those credentials for a short-lived (≤2 h) app token and attaches it to each
  proxied **data** request. The token exists only at the edge and on the wire to
  Esri — never in the browser. It is cached at the edge with a 5-minute refresh
  buffer, so Secrets Manager is read only on a cold start or refresh window (small
  attack surface, low cost).
- **The basemap API key is client-side, by design.** Basemaps and public/commodity
  services are authenticated by a **referrer-restricted ArcGIS API key** set as
  `esriConfig.apiKey`. It is delivered to the browser at runtime via `/config.json`
  and is therefore visible in the client. This is a deliberate, lower-sensitivity
  tradeoff: proxying the basemap style service and worker-fetched tiles was fragile
  (public CDN sprites returned `498` when a token was attached), and the key is a
  low-value commodity-basemap key with **no access to the protected data**. It is
  constrained by an **HTTP-referrer restriction** on its ArcGIS app, so it is only
  usable from the configured origin.

## 2. Proxy hardening (anti-SSRF / anti-open-proxy)

- The edge function only forwards to hosts on an explicit **allow-list** of the
  **DATA hosts** (`edge/src/config.ts` `ALLOWED_HOSTS`) — feature services, Living
  Atlas add-data, `www.arcgis.com` item lookups, and geoenrichment. Basemap/CDN
  hosts are *not* proxied (they are called directly with the referrer-restricted
  API key), so they are not on this list. Any other host returns `403`. This
  prevents the `/arcgis-proxy/*` path from being abused to reach arbitrary URLs.
- The upstream `Host` header is set to the validated target; the CloudFront
  origin request policy forwards everything **except** the viewer Host header.

## 3. Perimeter — AWS WAF

Attached to CloudFront (CLOUDFRONT scope, us-east-1):

- `AWSManagedRulesCommonRuleSet` — common web exploits (XSS, LFI, etc.).
- `AWSManagedRulesKnownBadInputsRuleSet` — known malicious payloads.
- `AWSManagedRulesAmazonIpReputationList` — known bad-actor IP ranges.
- **IP rate-based rule** (2000 req / 5 min / IP) — blunts map-scraping bots.

Because DNS is Cloudflare **grey cloud (DNS-only)**, CloudFront and WAF see the
real client IP, so rate limiting and IP reputation are accurate.

## 4. Content Security Policy + security headers

A CloudFront Function (`infra/lib/csp-function.ts`) attaches on every static
response:

- **CSP** (defined in `infra/lib/constants.ts`). The **DATA** hosts
  (`services*.arcgis.com`, etc.) are deliberately **not** in `connect-src` because
  that traffic is proxied to same-origin (`'self'`). The policy does allow the
  external hosts the dual-auth model requires:
  - `js.arcgis.com` — the SDK plus the web-component assets/workers.
  - `cdn.arcgis.com` + `static.arcgis.com` — public sprites/fonts.
  - the basemap endpoints — `basemapstyles-api.arcgis.com`,
    `basemaps-api.arcgis.com`, `basemaps.arcgis.com`, `ibasemaps-api.arcgis.com`,
    `https://*.arcgisonline.com`.
  - `www.arcgis.com` for `img` (portal/basemap thumbnails).

  This broader allow-list is still safe: the protected **data stays same-origin**
  and behind the OAuth proxy, and the newly-allowed hosts are Esri CDNs/basemap
  endpoints reached only with the **referrer-restricted, low-value** API key.
  `'wasm-unsafe-eval'`, `blob:`, and `worker-src 'self' blob:` remain — the minimum
  the ArcGIS Maps SDK needs (WebAssembly + web workers).
- `Strict-Transport-Security` (HSTS, 2 years, preload).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `frame-ancestors 'none'` (clickjacking), `Referrer-Policy`, `Permissions-Policy`,
  `object-src 'none'`, `base-uri 'self'`, and `upgrade-insecure-requests`.

## 5. Private origin (S3 + OAC)

- The static bucket has **Block All Public Access** on, ACLs disabled
  (bucket-owner-enforced), SSE-S3 encryption, and TLS enforced via bucket policy.
- It is reachable **only** through CloudFront via **Origin Access Control**; the
  bucket policy grants read solely to the distribution. The application code
  cannot be fetched or scraped directly from the internet.

## 6. Least-privilege IAM

- **Lambda@Edge role** — read access to exactly one secret; CloudWatch Logs via
  the AWS-managed basic execution policy. Nothing else.
- **GitHub Actions deploy role** — authenticates via **OIDC** (no long-lived
  keys). The trust policy is scoped to the **environment**, not the branch ref:
  the subject must be
  `repo:wagisdev/awsDemo_EsriUC2026_Sec:environment:production`, and the deploy job
  runs in the GitHub `production` Environment. Its permissions are:
  - `sts:AssumeRole` on `cdk-hnb659fds-*` and `ssm:GetParameter` on the
    cdk-bootstrap version parameter — used for `cdk deploy`.
  - Scoped, least-privilege permissions the **asset-upload step** uses directly
    (it runs as the deploy role, not via the CDK exec role):
    `cloudformation:DescribeStacks` on `PormanesEdgeStack`,
    `secretsmanager:GetSecretValue` on `pormanes/arcgis-apikey-*`,
    `s3:ListBucket` + `s3:GetObject`/`PutObject`/`DeleteObject` on the site bucket
    (`pormanesedgestack-sitebucket*`), and `cloudfront:CreateInvalidation`.

  GitHub holds no standing AWS credentials and cannot touch resources outside this
  scoped set.

## 7. ArcGIS-side controls

There are **two** ArcGIS apps, matching the dual-auth split:

- **OAuth app (data).** Uses **client-credentials OAuth 2.0**; the app token is
  short-lived and injected only at the edge. Its Location Platform items are shared
  to the app's account and secured by **HTTP referrer** restrictions (see
  DEPLOYMENT.md for the referrers to add). Even if a token leaked, it would be
  usable only from the configured origin.
- **API-key app (basemaps).** Issues the **referrer-restricted API key** used
  client-side for basemaps/commodity services. It is likewise locked to the
  configured HTTP referrer and has no access to the protected data.

## 8. Secrets handling in this repo

- No real secret values are committed. The CDK creates **both** Secrets Manager
  entries with placeholders; the real values are set out-of-band via the AWS CLI:
  - `pormanes/arcgis-oauth` — `{clientId, clientSecret}`, read by Lambda@Edge only.
  - `pormanes/arcgis-apikey` — `{apiKey}`, read only by the asset-deploy step,
    which writes it into `web/dist/config.json` (served no-cache). No Lambda reads
    it. The key is referrer-restricted and low-value, but it is still sourced from
    Secrets Manager rather than committed to the repo.
- `web/.env.local` (local dev credentials) is git-ignored.

## 9. Logging & monitoring

- **CloudFront access logs** are delivered to a dedicated private S3 bucket
  (`cloudfront/` prefix), with a lifecycle rule expiring them after 90 days.
- **WAF request logs** are delivered to a CloudWatch Logs group
  (`aws-waf-logs-pormanes-cloudfront`), so blocked/sampled requests are
  inspectable and alarmable.
- WAF managed rules and the rate-based rule already emit CloudWatch metrics
  (sampled requests enabled), so dashboards/alarms can be added without code.

## 10. ArcGIS secret rotation (manual, by design)

Rotation is **not automated** because rotating an ArcGIS OAuth *client secret* is
provider-specific: a new secret must be issued in the ArcGIS Location Platform
developer portal, then written to Secrets Manager. A generic AWS rotation Lambda
cannot do the ArcGIS-side step, and a half-working rotation is worse than a
documented manual one. Procedure:

1. In the ArcGIS Location Platform portal, regenerate the app's client secret.
2. Update AWS (value never printed to a shared screen):
   ```bash
   aws secretsmanager put-secret-value --region us-east-1 \
     --secret-id pormanes/arcgis-oauth \
     --secret-string '{"clientId":"<CLIENT_ID>","clientSecret":"<NEW_SECRET>"}'
   ```
3. The edge function picks up the new value on its next cold start / token
   refresh (within the ~2h token window); force it sooner by publishing a new
   Lambda@Edge version (redeploy) if an immediate cutover is required.

The **basemap API key** rotates on a different path (no Lambda involved): issue a
new referrer-restricted key in the ArcGIS portal, update the
`pormanes/arcgis-apikey` secret, then re-run `infra/scripts/deploy-assets.sh` so
the new key is written into `config.json` and served (the file is no-cache, so
clients pick it up immediately).

## Addressed vs. remaining

**Addressed in this repo:**
- CloudFront + WAF logging (§9).
- WAF rate limit is tunable via `-c wafRateLimit=<n>` without code changes.
- An **optional scoped** CloudFormation execution policy
  (`infra/bootstrap/cfn-exec-policy.json`, enabled with `HARDENED=true` in the
  bootstrap script) replaces the default `AdministratorAccess` on the CDK
  execution role. Validate in a non-prod account before production use.

**Remaining / operational decisions:**
- **The basemap API key is visible in the browser by design** (dual-auth, ADR-0009).
  Residual risk is accepted and mitigated by the **HTTP-referrer restriction** on
  its ArcGIS app plus it being a **low-value commodity-basemap key** — it grants no
  access to the protected data, which stays behind the OAuth proxy. The high-value
  OAuth client secret is never exposed.
- Secret rotation is a documented manual procedure (§10).
- WAF rule tuning should still be revisited against real traffic; the rate limit
  default (2000 / 5 min / IP) is a starting point.
- The default (non-hardened) bootstrap still uses `AdministratorAccess` on the
  CDK execution role; the GitHub principal remains least-privilege regardless.
- Consider enabling Secrets Manager and S3 access logging alarms, and a WAF
  logging metric filter, as part of production monitoring.
- Full accessibility (WCAG) conformance requires manual testing with assistive
  technologies and expert review; not claimed here.
