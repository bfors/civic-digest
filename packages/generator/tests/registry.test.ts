import { describe, test, expect } from "bun:test";
import {
  loadZipConfig,
  loadDistrict,
  loadVotes,
  resolveVotesByLevel,
  availableZips,
} from "../src/registry.ts";
import { ZipConfigSchema } from "@civic/shared/schema";

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
  // 20854's officials are now fully verified real people with real pages, so
  // the digest should carry no verification or seat-unfilled warnings.
  test("verified 20854 data produces no verification or seat-unfilled warnings", () => {
    const { warnings } = loadZipConfig("20854");
    expect(warnings.find((w) => w.includes("needs verification"))).toBeUndefined();
    expect(warnings.find((w) => w.includes("seat unfilled"))).toBeUndefined();
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
    // local: county exec + council district 1
    expect(config.officials.local?.length).toBe(2);
    // state: SD-15 senator + 3 HD-15 delegates
    expect(config.officials.state?.length).toBe(4);
    // federal: MD-08 rep + 2 US senators
    expect(config.officials.federal?.length).toBe(3);
    expect(config.officials.federal?.map((o) => o.name)).toContain("Jamie Raskin");
  });

  test("votes resolve from per-district snapshots, bucketed by level", () => {
    expect(loadVotes("md-08").length).toBe(2);
    expect(loadVotes("does-not-exist")).toEqual([]); // votes are optional
    const { config } = loadZipConfig("20854");
    const votes = resolveVotesByLevel(config.districts ?? {});
    expect(votes.federal.length).toBeGreaterThanOrEqual(4); // Raskin (2) + Senate (2)
    expect(votes.local.length).toBeGreaterThanOrEqual(3); // council upcoming bills
    expect(votes.state.length).toBeGreaterThanOrEqual(1); // Vax Act
    // every vote carries a source link
    for (const v of [...votes.federal, ...votes.local, ...votes.state]) {
      expect(v.source_url).toMatch(/^https?:\/\//);
    }
  });
});

describe("registry — availableZips", () => {
  test("returns 20854", () => {
    const zips = availableZips();
    expect(zips).toContain("20854");
  });
});
