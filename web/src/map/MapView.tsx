import { useEffect, useMemo, useRef, useState } from "react";
import EsriMapView from "@arcgis/core/views/MapView";
import Extent from "@arcgis/core/geometry/Extent";
import type Viewpoint from "@arcgis/core/Viewpoint";
import { installArcgisProxy } from "./arcgisProxy";
import { createMapBundle, type MapBundle, type OperationalLayer } from "./createMap";
import { ALMAGRO_FALLBACK_EXTENT } from "../config/arcgis";
import { MapContext, type MapContextValue } from "./MapContext";
import { WidgetDock } from "../widgets/WidgetDock";
import { readShareState } from "../widgets/share/shareState";
import { applyShareStateToView } from "../widgets/share/applyShareState";

/**
 * Owns the ArcGIS MapView lifecycle: installs the proxy interceptor, builds the
 * map + operational layers, mounts the view, auto-fits to the data extent (or a
 * shared view from the URL), then exposes everything to widgets via context.
 */
export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<EsriMapView | null>(null);
  const [bundle, setBundle] = useState<MapBundle | null>(null);
  const [homeViewpoint, setHomeViewpoint] = useState<Viewpoint | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let disposed = false;
    let mapView: EsriMapView | null = null;

    void (async () => {
      // Configure dual-auth (API key + OAuth proxy rules) BEFORE the map's
      // basemap starts loading.
      await installArcgisProxy();
      if (disposed) return;

      const mapBundle = createMapBundle();
      const { operationalLayers: operational } = mapBundle;
      mapView = new EsriMapView({
        container,
        map: mapBundle.map,
        // A neutral starting center over Almagro Island; refined after load.
        center: [124.55, 12.01],
        zoom: 12,
        constraints: { rotationEnabled: false },
        popup: {
          dockEnabled: true,
          dockOptions: { position: "bottom-right", breakpoint: false },
        },
      });

      // Drop the default on-map zoom (+/-) control; Home lives in our toolbar
      // and zoom stays available via scroll / pinch / double-click.
      mapView.ui.remove("zoom");

      try {
        await mapView.when();
        if (disposed) return;

        // Set the default startup view from the Planned Coverage layer extent.
        // Navigation is NOT locked afterwards — the user is free to pan/zoom out.
        await fitToPlannedCoverage(mapView, operational);
        if (disposed) return;

        // Snapshot the default framing so the Home button can always return to
        // it (captured before any shared-URL view is applied).
        const home = mapView.viewpoint.clone();

        // Restore visible layers / basemap / lifecycle (and center/zoom) from a
        // shared URL, if present.
        const shared = readShareState();
        if (shared) {
          await applyShareStateToView(mapView, operational, shared);
        }
        if (disposed) return;

        setView(mapView);
        setBundle(mapBundle);
        setHomeViewpoint(home);
      } catch (err: unknown) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      disposed = true;
      mapView?.destroy();
    };
  }, []);

  const contextValue: MapContextValue | null = useMemo(() => {
    if (!view || !bundle || !homeViewpoint) return null;
    return {
      view,
      operationalLayers: bundle.operationalLayers,
      sketchLayer: bundle.sketchLayer,
      analysisLayer: bundle.analysisLayer,
      getLayer: (key: string) =>
        bundle.operationalLayers.find((o) => o.def.key === key),
      homeViewpoint,
    };
  }, [view, bundle, homeViewpoint]);

  return (
    <>
      <div ref={containerRef} className="map-view" />
      {!view && !error && (
        <div className="map-loading">
          <div className="map-loading__spinner" />
          Loading network map&hellip;
        </div>
      )}
      {error && (
        <div className="map-loading">
          <div style={{ color: "var(--danger)", maxWidth: 360, textAlign: "center" }}>
            Unable to load the map.
            <br />
            {error}
          </div>
        </div>
      )}
      {contextValue && (
        <MapContext.Provider value={contextValue}>
          <WidgetDock />
        </MapContext.Provider>
      )}
    </>
  );
}

/**
 * Set the DEFAULT startup view from the Planned Coverage layer's extent, then
 * step one zoom level closer so we open a bit tighter on the coverage area.
 * Navigation is intentionally left unconstrained — the user can freely pan and
 * zoom out beyond this initial framing.
 */
async function fitToPlannedCoverage(
  view: EsriMapView,
  operational: OperationalLayer[],
) {
  let extent: Extent | null = null;
  const planned = operational.find((o) => o.def.key === "plannedCoverage");
  try {
    if (planned) {
      await planned.layer.load();
      extent = planned.layer.fullExtent?.clone() ?? null;
    }
  } catch {
    /* fall through to fallback */
  }

  // A little breathing room around the coverage polygons.
  const target = extent ? extent.expand(1.15) : new Extent(ALMAGRO_FALLBACK_EXTENT);

  try {
    // Fit to the coverage extent, then nudge one zoom level closer to centre.
    await view.goTo(target, { animate: false });
    await view.goTo({ zoom: view.zoom + 1 }, { animate: false });
  } catch {
    /* ignore goTo interruptions */
  }
}
