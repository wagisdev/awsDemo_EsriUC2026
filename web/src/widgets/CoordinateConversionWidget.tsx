import "@arcgis/map-components/components/arcgis-coordinate-conversion";
import { useMapContext } from "../map/MapContext";
import { EsriWidgetHost, mountArcgisComponent } from "./EsriWidgetHost";

/**
 * Coordinate Conversion (stable `arcgis-coordinate-conversion` web component):
 * convert/inspect the pointer location across formats (DD, DMS, MGRS, UTM,
 * USNG...). Bound to our MapView via the `view` property.
 */
export function CoordinateConversionWidget() {
  const { view } = useMapContext();
  return (
    <EsriWidgetHost
      className="esri-host"
      create={(container) =>
        mountArcgisComponent(container, "arcgis-coordinate-conversion", (el) => {
          el.view = view;
        })
      }
    />
  );
}
