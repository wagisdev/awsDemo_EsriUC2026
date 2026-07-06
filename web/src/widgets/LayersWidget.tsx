import "@arcgis/map-components/components/arcgis-layer-list";
import { useMapContext } from "../map/MapContext";
import { EsriWidgetHost, mountArcgisComponent } from "./EsriWidgetHost";

/**
 * Layer list (stable `arcgis-layer-list` web component):
 * - checkbox visibility toggles + drag-and-drop reordering,
 * - a per-layer **Transparency** panel (opacity slider) added via
 *   `listItemCreatedFunction`,
 * - grouped-layer services (GroupLayer / MapImageLayer) expand to show their
 *   sublayers automatically (the component nests children with an expand
 *   caret); the transparency panel is attached to those child items too.
 */
export function LayersWidget() {
  const { view } = useMapContext();
  return (
    <EsriWidgetHost
      className="esri-host"
      create={(container) =>
        mountArcgisComponent(container, "arcgis-layer-list", (el) => {
          el.view = view;
          el.visibilityAppearance = "checkbox";
          el.dragEnabled = true;
          el.listItemCreatedFunction = (event) => {
            const item = event.item;
            const layer = item.layer;
            // List items like group headers have no opacity-bearing layer.
            if (!layer || typeof layer.opacity !== "number") return;

            const wrap = document.createElement("div");
            wrap.style.cssText =
              "display:flex;align-items:center;gap:.6rem;padding:.4rem .1rem;";

            const slider = document.createElement("input");
            slider.type = "range";
            slider.min = "0";
            slider.max = "100";
            slider.step = "1";
            slider.value = String(Math.round(layer.opacity * 100));
            slider.setAttribute(
              "aria-label",
              `Transparency for ${layer.title ?? "layer"}`,
            );
            slider.style.cssText = "flex:1;accent-color:#00e5ff;cursor:pointer;";

            const pct = document.createElement("span");
            pct.style.cssText =
              "min-width:38px;text-align:right;font-size:.72rem;font-variant-numeric:tabular-nums;color:#94a3b8;";
            pct.textContent = `${slider.value}%`;

            slider.addEventListener("input", () => {
              layer.opacity = Number(slider.value) / 100;
              pct.textContent = `${slider.value}%`;
            });

            wrap.append(slider, pct);
            item.panel = {
              content: wrap,
              title: "Transparency",
              icon: "transparency",
              open: false,
            };
          };
        })
      }
    />
  );
}
