import type { Plugin, Connect } from "vite";
import { loadEnv } from "vite";
import { IncomingMessage, ServerResponse } from "node:http";

/**
 * Local-dev mirror of the production Lambda@Edge "token injector".
 *
 * In production the `/arcgis-proxy/*` path is served by CloudFront + Lambda@Edge,
 * which reattaches the ArcGIS token and forwards to the real Esri host. This Vite
 * middleware reproduces that contract locally so the browser never sees a token
 * during `npm run dev`.
 *
 * Credentials are read from env (never committed):
 *   ARCGIS_CLIENT_ID / ARCGIS_CLIENT_SECRET   (see web/.env.local.example)
 *
 * Incoming shape (urlUtils.addProxyRule format):
 *   /arcgis-proxy/?<full-target-url>
 * Forwarded to:  <full-target-url>&token=<token>
 */

const PROXY_PREFIX = "/arcgis-proxy";
const TOKEN_URL = "https://www.arcgis.com/sharing/rest/oauth2/token";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
// Referer the token is bound to (must be a registered referrer on the app).
// The Vite dev server serves on localhost:5173 by default.
const DEV_REFERER = "http://localhost:5173";

interface Cached {
  token: string;
  expiresAt: number;
}

let cached: Cached | null = null;
let inflight: Promise<Cached> | null = null;

async function fetchToken(): Promise<Cached> {
  const clientId = process.env.ARCGIS_CLIENT_ID;
  const clientSecret = process.env.ARCGIS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing ARCGIS_CLIENT_ID / ARCGIS_CLIENT_SECRET. Copy web/.env.local.example to web/.env.local.",
    );
  }
  const body = new URLSearchParams({
    f: "json",
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    expiration: "120",
    referer: DEV_REFERER,
  });
  const requestedAt = Date.now();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (data.error || !data.access_token) {
    throw new Error(`ArcGIS token request failed: ${data.error?.message ?? "unknown"}`);
  }
  return {
    token: data.access_token,
    expiresAt: requestedAt + (data.expires_in ?? 7200) * 1000,
  };
}

async function getToken(): Promise<string> {
  if (cached && Date.now() + REFRESH_BUFFER_MS < cached.expiresAt) {
    return cached.token;
  }
  if (inflight) return (await inflight).token;
  inflight = fetchToken();
  try {
    cached = await inflight;
    return cached.token;
  } finally {
    inflight = null;
  }
}

function proxyHandler(): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = req.url ?? "";
    if (!url.startsWith(PROXY_PREFIX)) return next();

    void (async () => {
      try {
        // Everything after the first "?" is the full target URL.
        const qIndex = url.indexOf("?");
        const rawTarget = qIndex === -1 ? "" : url.slice(qIndex + 1);
        if (!rawTarget) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "missing proxy target" }));
          return;
        }
        const targetStr = /^https?:\/\//i.test(rawTarget)
          ? rawTarget
          : decodeURIComponent(rawTarget);
        const target = new URL(targetStr);

        const token = await getToken();
        target.searchParams.set("token", token);

        const upstream = await fetch(target.toString(), {
          method: req.method,
          // Match the referer the token was minted with.
          headers: { accept: "*/*", referer: DEV_REFERER },
        });

        res.statusCode = upstream.status;
        upstream.headers.forEach((value, key) => {
          // Strip hop-by-hop / CORS headers; same-origin in the browser anyway.
          if (["content-encoding", "transfer-encoding", "connection"].includes(key)) return;
          res.setHeader(key, value);
        });
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.end(buf);
      } catch (err) {
        res.statusCode = 502;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    })();
  };
}

export function arcgisProxyDevPlugin(): Plugin {
  return {
    name: "arcgis-proxy-dev",
    apply: "serve",
    config(_config, { mode }) {
      // Load ALL env vars (empty prefix) from .env files into process.env so the
      // server-side middleware can read the non-VITE_ ArcGIS credentials.
      const env = loadEnv(mode, process.cwd(), "");
      if (env.ARCGIS_CLIENT_ID) process.env.ARCGIS_CLIENT_ID = env.ARCGIS_CLIENT_ID;
      if (env.ARCGIS_CLIENT_SECRET) process.env.ARCGIS_CLIENT_SECRET = env.ARCGIS_CLIENT_SECRET;
    },
    configureServer(server) {
      server.middlewares.use(proxyHandler());
    },
    configurePreviewServer(server) {
      server.middlewares.use(proxyHandler());
    },
  };
}
