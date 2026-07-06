import "@arcgis/map-components/components/arcgis-basemap-gallery";
import { useMapContext } from "../map/MapContext";
import { EsriWidgetHost, mountArcgisComponent } from "./EsriWidgetHost";

/**
 * Basemap switcher (stable `arcgis-basemap-gallery` web component). Renders
 * thumbnail previews in a responsive grid and is bound to our MapView via the
 * `view` property. Basemaps load with the client API key (dual-auth), so no
 * proxy is involved.
 */
export function BasemapWidget() {
  const { view } = useMapContext();
  return (
    <EsriWidgetHost
      className="esri-host"
      create={(container) =>
        mountArcgisComponent(container, "arcgis-basemap-gallery", (el) => {
          el.view = view;
        })
      }
    />
  );
}
