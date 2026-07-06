/**
 * Central ArcGIS configuration — DUAL-AUTH model.
 *
 * - API KEY (client-side, referrer-restricted): commodity/public services —
 *   basemaps and their public sprites/fonts. Set as `esriConfig.apiKey`; the
 *   SDK attaches it directly. Injected at build time via VITE_ARCGIS_API_KEY.
 * - OAUTH PROXY (Lambda@Edge): protected + billable data — the Pormanes network
 *   feature services, Living Atlas add-data, and enrichment. Routed through the
 *   same-origin `/arcgis-proxy/` path so the OAuth secret never reaches the
 *   browser and Esri credit usage is metered/controlled server-side.
 *
 * See docs/adr/0009 for the rationale.
 */

/**
 * Resolves the referrer-restricted basemap API key.
 *
 * Source of truth is AWS Secrets Manager: the deploy step reads the secret and
 * publishes it as `/config.json` (served no-cache). The client fetches that at
 * startup. For local dev, a build-time `VITE_ARCGIS_API_KEY` takes precedence
 * so no config file is needed.
 */
export async function resolveArcgisApiKey(): Promise<string> {
  const devKey = import.meta.env.VITE_ARCGIS_API_KEY;
  if (devKey) return devKey;
  try {
    const res = await fetch("/config.json", { cache: "no-store" });
    if (res.ok) {
      const cfg = (await res.json()) as { arcgisApiKey?: string };
      return cfg.arcgisApiKey ?? "";
    }
  } catch {
    /* no config.json (e.g. dev without env) — basemaps just won't authorize */
  }
  return "";
}

/**
 * Proxy URL used with `urlUtils.addProxyRule`. Trailing slash so the produced
 * request (`/arcgis-proxy/?<targetUrl>`) matches the CloudFront `/arcgis-proxy/*`
 * behavior. We use addProxyRule (not request interceptors) because the SDK
 * fetches tiles/features in web workers, where serializable proxy rules apply
 * but interceptor functions do not.
 */
export const PROXY_URL = "/arcgis-proxy/";

/**
 * DATA hosts routed through the OAuth proxy. Feature/data + billable analysis
 * only. Basemap hosts (basemapstyles-api / basemaps-api / basemaps / cdn /
 * static .arcgis.com) are intentionally NOT here — they use the API key and are
 * fetched directly (allowed in CSP). Living Atlas layers live on any
 * services{N}.arcgis.com, so we cover a broad range.
 */
export const PROXIED_HOSTS = [
  "www.arcgis.com",
  "services.arcgis.com",
  ...Array.from({ length: 20 }, (_, i) => `services${i + 1}.arcgis.com`),
  "tiles.arcgis.com",
  "geoenrich.arcgis.com",
  "geocode-api.arcgis.com",
  "route-api.arcgis.com",
] as const;

/** Full https origins for the proxied hosts (addProxyRule prefixes + token servers). */
export const PROXIED_ORIGINS = PROXIED_HOSTS.map((h) => `https://${h}`);

/** Feature service host that serves the Pormanes network data. */
const FEATURE_HOST = "services.arcgis.com";

/**
 * The two hosted services that make up the Pormanes network plan.
 * NOTE: the org id segment of the service URL is resolved at runtime via the
 * item id; see `resolveServiceUrls`. These constants capture item + layer ids.
 */
export const NETWORK_INFRASTRUCTURE_ITEM_ID =
  "dc8dd34b634b427b9bf6af6ba035cbc2";
export const PLANNED_COVERAGE_ITEM_ID = "e67eeddcfc65445b94ec8848bb27b08e";

export interface OperationalLayerDef {
  /** Stable key used in the URL share state and layer toggles. */
  key: string;
  /** Human title shown in the Layers widget and legend. */
  title: string;
  /** ArcGIS portal item id of the parent feature service. */
  itemId: string;
  /** Sublayer index within the feature service. */
  layerId: number;
  /** Geometry family, used for default widget behavior. */
  geometry: "point" | "polyline" | "polygon";
  /** Whether the layer participates in the current-vs-future filter. */
  supportsLifecycleFilter: boolean;
}

/**
 * Operational layers, in draw order (bottom first). Symbology is authored on the
 * service itself and consumed as-is; the client only adds filtering + widgets.
 */
export const OPERATIONAL_LAYERS: OperationalLayerDef[] = [
  {
    key: "plannedCoverage",
    title: "Planned Coverage",
    itemId: PLANNED_COVERAGE_ITEM_ID,
    layerId: 3,
    geometry: "polygon",
    supportsLifecycleFilter: false,
  },
  {
    key: "backboneRun",
    title: "Backbone Run",
    itemId: NETWORK_INFRASTRUCTURE_ITEM_ID,
    layerId: 2,
    geometry: "polyline",
    supportsLifecycleFilter: true,
  },
  {
    key: "infrastructureNodes",
    title: "Infrastructure Nodes",
    itemId: NETWORK_INFRASTRUCTURE_ITEM_ID,
    layerId: 1,
    geometry: "point",
    supportsLifecycleFilter: true,
  },
  {
    key: "accessPoints",
    title: "Access Points",
    itemId: NETWORK_INFRASTRUCTURE_ITEM_ID,
    layerId: 0,
    geometry: "point",
    supportsLifecycleFilter: true,
  },
];

/** Default basemap — imagery (via the API key). */
export const DEFAULT_BASEMAP = "satellite";

// The basemap switcher uses the SDK's arcgis-basemap-gallery, which sources its
// list from the portal's basemap group — so no hardcoded basemap list is needed.

/** Portal used by the SDK for item lookups (also proxied). */
export const PORTAL_URL = "https://www.arcgis.com";

/**
 * Rough fallback extent over Almagro Island, Western Samar (WGS84).
 * The map auto-fits to the live data extent on load; this is only used if the
 * layers fail to report an extent.
 */
export const ALMAGRO_FALLBACK_EXTENT = {
  xmin: 124.44,
  ymin: 11.9,
  xmax: 124.66,
  ymax: 12.12,
  spatialReference: { wkid: 4326 },
} as const;

export { FEATURE_HOST };
