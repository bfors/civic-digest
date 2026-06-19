import { describe, test, expect } from "bun:test";
import { loadZipConfig, loadDistrict, availableZips } from "../src/registry.ts";
import { ZipConfigSchema } from "../src/schema.ts";

describe("registry — 20854 source merging", () => {
  test("merges national sources from defaults", () => {
    const { config } = loadZipConfig("20854");
    expect(config.sources.national.length).toBeGreaterThan(0);
    const names = config.sources.national.map((s) => s.name);
    expect(names).toContain("NPR");
    expect(names).toContain("AP News");
  });

  test("merges state sources from state_sources[MD]", () => {
    const { config } = loadZipConfig("20854");
    expect(config.sources.state).toBeDefined();
    expect(config.sources.state!.length).toBeGreaterThan(0);
    const names = config.sources.state!.map((s) => s.name);
    expect(names).toContain("Maryland Matters");
  });

  test("includes local sources from zip file", () => {
    const { config } = loadZipConfig("20854");
    expect(config.sources.local).toBeDefined();
    expect(config.sources.local!.length).toBeGreaterThan(0);
    const names = config.sources.local!.map((s) => s.name);
    expect(names).toContain("Bethesda Magazine");
  });

  test("categories come from defaults", () => {
    const { config } = loadZipConfig("20854");
    expect(config.categories).toContain("Public Safety");
    expect(config.categories).toContain("Taxes & Budget");
    expect(config.categories.length).toBe(8);
  });
});

describe("registry — error handling", () => {
  test("throws for missing ZIP", () => {
    expect(() => loadZipConfig("99999")).toThrow(/No registry entry found for ZIP 99999/);
  });
});

describe("registry — schema validation", () => {
  test("ZipConfigSchema rejects malformed data", () => {
    const result = ZipConfigSchema.safeParse({
      zip: "00000",
      // missing required fields
    });
    expect(result.success).toBe(false);
  });

  test("ZipConfigSchema rejects invalid level", () => {
    const result = ZipConfigSchema.safeParse({
      zip: "00000",
      place: "Test",
      state: "XX",
      categories: [],
      sources: { national: [] },
      officials: {
        local: [
          {
            office: "Test Office",
            name: "Test Person",
            branch: "executive",
            level: "invalid-level",
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("registry — warnings", () => {
  test("needs_verification official produces warning", () => {
    const { warnings } = loadZipConfig("20854");
    const verifyWarning = warnings.find((w) => w.includes("needs verification"));
    expect(verifyWarning).toBeDefined();
    expect(verifyWarning).toContain("Potomac Community Recreation Center Board");
  });

  test("name:null official produces seat-unfilled warning", () => {
    const { warnings } = loadZipConfig("20854");
    const seatWarning = warnings.find((w) => w.includes("seat unfilled"));
    expect(seatWarning).toBeDefined();
    expect(seatWarning).toContain("Montgomery County Executive");
  });
});

describe("registry — district resolution", () => {
  test("loadDistrict resolves a single-seat district", () => {
    const district = loadDistrict("md-08");
    expect(district.level).toBe("national");
    expect(district.officials.length).toBe(1);
    expect(district.officials[0]?.name).toBe("Jamie Raskin");
  });

  test("a district may hold multiple officials (statewide US Senate)", () => {
    const district = loadDistrict("md-senate");
    expect(district.officials.length).toBe(2);
    const names = district.officials.map((o) => o.name);
    expect(names).toContain("Angela Alsobrooks");
    expect(names).toContain("Chris Van Hollen");
  });

  test("loadDistrict throws for an unknown id", () => {
    expect(() => loadDistrict("does-not-exist")).toThrow(/not found/);
  });

  test("ZIP officials are assembled from referenced districts, bucketed by level", () => {
    const { config } = loadZipConfig("20854");
    // local: county exec + council district 2 + rec board
    expect(config.officials.local?.length).toBe(3);
    // state: SD-16 + HD-16
    expect(config.officials.state?.length).toBe(2);
    // federal: MD-08 rep + 2 US senators
    expect(config.officials.federal?.length).toBe(3);
    expect(config.officials.federal?.map((o) => o.name)).toContain("Jamie Raskin");
  });
});

describe("registry — availableZips", () => {
  test("returns 20854", () => {
    const zips = availableZips();
    expect(zips).toContain("20854");
  });
});
