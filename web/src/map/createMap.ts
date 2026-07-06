import EsriMap from "@arcgis/core/Map";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import type Layer from "@arcgis/core/layers/Layer";
import {
  DEFAULT_BASEMAP,
  OPERATIONAL_LAYERS,
  type OperationalLayerDef,
} from "../config/arcgis";

export interface OperationalLayer {
  def: OperationalLayerDef;
  layer: FeatureLayer;
}

export interface MapBundle {
  map: EsriMap;
  operationalLayers: OperationalLayer[];
  sketchLayer: GraphicsLayer;
  analysisLayer: GraphicsLayer;
}

/**
 * Builds the four Pormanes operational layers (Option A: all Feature Layers).
 * Symbology is authored on the service and consumed as-is (no client renderer).
 * Layers are created from their portal item + sublayer id; the item lookup and
 * all subsequent queries flow through the token-injecting proxy.
 */
export function createOperationalLayers(): OperationalLayer[] {
  return OPERATIONAL_LAYERS.map((def) => {
    const layer = new FeatureLayer({
      portalItem: { id: def.itemId },
      layerId: def.layerId,
      title: def.title,
      outFields: ["*"],
      // Keep popups on for the interactive feature-layer experience.
      popupEnabled: true,
    });
    return { def, layer };
  });
}

/**
 * Creates the full map bundle: navigation basemap, operational layers
 * (bottom-first), and two client-side graphics layers on top for user
 * sketches and derived analysis geometry (buffers / enrichment areas).
 */
export function createMapBundle(): MapBundle {
  const operationalLayers = createOperationalLayers();
  const analysisLayer = new GraphicsLayer({
    title: "Analysis (Buffers & Enrichment)",
    listMode: "hide",
  });
  const sketchLayer = new GraphicsLayer({
    title: "Drawings",
    listMode: "hide",
  });

  const layers: Layer[] = [
    ...operationalLayers.map((o) => o.layer),
    analysisLayer,
    sketchLayer,
  ];

  const map = new EsriMap({
    basemap: DEFAULT_BASEMAP,
    layers,
  });

  return { map, operationalLayers, sketchLayer, analysisLayer };
}
