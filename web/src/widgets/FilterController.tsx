import { useEffect } from "react";
import { useMapContext } from "../map/MapContext";
import { useAppState } from "../state/appState";
import {
  buildLifecycleWhere,
  buildNameWhere,
  combineWhere,
  fetchStatusValues,
} from "./filter/lifecycle";

/**
 * Headless controller (no UI) that keeps every operational layer's
 * definitionExpression / visibility in sync with the lifecycle + name filters.
 * Always mounted so filters apply even when the Filter panel is closed, and so
 * a shared URL's lifecycle takes effect on load.
 */
export function FilterController() {
  const { operationalLayers } = useMapContext();
  const { lifecycle, nameFilter } = useAppState();

  useEffect(() => {
    let cancelled = false;
    const nameWhere = buildNameWhere(nameFilter);

    (async () => {
      for (const o of operationalLayers) {
        if (o.def.supportsLifecycleFilter) {
          const values = await fetchStatusValues(o.layer).catch(() => []);
          if (cancelled) return;
          o.layer.definitionExpression = combineWhere(
            buildLifecycleWhere(lifecycle, values),
            nameWhere,
          );
        } else if (o.def.key === "plannedCoverage") {
          // Planned coverage is inherently "future"; hide it in current-only view.
          o.layer.visible = lifecycle !== "current";
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lifecycle, nameFilter, operationalLayers]);

  return null;
}
