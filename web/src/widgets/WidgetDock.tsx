import type { ComponentType } from "react";
import { useMapContext } from "../map/MapContext";
import { useAppState, type WidgetId } from "../state/appState";
import { Icon, type IconName } from "./icons";
import { WidgetPanel } from "./WidgetPanel";
import { CoordinateReadout } from "./CoordinateReadout";
import { FilterController } from "./FilterController";
import { LayersWidget } from "./LayersWidget";
import { BasemapWidget } from "./BasemapWidget";
import { FilterWidget } from "./FilterWidget";
import { RulerWidget } from "./RulerWidget";
import { DrawWidget } from "./DrawWidget";
import { CoordinateConversionWidget } from "./CoordinateConversionWidget";
import { BufferWidget } from "./BufferWidget";
import { EnrichWidget } from "./EnrichWidget";
import { TableWidget } from "./TableWidget";
import { AddDataWidget } from "./AddDataWidget";
import { ShareWidget } from "./ShareWidget";

interface WidgetDef {
  id: WidgetId;
  label: string;
  icon: IconName;
  /** Component rendered inside the right-side panel. Omitted for docked widgets. */
  panel?: ComponentType;
}

// Order defines the toolbar layout (top -> bottom).
const WIDGETS: WidgetDef[] = [
  { id: "layers", label: "Layers", icon: "layers", panel: LayersWidget },
  { id: "basemap", label: "Basemap", icon: "basemap", panel: BasemapWidget },
  { id: "filter", label: "Filter", icon: "filter", panel: FilterWidget },
  { id: "table", label: "Attribute Table", icon: "table" }, // docked bottom
  { id: "ruler", label: "Ruler", icon: "ruler", panel: RulerWidget },
  { id: "draw", label: "Drawing", icon: "draw", panel: DrawWidget },
  {
    id: "coordConvert",
    label: "Coordinate Conversion",
    icon: "coordConvert",
    panel: CoordinateConversionWidget,
  },
  { id: "buffer", label: "Buffers", icon: "buffer", panel: BufferWidget },
  { id: "enrich", label: "Data Enrichment", icon: "enrich", panel: EnrichWidget },
  { id: "addData", label: "Add Data", icon: "addData", panel: AddDataWidget },
  { id: "share", label: "Share Map", icon: "share", panel: ShareWidget },
];

/**
 * The floating widget system: an always-on coordinate readout + filter
 * controller, a vertical toolbar, and the active widget's panel (right side)
 * or docked table (bottom).
 */
export function WidgetDock() {
  const { view, homeViewpoint } = useMapContext();
  const { activeWidget, toggleWidget, setActiveWidget } = useAppState();

  const active = WIDGETS.find((w) => w.id === activeWidget);
  const ActivePanel = active?.panel;

  function goHome() {
    view.goTo(homeViewpoint, { animate: true }).catch(() => {});
  }

  return (
    <>
      {/* Always-on */}
      <CoordinateReadout />
      <FilterController />

      {/* Toolbar */}
      <nav className="glass-panel widget-toolbar" aria-label="Map tools">
        {/* Home — resets to the default Planned Coverage framing. */}
        <button
          type="button"
          className="widget-toolbar__btn"
          title="Home (reset view)"
          aria-label="Home (reset view)"
          onClick={goHome}
        >
          <Icon name="home" />
        </button>
        {WIDGETS.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`widget-toolbar__btn${activeWidget === w.id ? " is-active" : ""}`}
            title={w.label}
            aria-label={w.label}
            aria-pressed={activeWidget === w.id}
            onClick={() => toggleWidget(w.id)}
          >
            <Icon name={w.icon} />
          </button>
        ))}
      </nav>

      {/* Right-side panel for standard widgets */}
      {active && ActivePanel && (
        <div className="widget-dock">
          <WidgetPanel
            title={active.label}
            onClose={() => setActiveWidget(null)}
            // The basemap gallery needs a wider panel so its (container-query
            // driven) thumbnail grid renders as 2 columns of cards.
            className={active.id === "basemap" ? "widget-panel--wide" : undefined}
          >
            <ActivePanel />
          </WidgetPanel>
        </div>
      )}

      {/* Docked bottom table */}
      {activeWidget === "table" && <TableWidget />}
    </>
  );
}
