import esriConfig from "@arcgis/core/config";
import esriId from "@arcgis/core/identity/IdentityManager";
import * as urlUtils from "@arcgis/core/core/urlUtils";
import { resolveArcgisApiKey, PROXIED_ORIGINS, PROXY_URL } from "../config/arcgis";

/**
 * Configures the DUAL-AUTH model (see docs/adr/0009):
 *
 * 1. API KEY for commodity/public services (basemaps + their public
 *    sprites/fonts): `esriConfig.apiKey`. The SDK attaches the referrer-
 *    restricted key directly; those hosts are NOT proxied.
 * 2. OAUTH PROXY for protected/billable data (feature services, Living Atlas,
 *    enrichment): `urlUtils.addProxyRule` routes them to the same-origin proxy
 *    where Lambda@Edge injects the real OAuth token. A dummy token is
 *    registered per proxied server so IdentityManager treats them as
 *    authenticated (no login dialog); the proxy overwrites the placeholder.
 *
 * addProxyRule (not request interceptors) is used because the SDK fetches
 * tiles/features in web workers, where serializable proxy rules apply but
 * interceptor callbacks do not.
 */
let installed = false;

export async function installArcgisProxy(): Promise<void> {
  if (installed) return;
  installed = true;

  // 0. Silence ONE known-benign Esri SDK-internal WebGL warning without muting
  //    the rest of the SDK's logging. The GraphShaderModule emits
  //    "Unable to assign attribute accumulatedDistance ... Index already in use"
  //    while rendering certain line symbols. It originates inside the SDK's own
  //    shader graph (nothing in our code triggers it) and has no functional
  //    impact. A scoped interceptor swallows only this message; every other
  //    warning/error still reaches the console in both dev and prod.
  esriConfig.log.interceptors.push((_level, moduleName, ...args) => {
    const isShaderModule = typeof moduleName === "string" && moduleName.includes("GraphShaderModule");
    const isAccumulatedDistance = args.some(
      (arg) => typeof arg === "string" && arg.includes("accumulatedDistance"),
    );
    return isShaderModule && isAccumulatedDistance; // true => handled, not logged
  });

  // 1. API key for basemaps / commodity services (from Secrets Manager via
  //    /config.json, or a local dev env var).
  const apiKey = await resolveArcgisApiKey();
  if (apiKey) {
    esriConfig.apiKey = apiKey;
  }

  // 2. OAuth proxy for protected/billable data hosts only.
  const farFuture = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days

  for (const origin of PROXIED_ORIGINS) {
    urlUtils.addProxyRule({ urlPrefix: origin, proxyUrl: PROXY_URL });
    esriId.registerToken({
      server: origin,
      token: "proxy-handled-token",
      expires: farFuture,
    });
  }

  // Never let a failed proxied request hijack the UI with a login dialog.
  esriId.on("dialog-create", (event) => {
    const dialog = (event as unknown as { dialog?: { destroy?: () => void } }).dialog;
    dialog?.destroy?.();
  });

  // Basemap session billing optimization (SDK best practice) — refreshes a
  // single basemap session rather than tokenizing every tile.
  const cfg = esriConfig as unknown as {
    sessions?: { basemap?: Record<string, unknown> };
  };
  if (!cfg.sessions) cfg.sessions = {};
  cfg.sessions.basemap = {
    enabled: true,
    styleFamily: "arcgis",
    autoRefresh: true,
    duration: 43200, // 12 hours
  };
}
