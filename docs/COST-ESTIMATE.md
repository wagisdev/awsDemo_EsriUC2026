# Cost Estimate — Small-Community Coverage Viewer (up to 30K users/month)

This document estimates the monthly running cost of the Pormanes.NET map viewer
for a small-community deployment: a public page that people open to **see the
coverage area** for the community, with light interaction. It breaks the cost
down by each piece of infrastructure, split into the two providers:

- **AWS** — hosting, delivery, and the security edge (CloudFront, WAF,
  Lambda@Edge, S3, Secrets Manager).
- **ArcGIS Location Platform** — basemaps and the hosted feature data.

> Rates were checked against Esri and AWS published pricing in **July 2026**.
> Pricing changes over time; confirm against the live pricing pages linked in
> [Sources](#sources) before relying on these figures. Cloud pricing is
> region-dependent; AWS figures assume the Asia Pacific region closest to the
> community (Philippines).

---

## Scenario and assumptions

| Assumption | Value |
|---|---|
| Unique users per month | up to **30,000** |
| Map loads ("sessions") per user | ~1 (open once to view coverage) |
| Basemap style | vector (ArcGIS style) |
| Feature data | one small hosted feature layer (the coverage polygon[s]) |
| DNS | Cloudflare (external, not billed to AWS) |
| TLS certificate | AWS Certificate Manager (free) |

**Measured per-session usage** (from our own testing, used to scale the
estimate):

| Metric | Per session | × 30,000 sessions/month |
|---|---|---|
| Basemap tiles | 43 tiles | 1,290,000 tiles |
| Feature storage (total dataset, static) | 224 KB | ~0.22 MB stored (not per-session) |
| Data-hosting transfer (tiles / files / attachments) | 1.87 MB | ~54.8 GB |
| Feature query bandwidth | 380 KB | ~10.9 GB |

A key architectural detail drives the split: **basemap tiles are fetched
directly from ArcGIS** (referrer-restricted API key, dual-auth model), so those
bytes do **not** traverse CloudFront. Only the app's static assets and the
**proxied feature data** flow through AWS. See
[docs/adr/0009-dual-auth.md](adr/0009-dual-auth.md).

---

## Summary

| Provider | Recommended config | Notes |
|---|---|---|
| **AWS** | **~$14/month** (effective) / ~$38 list | Dominated by AWS WAF; CloudFront usage falls inside the always-free tier at this scale. |
| **ArcGIS Location Platform** | **~$5–10/month** | $0 for basemaps on the tile model (under the 2M free tiles), storage is free, small bandwidth charge. |
| **Total** | **≈ $20–25/month** | For up to 30,000 users viewing the coverage area. |

> ⚠️ **Biggest single lever:** the basemap billing model. The app currently
> enables **basemap sessions**, which at 30K loads would cost **~$116/month**.
> Switching to the **tile model** keeps basemaps **free** at this volume (see
> [Basemaps](#1-basemaps-the-main-decision)). This one change is the difference
> between ~$20 and ~$135 per month.

---

## AWS cost breakdown

At 30K sessions/month the delivery volume is modest: roughly **~157 GB** of
CloudFront egress (app assets + proxied feature data; basemap tiles bypass AWS)
and **~4M** HTTPS requests.

| Service | What drives the cost | Monthly volume | List price | With AWS Free Tier |
|---|---|---|---|---|
| **CloudFront — data transfer** | App assets + proxied feature data out to users | ~157 GB | ~$19 | **$0** (1 TB/mo always-free) |
| **CloudFront — requests** | HTTPS requests | ~4M | ~$5 | **$0** (10M/mo always-free) |
| **CloudFront Functions** | CSP security header on responses | ~3M invocations | ~$0.10 | ~$0.10 (2M free) |
| **Lambda@Edge** | Token-injection proxy for feature data | ~450K invocations | ~$0.40 | ~$0.40 |
| **AWS WAF** | 1 Web ACL + 3 managed rule groups + 1 rate rule + request inspection | ~4M requests | **~$11.30** | **~$11.30** (no free tier) |
| **S3 (origin bucket)** | ~31 MB site + infrequent origin fetches | 0.03 GB | ~$0.05 | **$0** (5 GB free, first 12 mo) |
| **Secrets Manager** | 2 secrets (OAuth client, basemap key) | 2 secrets | ~$0.80 | ~$0.80 (no free tier) |
| **CloudWatch Logs** | Lambda@Edge logs (replicated per region) | low volume | ~$1–2 | ~$1–2 |
| **Route 53 / DNS** | DNS handled by Cloudflare | — | $0 | $0 |
| **ACM (TLS certificate)** | CloudFront certificate | — | $0 | $0 |
| **AWS subtotal** | | | **~$38** | **~$14** |

**Observations**

- **WAF is the dominant AWS cost** and has no free tier — a flat ~$9/month
  (Web ACL + rules) plus ~$0.60 per million inspected requests. It is a
  deliberate security choice; dropping it would take AWS to roughly **$3/month**
  but removes the managed protections and rate limiting. Recommended: keep it.
- **CloudFront is effectively free at this scale.** The always-free tier
  (1 TB egress + 10M requests per month) comfortably covers 30K users. The
  "list price" column shows what it would cost without that tier.
- Everything else (S3, Lambda@Edge, Secrets Manager, logs) is a few dollars
  combined.

---

## ArcGIS Location Platform cost breakdown

| Metric | Monthly volume | Free tier | Billable | Rate | Cost |
|---|---|---|---|---|---|
| **Basemaps — tile model** (recommended) | 1,290,000 tiles | 2,000,000 tiles/mo | 0 | $0.15 / 1,000 | **$0.00** |
| **Basemaps — session model** (currently enabled) | 30,000 sessions | 1,000 sessions/mo | 29,000 | $4 / 1,000 | **$116.00** |
| **Feature storage** | ~0.22 MB avg | 250 MB/day | 0 | $0.0044 / MB-mo | **$0.00** |
| **File storage** (hosted tiles/attachments) | small | 250 MB/day | ~0 | $0.00012 / MB-mo | **~$0.00** |
| **Feature bandwidth** (query responses) | ~10.9 GB | per-GB allowance | ~ | per GB (confirm) | minor |
| **Data/file bandwidth** (tiles/files/attachments) | ~54.8 GB | per-GB allowance | ~ | per GB (confirm) | minor |

**Observations**

### 1. Basemaps — the main decision

ArcGIS offers two basemap billing models:

- **Tile model:** 2,000,000 free tiles per month, then **$0.15 per 1,000**.
  At 43 tiles/session × 30K = 1.29M tiles, you stay **under the free tier → $0**.
- **Session model:** 1,000 free sessions per month, then **$4 per 1,000**.
  At 30K loads that is 29,000 billable sessions → **~$116/month**.

Session pricing is designed for map-heavy apps where users pan/zoom across many
tiles for long periods. This app loads a fixed coverage view (~43 tiles), so the
**tile model is dramatically cheaper** and free at this scale. The app's
`web/src/map/arcgisProxy.ts` currently enables basemap sessions
(`cfg.sessions.basemap`); for a low-interaction viewer, disabling that to use the
tile model is the recommended optimization.

### 2. Feature data is essentially free here

The coverage layer is tiny (224 KB stored), far below the **250 MB/day** free
feature-storage tier, so storage is $0. Location Platform does bill **bandwidth
per GB**; at ~66 GB/month combined this is a small charge (and part of it may
fall under a monthly free allowance). Confirm the current per-GB bandwidth rate
on the pricing page — it is the only ArcGIS line item that isn't $0.

---

## Cost levers (how to keep it cheap)

1. **Use the basemap tile model, not sessions** — the single biggest lever
   (~$116/month → $0 at this volume).
2. **Keep CloudFront caching on in production** (3-day TTL, per
   [ADR-0007](adr/0007-dev-caching-disabled.md)) — fewer origin fetches and
   fewer ArcGIS calls on repeat views.
3. **Right-size WAF** — it's the main AWS cost. Keep it for security, but know
   that the managed rule groups drive most of the flat fee.
4. **Prefer a vector basemap over raster/satellite** — fewer tiles per view, so
   you stay inside the free tile tier with more headroom.

---

## How this scales

The design has generous headroom before costs climb:

- **Basemaps (tile model)** stay free up to ~**46,000 sessions/month**
  (2M tiles ÷ 43 tiles). Beyond that, ~$0.15 per additional 1,000 tiles.
- **CloudFront** stays free up to the 1 TB / 10M-request always-free tier —
  roughly **6× the traffic** of this scenario.
- **WAF and Secrets Manager** are the only fixed monthly costs and don't grow
  with users until request volume is very high.

So a jump from 30K to ~45K users would still land in the **~$20–25/month** range;
the model only becomes materially more expensive well beyond that.

---

## Sources

Figures are derived from the following published pricing (checked July 2026).
Content was summarized and rephrased for licensing compliance; see the originals
for authoritative, current numbers.

- ArcGIS Location Platform pricing — <https://developers.arcgis.com/pricing/>
- Esri, "Introducing basemap sessions" (tile vs. session pricing: 2M free tiles
  then $0.15/1,000; 1,000 free sessions then $4/1,000) —
  <https://www.esri.com/arcgis-blog/products/platform/announcements/basemap-sessions>
- Esri, "ArcGIS Hosted Services: Terms of Use & Pricing Differences" (storage
  rates and 250 MB/day free tiers) —
  <https://www.esri.com/arcgis-blog/products/developers/developers/arcgis-hosted-services-terms-of-use-pricing-differences>
- AWS CloudFront pricing — <https://aws.amazon.com/cloudfront/pricing/>
- AWS WAF pricing — <https://aws.amazon.com/waf/pricing/>
- AWS Lambda@Edge pricing — <https://aws.amazon.com/lambda/pricing/>
- AWS Secrets Manager pricing — <https://aws.amazon.com/secrets-manager/pricing/>
