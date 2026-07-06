# ADR-0007: Disable CloudFront caching during development

**Status:** Accepted

## Context

During active development we push frequent changes and need them visible
immediately. In production, static content should be cached aggressively for
fast loads. The Esri proxy path must never be cached (accurate metering).

## Decision

- **Static behavior:** caching is controlled by a deploy flag. Default is
  **disabled** (`CACHING_DISABLED`) for fast iteration; set `-c caching=true`
  (or the `ENABLE_CACHING` CI variable) to switch to a **3-day** cache for
  production (a custom `CachePolicy` with `defaultTtl`/`maxTtl` of 3 days and
  `minTtl` 0, so the no-cache `index.html`/`config.json` still revalidate).
- **Esri proxy behavior:** caching is **always disabled** regardless of the flag,
  so every request reaches Esri and is metered.

## Consequences

- Developers see changes without waiting for cache TTLs or manual invalidations.
- Production loads stay fast once caching is enabled.
- The metering guarantee for Esri traffic is preserved in every environment.
- Turning caching on is an explicit, documented one-line change.
