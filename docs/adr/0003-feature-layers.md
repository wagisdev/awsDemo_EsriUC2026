# ADR-0003: Render all operational layers as Feature Layers

**Status:** Accepted

## Context

The architecture described a dual-layer render — a pre-rendered Vector Tile Layer
for a baseline "utility grid" plus interactive Feature Layers. The data actually
provided are four hosted **feature services** (Access Points, Infrastructure
Nodes, Backbone Run, Planned Coverage); there is no vector tile layer item.

## Decision

Render all four as **Feature Layers** (Option A). No Vector Tile Layer for now.

## Consequences

- Every layer is interactive: clickable, queryable, filterable, and drives the
  attribute table, filters, buffers, and enrichment.
- The datasets are small (a barangay-scale network), so feature rendering is
  performant without pre-rendered tiles.
- Symbology authored on the services is consumed as-is; the client adds only
  filtering and widgets.
- If the network grows large enough to warrant it, a Vector Tile Layer can be
  published later and slotted in as a static base beneath the feature layers.
