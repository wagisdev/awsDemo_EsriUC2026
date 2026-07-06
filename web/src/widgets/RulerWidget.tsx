import { useRef, useState } from "react";
import "@arcgis/map-components/components/arcgis-distance-measurement-2d";
import "@arcgis/map-components/components/arcgis-area-measurement-2d";
import { useMapContext } from "../map/MapContext";
import { EsriWidgetHost } from "./EsriWidgetHost";

type Tool = "distance" | "area";

/**
 * Ruler: distance + area measurement using the stable, dedicated measurement
 * components (`arcgis-distance-measurement-2d` / `arcgis-area-measurement-2d`).
 * The aggregate `arcgis-measurement` component was avoided because it wraps the
 * deprecated Measurement/DistanceMeasurement2D widgets internally. Switching the
 * segmented control remounts the matching component (each auto-starts a new
 * measurement); Clear resets the current one.
 */
export function RulerWidget() {
  const { view } = useMapContext();
  const elRef = useRef<{ clear: () => Promise<void> } | null>(null);
  const [tool, setTool] = useState<Tool>("distance");

  function clear() {
    void elRef.current?.clear();
  }

  return (
    <div>
      <div className="segmented" style={{ marginBottom: "0.75rem" }}>
        <button
          className={tool === "distance" ? "is-active" : ""}
          onClick={() => setTool("distance")}
        >
          Distance
        </button>
        <button
          className={tool === "area" ? "is-active" : ""}
          onClick={() => setTool("area")}
        >
          Area
        </button>
      </div>
      <EsriWidgetHost
        key={tool}
        className="esri-host"
        create={(container) => {
          if (tool === "distance") {
            const el = document.createElement("arcgis-distance-measurement-2d");
            el.view = view;
            el.unit = "metric";
            container.appendChild(el);
            elRef.current = el;
            return {
              destroy: () => {
                el.remove();
                elRef.current = null;
              },
            };
          }
          const el = document.createElement("arcgis-area-measurement-2d");
          el.view = view;
          el.unit = "metric";
          container.appendChild(el);
          elRef.current = el;
          return {
            destroy: () => {
              el.remove();
              elRef.current = null;
            },
          };
        }}
      />
      <div className="btn-row" style={{ marginTop: "0.75rem" }}>
        <button className="btn btn--ghost" onClick={clear}>
          Clear
        </button>
      </div>
      <p className="hint" style={{ marginTop: "0.6rem" }}>
        Click on the map to place points; double-click to finish.
      </p>
    </div>
  );
}
