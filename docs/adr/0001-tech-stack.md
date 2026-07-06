# ADR-0001: Technology stack

**Status:** Accepted

## Context

We need a modern map viewer with a distinctive frosted-glass UI, an
infrastructure-as-code deployment, and an all-TypeScript codebase. A reference
site (pormanes.net) already establishes the visual language in React + Vite.

## Decision

- **Frontend:** React 19 + Vite + TypeScript, using the ArcGIS Maps SDK for
  JavaScript (`@arcgis/core`). Matches the reference site's stack and is the
  first-class Esri web SDK.
- **Infrastructure:** AWS CDK in TypeScript.
- **Edge logic:** TypeScript bundled with esbuild for Lambda@Edge.
- **Monorepo:** npm workspaces (`web`, `edge`, `infra`) so one `npm install` and
  shared tooling cover all three, while keeping build/runtime concerns separate.
- Pin to current stable releases (React 19, Vite 8, TS 6, `@arcgis/core` 5,
  aws-cdk-lib 2.x).

## Consequences

- One language across UI, edge, and infra lowers context-switching.
- The ArcGIS SDK is large; the initial JS bundle is sizeable but acceptable for a
  demo, and CloudFront caching (in prod) plus compression mitigate it.
- Workspaces require consistent tsconfig layering, handled via `tsconfig.base.json`.
