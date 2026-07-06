# ADR-0010: Migrate deprecated JS-API widgets to `@arcgis/map-components`

**Status:** Accepted

## Context

`@arcgis/core` 5.x deprecated the JS-API widget classes the viewer relied on —
`LayerList`, `Legend`, `Sketch`, `Measurement`, `FeatureTable`,
`BasemapGallery`, `CoordinateConversion` — along with the `geometryEngine`
module. Continuing to use them produced deprecation warnings and left the app on
a path Esri intends to remove.

## Decision

Migrate the UI-chrome widgets to the stable **`@arcgis/map-components`** web
components (v5.1.9, matched to `@arcgis/core` 5.1.9), bound to the
imperatively-created `MapView` via each component's `.view` property:

| Deprecated widget | Web component |
|-------------------|---------------|
| `LayerList` | `arcgis-layer-list` |
| `BasemapGallery` | `arcgis-basemap-gallery` |
| `CoordinateConversion` | `arcgis-coordinate-conversion` |
| `Measurement` | `arcgis-distance-measurement-2d` + `arcgis-area-measurement-2d` |
| `FeatureTable` | `arcgis-feature-table` |
| `Sketch` | `arcgis-sketch` |

For measurement, use the **dedicated** distance/area components rather than the
aggregate `arcgis-measurement`, which internally still used the deprecated
widgets. Replace `geometryEngine` with
`geometry/operators/geodesicBufferOperator` (`load()` then `execute()`). Theme
the components with `calcite-mode-dark` on `<body>` plus retinted `--calcite-*`
tokens (frosted navy/cyan) so they look native to the app.

## Consequences

- No deprecation warnings; the widget stack is future-proofed on Esri's supported
  path.
- Component assets load from the `js.arcgis.com` CDN (the default), which the CSP
  already allows (see ADR-0009 / SECURITY.md §4).
- Components render in **shadow DOM**, so styling is done via calcite tokens
  rather than global CSS overrides.
- The measurement UI is two components instead of one aggregate, but avoids
  pulling in the deprecated internals.
