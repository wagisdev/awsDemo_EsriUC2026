import { useState } from "react";
import "@arcgis/map-components/components/arcgis-feature-table";
import { useMapContext } from "../map/MapContext";
import { useAppState } from "../state/appState";
import { EsriWidgetHost, mountArcgisComponent } from "./EsriWidgetHost";
import { Icon } from "./icons";

/**
 * Attribute table for a selected operational layer. Rendered in a bottom dock
 * so it has room; honors the active definitionExpression (filter) via the
 * bound FeatureLayer. Row selection highlights features on the map.
 */
export function TableWidget() {
  const { view, operationalLayers } = useMapContext();
  const { setActiveWidget } = useAppState();

  // Planned Coverage is a backdrop/context polygon, not a tabular dataset — omit
  // it from the attribute table's layer picker.
  const tableLayers = operationalLayers.filter(
    (o) => o.def.key !== "plannedCoverage",
  );

  const [layerKey, setLayerKey] = useState(tableLayers[0]?.def.key ?? "");

  const selected = tableLayers.find((o) => o.def.key === layerKey);

  return (
    <section className="glass-panel table-host" role="dialog" aria-label="Attribute table">
      <div
        className="widget-panel__header"
        style={{ padding: "0.6rem 0.9rem", marginBottom: 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="widget-panel__title">Attribute Table</span>
          <select
            className="control"
            style={{ width: "auto", padding: "0.3rem 0.5rem" }}
            value={layerKey}
            onChange={(e) => setLayerKey(e.target.value)}
            aria-label="Table layer"
          >
            {tableLayers.map((o) => (
              <option key={o.def.key} value={o.def.key}>
                {o.def.title}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => setActiveWidget(null)}
          aria-label="Close attribute table"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      {selected && (
        <EsriWidgetHost
          key={selected.def.key}
          className="esri-host"
          create={(container) =>
            // Selection column + menu are shown by default (hide* flags off).
            mountArcgisComponent(container, "arcgis-feature-table", (el) => {
              el.view = view;
              el.layer = selected.layer;
            })
          }
        />
      )}
    </section>
  );
}
