import { describe, it, expect } from "vitest";
import {
  classifyStatus,
  buildLifecycleWhere,
  buildNameWhere,
  combineWhere,
} from "./lifecycle";

describe("classifyStatus", () => {
  it("classifies deployed-like values as current", () => {
    expect(classifyStatus("Deployed")).toBe("current");
    expect(classifyStatus("Active")).toBe("current");
    expect(classifyStatus("Online")).toBe("current");
  });

  it("classifies planned-like values as future", () => {
    expect(classifyStatus("Planned")).toBe("future");
    expect(classifyStatus("Scheduled")).toBe("future");
    expect(classifyStatus("Under Construction")).toBe("future");
  });

  it("falls back to other for unknown values", () => {
    expect(classifyStatus("Retired")).toBe("other");
  });
});

describe("buildLifecycleWhere", () => {
  const values = ["Deployed", "Planned", "Scheduled"];

  it("returns 1=1 for 'all'", () => {
    expect(buildLifecycleWhere("all", values)).toBe("1=1");
  });

  it("builds a status IN clause from discovered current values", () => {
    expect(buildLifecycleWhere("current", values)).toBe("status IN ('Deployed')");
  });

  it("builds a status IN clause from discovered future values", () => {
    expect(buildLifecycleWhere("future", values)).toBe(
      "status IN ('Planned', 'Scheduled')",
    );
  });

  it("falls back to a date clause when no status values classify", () => {
    expect(buildLifecycleWhere("current", ["Weird", "Unknown"])).toBe(
      "dateDeployed IS NOT NULL",
    );
    expect(buildLifecycleWhere("future", ["Weird"])).toBe("dateDeployed IS NULL");
  });

  it("escapes single quotes in status values", () => {
    // "Deployed 'A'" classifies as current (contains "deploy") and has quotes.
    expect(buildLifecycleWhere("current", ["Deployed 'A'"])).toBe(
      "status IN ('Deployed ''A''')",
    );
  });
});

describe("buildNameWhere", () => {
  it("returns null for empty input", () => {
    expect(buildNameWhere("")).toBeNull();
    expect(buildNameWhere("   ")).toBeNull();
  });

  it("builds a LIKE clause and escapes quotes", () => {
    expect(buildNameWhere("San Isidro")).toBe("name LIKE '%San Isidro%'");
    expect(buildNameWhere("O'Brien")).toBe("name LIKE '%O''Brien%'");
  });
});

describe("combineWhere", () => {
  it("drops nulls and 1=1 and joins with AND", () => {
    expect(combineWhere("status IN ('Deployed')", null, "1=1")).toBe(
      "status IN ('Deployed')",
    );
    expect(combineWhere("a=1", "b=2")).toBe("a=1 AND b=2");
    expect(combineWhere(null, "1=1")).toBe("1=1");
  });
});
