# Pormanes.NET Map Viewer — AWS + Esri UC 2026 Demo

A secure, single-page map viewer of Pormanes.NET's internet network — currently
deployed and planned build-out — for Brgy. San Isidro, Almagro Island, Western
Samar, Philippines.

The browser holds **no ArcGIS token, secret, or API key**. All ArcGIS traffic is
proxied through the app's own origin, where a Lambda@Edge function attaches a
short-lived token. Credentials stay off the client, Esri metering stays accurate,
and the code/data can't be scraped directly.

## Stack

- **Frontend:** React 19 + Vite + TypeScript, ArcGIS Maps SDK for JavaScript,
  frosted-glass UI matching pormanes.net.
- **Edge:** Lambda@Edge token injector (global cache · 5-min refresh buffer ·
  concurrency promise lock).
- **Infra:** AWS CDK (TypeScript) — CloudFront (2 behaviors), AWS WAF, private
  S3 + Origin Access Control, Secrets Manager, CloudFront Function CSP, ACM.
- **CI/CD:** GitHub Actions with OIDC (no long-lived keys), least-privilege
  deploy role.

## Widgets

Layers · live Coordinates · Ruler · Drawing · Coordinate Conversion · Buffers ·
Data Enrichment · attribute Table · Filter (current vs. planned) · Add Data
(Living Atlas only) · Share (URL state).

## Repository layout

```
web/     React frontend
edge/    Lambda@Edge token injector + shared TokenManager
infra/   AWS CDK stack + bootstrap/OIDC setup
docs/    Design, security, ADRs, diagrams, deployment runbook
```

## Quick start

```bash
npm install

# Local dev (token-free via Vite proxy middleware)
cp web/.env.local.example web/.env.local   # set ARCGIS_CLIENT_ID / SECRET
npm run dev --workspace web                 # http://localhost:5173

# Tests + build
npm test
npm run build
```

Deploying to AWS (bootstrap, OIDC, DNS, ACM, ArcGIS referrers, secret) is covered
step by step in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Documentation

- [docs/DESIGN.md](docs/DESIGN.md) — architecture & how it fits together
- [docs/SECURITY.md](docs/SECURITY.md) — security design
- [docs/diagrams/architecture.md](docs/diagrams/architecture.md) — diagrams
- [docs/adr/](docs/adr/) — architecture decision records
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deploy runbook + manual config values
