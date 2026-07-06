import { useState } from "react";
import Graphic from "@arcgis/core/Graphic";
import * as geodesicBufferOperator from "@arcgis/core/geometry/operators/geodesicBufferOperator";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import { useMapContext } from "../map/MapContext";

type LinearUnit = "meters" | "kilometers" | "feet" | "miles";

const BUFFER_SYMBOL = new SimpleFillSymbol({
  color: [0, 229, 255, 0.12],
  outline: { color: [0, 229, 255, 0.9], width: 1.5, style: "short-dash" },
});

/**
 * Buffers: build distance rings around the shapes drawn with the Draw tool.
 * Uses the client-side geodesic geometry engine (no billable service call), so
 * it stays fast and free while the buffered areas feed Data Enrichment.
 */
export function BufferWidget() {
  const { sketchLayer, analysisLayer, view } = useMapContext();
  const [distance, setDistance] = useState(500);
  const [unit, setUnit] = useState<LinearUnit>("meters");
  const [message, setMessage] = useState<string | null>(null);

  function clearBuffers() {
    const buffers = analysisLayer.graphics.filter(
      (g) => g.attributes?.kind === "buffer",
    );
    analysisLayer.removeMany(buffers.toArray());
    setMessage(null);
  }

  async function runBuffer() {
    const sources = sketchLayer.graphics.filter((g) => !!g.geometry);
    if (sources.length === 0) {
      setMessage("Draw one or more shapes first (use the Drawing tool).");
      return;
    }
    clearBuffers();

    // Operators load their geometry engine lazily; ensure it's ready first.
    if (!geodesicBufferOperator.isLoaded()) {
      await geodesicBufferOperator.load();
    }

    let count = 0;
    for (const g of sources) {
      const poly = geodesicBufferOperator.execute(g.geometry!, distance, { unit });
      if (poly) {
        analysisLayer.add(
          new Graphic({
            geometry: poly,
            symbol: BUFFER_SYMBOL,
            attributes: { kind: "buffer" },
          }),
        );
        count++;
      }
    }

    const buffers = analysisLayer.graphics
      .filter((g) => g.attributes?.kind === "buffer")
      .toArray();
    if (buffers.length > 0) view.goTo(buffers).catch(() => {});
    setMessage(`${count} buffer${count === 1 ? "" : "s"} created around ${sources.length} shape${sources.length === 1 ? "" : "s"}.`);
  }

  return (
    <div>
      <div className="field">
        <label htmlFor="buffer-distance">Buffer distance</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            id="buffer-distance"
            type="number"
            className="control"
            min={0}
            value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            style={{ flex: 2 }}
          />
          <select
            className="control"
            value={unit}
            onChange={(e) => setUnit(e.target.value as LinearUnit)}
            style={{ flex: 1 }}
            aria-label="Buffer unit"
          >
            <option value="meters">m</option>
            <option value="kilometers">km</option>
            <option value="feet">ft</option>
            <option value="miles">mi</option>
          </select>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={() => void runBuffer()} disabled={distance <= 0}>
          Buffer drawn shapes
        </button>
        <button className="btn btn--ghost" onClick={clearBuffers}>
          Clear
        </button>
      </div>
      {message && (
        <p className="hint" style={{ marginTop: "0.6rem" }}>
          {message}
        </p>
      )}
    </div>
  );
}
