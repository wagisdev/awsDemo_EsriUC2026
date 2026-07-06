/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { arcgisProxyDevPlugin } from "./dev/arcgisProxyDevPlugin";

// The production request path (/arcgis-proxy/*) is served by CloudFront + Lambda@Edge,
// which injects the ArcGIS token. In local dev we replicate that behaviour with a
// Vite middleware so the client keeps its "zero tokens in the browser" contract.
export default defineConfig({
  plugins: [react(), arcgisProxyDevPlugin()],
  build: {
    outDir: "dist",
    sourcemap: false,
    // Keep asset paths predictable for the CloudFront /assets/* cache behavior.
    assetsDir: "assets",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
