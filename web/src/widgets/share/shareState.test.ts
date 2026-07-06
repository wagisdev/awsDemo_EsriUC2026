import { describe, it, expect } from "vitest";
import { readShareState, buildShareUrl } from "./shareState";
import type { OperationalLayer } from "../../map/createMap";

describe("readShareState", () => {
  it("returns null when no share params are present", () => {
    expect(readShareState("")).toBeNull();
    expect(readShareState("?foo=bar")).toBeNull();
  });

  it("parses center, zoom, basemap, visible and lifecycle", () => {
    const state = readShareState(
      "?c=124.55,12.01&z=13&b=arcgis/navigation&v=accessPoints,backboneRun&lc=current",
    );
    expect(state).toEqual({
      center: [124.55, 12.01],
      zoom: 13,
      basemap: "arcgis/navigation",
      visible: ["accessPoints", "backboneRun"],
      lifecycle: "current",
    });
  });

  it("treats an empty visible list as 'nothing visible'", () => {
    expect(readShareState("?v=")?.visible).toEqual([]);
  });

  it("ignores an invalid lifecycle value", () => {
    expect(readShareState("?lc=bogus")?.lifecycle).toBeUndefined();
  });
});

describe("buildShareUrl", () => {
  // Minimal fakes matching only the shape buildShareUrl reads.
  function fakeView(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      center: { longitude: 124.5, latitude: 12.0 },
      zoom: 12.4,
      map: { basemap: { id: "arcgis/navigation" } },
      ...overrides,
    } as unknown as Parameters<typeof buildShareUrl>[0];
  }

  const layers = [
    { def: { key: "accessPoints" }, layer: { visible: true } },
    { def: { key: "backboneRun" }, layer: { visible: false } },
  ] as unknown as OperationalLayer[];

  it("encodes the current view into a shareable URL", () => {
    const url = buildShareUrl(fakeView(), layers, "current", "https://demo.gis.dev/");
    const params = new URL(url).searchParams;
    expect(params.get("c")).toBe("124.500000,12.000000");
    expect(params.get("z")).toBe("12.4");
    expect(params.get("b")).toBe("arcgis/navigation");
    expect(params.get("v")).toBe("accessPoints");
    expect(params.get("lc")).toBe("current");
  });

  it("omits the lifecycle param when 'all'", () => {
    const url = buildShareUrl(fakeView(), layers, "all", "https://demo.gis.dev/");
    expect(new URL(url).searchParams.has("lc")).toBe(false);
  });

  it("round-trips through readShareState", () => {
    const url = buildShareUrl(fakeView(), layers, "future", "https://demo.gis.dev/");
    const state = readShareState("?" + url.split("?")[1]);
    expect(state?.center).toEqual([124.5, 12.0]);
    expect(state?.lifecycle).toBe("future");
    expect(state?.visible).toEqual(["accessPoints"]);
  });
});
