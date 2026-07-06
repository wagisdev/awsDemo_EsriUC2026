import { useEffect, useState } from "react";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import { useMapContext } from "../map/MapContext";

/**
 * Always-on live coordinate readout (bottom-left). Shows the pointer's
 * latitude/longitude as the cursor moves over the map.
 */
export function CoordinateReadout() {
  const { view } = useMapContext();
  const [coords, setCoords] = useState<string>("Move cursor over map");

  useEffect(() => {
    const handle = view.on("pointer-move", (event) => {
      const point = view.toMap({ x: event.x, y: event.y });
      if (point && point.latitude != null && point.longitude != null) {
        setCoords(
          `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,
        );
      }
    });
    // Also refresh on stationary (e.g. after zoom) so the readout stays sane.
    const scaleHandle = reactiveUtils.watch(
      () => view.scale,
      () => {},
    );
    return () => {
      handle.remove();
      scaleHandle.remove();
    };
  }, [view]);

  return (
    <div className="glass-panel coordinate-readout" aria-live="off">
      <span style={{ color: "var(--text-muted)" }}>Lat, Lon:&nbsp;</span>
      {coords}
    </div>
  );
}
