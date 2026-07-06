import "@arcgis/map-components/components/arcgis-sketch";
import { useMapContext } from "../map/MapContext";
import { EsriWidgetHost, mountArcgisComponent } from "./EsriWidgetHost";

/**
 * Drawing (stable `arcgis-sketch` web component): create/edit point, line,
 * polygon, rectangle and circle graphics on the shared sketch layer. Those
 * graphics feed the Buffer and Data Enrichment widgets as study areas.
 */
export function DrawWidget() {
  const { view, sketchLayer } = useMapContext();
  return (
    <div>
      <EsriWidgetHost
        className="esri-host"
        create={(container) =>
          mountArcgisComponent(container, "arcgis-sketch", (el) => {
            el.view = view;
            el.layer = sketchLayer;
            el.creationMode = "update";
            el.hideSettingsMenu = true;
          })
        }
      />
      <p className="hint" style={{ marginTop: "0.6rem" }}>
        Shapes drawn here can be buffered and enriched from the other tools.
      </p>
    </div>
  );
}
