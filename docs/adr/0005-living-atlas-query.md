# ADR-0005: Restrict Add Data to Living Atlas

**Status:** Accepted

## Context

The Add Data tool must add layers from the **Living Atlas only** — no arbitrary
user URLs or other org content. ArcGIS offers a few ways to scope a portal
search to Living Atlas: resolving the portal's `livingAtlasGroupQuery` (from
`portals/self`) then querying that group, or the `groupdesignations:livingatlas`
search filter.

## Decision

Query the portal with **`groupdesignations:livingatlas`** combined with an
addable-type filter (Feature Service, Vector Tile Service, Imagery Layer) and the
user's search term. This mirrors the proven approach in the reference
`amznNetworkPOC` repo.

## Consequences

- Simpler and more robust than resolving a group id from `portals/self` (no extra
  round-trip, no dependency on org-specific group naming).
- Results are guaranteed to be curated, authoritative Living Atlas content.
- Users cannot inject arbitrary services, keeping the map trustworthy and the
  proxy allow-list sufficient.
- Search runs against `www.arcgis.com`, which is proxied like all other ArcGIS
  traffic.
