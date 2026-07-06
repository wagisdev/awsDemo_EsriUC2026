# ADR-0006: Encode shareable views in the URL

**Status:** Accepted

## Context

Users need to share their current map view with others. Options range from a
backend short-link service to pure client-side URL encoding.

## Decision

Encode the full view state — center, zoom, basemap, visible layers, and the
lifecycle filter — in the **URL query string**. No backend and no short-link
service.

## Consequences

- Zero additional infrastructure or state to operate or secure.
- Links are self-contained and reproducible; the app restores state on load.
- URLs are longer than a short link, which is acceptable for the demo.
- Encode/decode are pure functions (`web/src/widgets/share/shareState.ts`) and
  unit-tested independently of the ArcGIS runtime.
