# Architecture Decision Records

Short records of the significant decisions made while building the Pormanes.NET
map viewer. Each captures the context, the decision, and its consequences.

| ADR | Decision |
|-----|----------|
| [0001](0001-tech-stack.md) | React + Vite + TypeScript + CDK, npm workspaces |
| [0002](0002-region-consolidation.md) | Consolidate CloudFront-coupled resources (incl. origin bucket) in us-east-1 |
| [0003](0003-feature-layers.md) | Render all four operational layers as Feature Layers |
| [0004](0004-token-proxy.md) | Hide the ArcGIS token behind a Lambda@Edge proxy |
| [0005](0005-living-atlas-query.md) | Restrict Add Data to Living Atlas via `groupdesignations:livingatlas` |
| [0006](0006-share-url-state.md) | Encode shareable views in the URL (no backend) |
| [0007](0007-dev-caching-disabled.md) | Disable CloudFront caching during development |
| [0008](0008-asset-upload-s3-sync.md) | Upload web assets with `aws s3 sync`, not BucketDeployment |
| [0009](0009-dual-auth.md) | Dual-auth: referrer-restricted API key for basemaps, OAuth proxy for data |
| [0010](0010-map-components.md) | Migrate deprecated JS-API widgets to `@arcgis/map-components` web components |
