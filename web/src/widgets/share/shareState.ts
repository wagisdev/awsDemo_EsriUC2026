import type EsriMapView from "@arcgis/core/views/MapView";
import type { OperationalLayer } from "../../map/createMap";

/**
 * Serializable snapshot of the current view. Encoded entirely in the URL query
 * string — no backend, no short-link service. This powers the Share widget.
 *
 * NOTE: encode/decode here are pure (type-only SDK imports) so they can be unit
 * tested without loading the ArcGIS runtime. Applying state back onto a live
 * view (which needs the Basemap class) lives in ./applyShareState.
 */
export interface ShareState {
  /** Map center as [longitude, latitude]. */
  center?: [number, number];
  /** Zoom level. */
  zoom?: number;
  /** Basemap id (e.g. "arcgis/navigation"). */
  basemap?: string;
  /** Keys of the operational layers that are visible. */
  visible?: string[];
  /** Lifecycle filter: show current, future, or all features. */
  lifecycle?: "all" | "current" | "future";
}

const PARAM = {
  center: "c",
  zoom: "z",
  basemap: "b",
  visible: "v",
  lifecycle: "lc",
} as const;

/** Parse the current URL into a ShareState, or null if no share params exist. */
export function readShareState(search: string = window.location.search): ShareState | null {
  const params = new URLSearchParams(search);
  if (![...Object.values(PARAM)].some((k) => params.has(k))) return null;

  const state: ShareState = {};

  const c = params.get(PARAM.center);
  if (c) {
    const [lon, lat] = c.split(",").map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) state.center = [lon, lat];
  }

  const z = params.get(PARAM.zoom);
  if (z && Number.isFinite(Number(z))) state.zoom = Number(z);

  const b = params.get(PARAM.basemap);
  if (b) state.basemap = b;

  const v = params.get(PARAM.visible);
  if (v !== null) state.visible = v.length ? v.split(",") : [];

  const lc = params.get(PARAM.lifecycle);
  if (lc === "current" || lc === "future" || lc === "all") state.lifecycle = lc;

  return state;
}

/** Build a shareable absolute URL from the current view + layer state. */
export function buildShareUrl(
  view: EsriMapView,
  operational: OperationalLayer[],
  lifecycle: ShareState["lifecycle"],
  base: string = window.location.origin + window.location.pathname,
): string {
  const params = new URLSearchParams();
  const center = view.center;
  if (center && center.longitude != null && center.latitude != null) {
    params.set(PARAM.center, `${center.longitude.toFixed(6)},${center.latitude.toFixed(6)}`);
  }
  params.set(PARAM.zoom, String(Math.round((view.zoom ?? 12) * 100) / 100));
  const basemapId = view.map?.basemap?.id;
  if (basemapId) params.set(PARAM.basemap, basemapId);
  const visible = operational.filter((o) => o.layer.visible).map((o) => o.def.key);
  params.set(PARAM.visible, visible.join(","));
  if (lifecycle && lifecycle !== "all") params.set(PARAM.lifecycle, lifecycle);
  return `${base}?${params.toString()}`;
}
