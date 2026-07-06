import { describe, it, expect } from "vitest";
import { parseTargetUrl } from "../src/handler";

describe("parseTargetUrl (addProxyRule format)", () => {
  it("parses a raw target URL from the query string", () => {
    const u = parseTargetUrl(
      "/arcgis-proxy/",
      "https://services.arcgis.com/ORG/arcgis/rest/services/Net/FeatureServer/0/query?f=json&where=1=1",
    );
    expect(u).not.toBeNull();
    expect(u!.host).toBe("services.arcgis.com");
    expect(u!.pathname).toBe(
      "/ORG/arcgis/rest/services/Net/FeatureServer/0/query",
    );
    expect(u!.searchParams.get("f")).toBe("json");
  });

  it("parses a percent-encoded target URL", () => {
    const u = parseTargetUrl(
      "/arcgis-proxy/",
      "https%3A%2F%2Fbasemapstyles-api.arcgis.com%2Farcgis%2Frest%2Fservices%2Fstyles%2Fv2%2Fstyles%2Farcgis%2Fnavigation",
    );
    expect(u).not.toBeNull();
    expect(u!.host).toBe("basemapstyles-api.arcgis.com");
  });

  it("returns null when there is no target", () => {
    expect(parseTargetUrl("/arcgis-proxy/", "")).toBeNull();
  });

  it("returns null for a non-proxy uri", () => {
    expect(parseTargetUrl("/assets/app.js", "https://x.com")).toBeNull();
  });

  it("returns null for a malformed target", () => {
    expect(parseTargetUrl("/arcgis-proxy/", "not-a-url")).toBeNull();
  });
});
