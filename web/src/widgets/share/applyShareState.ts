import type EsriMapView from "@arcgis/core/views/MapView";
import Basemap from "@arcgis/core/Basemap";
import type { OperationalLayer } from "../../map/createMap";
import type { ShareState } from "./shareState";

/** Apply a decoded ShareState back onto the live view + layers. */
export async function applyShareStateToView(
  view: EsriMapView,
  operational: OperationalLayer[],
  state: ShareState,
): Promise<void> {
  if (view.map && state.basemap && state.basemap !== view.map.basemap?.id) {
    try {
      view.map.basemap = Basemap.fromId(state.basemap);
    } catch {
      /* keep current basemap on unknown id */
    }
  }

  if (state.visible) {
    const visibleSet = new Set(state.visible);
    for (const o of operational) {
      o.layer.visible = visibleSet.has(o.def.key);
    }
  }

  if (state.center) {
    await view
      .goTo({ center: state.center, zoom: state.zoom ?? view.zoom }, { animate: false })
      .catch(() => {});
  }
}
