import { createContext, useContext } from "react";
import type MapView from "@arcgis/core/views/MapView";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type Viewpoint from "@arcgis/core/Viewpoint";
import type { OperationalLayer } from "./createMap";

export interface MapContextValue {
  view: MapView;
  operationalLayers: OperationalLayer[];
  /** User sketches (Draw widget). */
  sketchLayer: GraphicsLayer;
  /** Derived geometry: buffers, enrichment study areas, results. */
  analysisLayer: GraphicsLayer;
  /** Look up an operational layer by its config key. */
  getLayer: (key: string) => OperationalLayer | undefined;
  /** Default startup view (Planned Coverage framing) for the Home button. */
  homeViewpoint: Viewpoint;
}

/**
 * Provides the live MapView + operational layers to widget components.
 * Only rendered once the view is ready, so consumers can assume a non-null view.
 */
export const MapContext = createContext<MapContextValue | null>(null);

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) {
    throw new Error("useMapContext must be used within a ready MapContext provider");
  }
  return ctx;
}
