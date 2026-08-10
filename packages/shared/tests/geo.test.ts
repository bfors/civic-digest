import { test, expect, describe } from "bun:test";
import { Database } from "bun:sqlite";
import {
  censusGeocodeUrl,
  extractGeoids,
  mapGeoidsToDistricts,
  resolveFederalState,
} from "@civic/shared/geo";

// Fixture mirrors a real Census `geographies` response (Annapolis, MD): the
// layer keys are vintage-stamped and the lower district carries a letter.
const CENSUS_MATCH = {
  result: {
    addressMatches: [
      {
        matchedAddress: "100 STATE CIR, ANNAPOLIS, MD, 21401",
        geographies: {
          "119th Congressional Districts": [
            { GEOID: "2403", NAME: "Congressional District 3" },
          ],
          "2024 State Legislative Districts - Upper": [
            { GEOID: "24030", NAME: "State Senate District 30" },
          ],
          "2024 State Legislative Districts - Lower": [
            { GEOID: "2430A", NAME: "State Legislative Subdistrict 30A" },
          ],
          Counties: [{ GEOID: "24003", NAME: "Anne Arundel County" }],
        },
      },
    ],
  },
};
const CENSUS_NO_MATCH = { result: { addressMatches: [] } };

function fakeFetch(json: unknown, ok = true): typeof fetch {
  return (async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => json,
  })) as unknown as typeof fetch;
}

function fixtureDb(): Database {
  const db = new Database(":memory:");
  db.exec(
    `CREATE TABLE district (id TEXT PRIMARY KEY, level TEXT, name TEXT, census_geoid TEXT UNIQUE);`
  );
  const ins = db.query(
    "INSERT INTO district (id, level, name, census_geoid) VALUES (?,?,?,?)"
  );
  ins.run("md-03", "national", "MD CD-03", "2403");
  ins.run("md-sd-30", "state", "MD Senate 30", "24030");
  // Deliberately no district for the lower subdistrict 2430A -> unmapped path.
  return db;
}

describe("censusGeocodeUrl", () => {
  test("targets the current benchmark/vintage and encodes the address", () => {
    const url = censusGeocodeUrl("100 State Circle, Annapolis, MD 21401");
    expect(url).toContain("/geocoder/geographies/onelineaddress?");
    expect(url).toContain("benchmark=Public_AR_Current");
    expect(url).toContain("vintage=Current_Current");
    expect(url).toContain("format=json");
    expect(url).toContain("address=100+State+Circle");
  });
});

describe("extractGeoids", () => {
  test("pulls fed + state upper/lower by pattern, ignoring other layers", () => {
    const r = extractGeoids(CENSUS_MATCH);
    expect(r.matched).toBe(true);
    expect(r.matchedAddress).toContain("ANNAPOLIS");
    expect(r.geoids).toEqual({
      us_house: "2403",
      state_upper: "24030",
      state_lower: "2430A",
    });
  });

  test("reports matched=false when the geocoder finds nothing", () => {
    const r = extractGeoids(CENSUS_NO_MATCH);
    expect(r.matched).toBe(false);
    expect(r.geoids).toEqual({});
  });
});

describe("mapGeoidsToDistricts", () => {
  test("maps known GEOIDs to district ids and collects the unmapped", () => {
    const db = fixtureDb();
    const { districtIds, unmapped } = mapGeoidsToDistricts(db, {
      us_house: "2403",
      state_upper: "24030",
      state_lower: "2430A",
    });
    expect(districtIds).toEqual({ us_house: "md-03", state_upper: "md-sd-30" });
    expect(unmapped).toEqual([{ layer: "state_lower", geoid: "2430A" }]);
  });
});

describe("resolveFederalState", () => {
  test("composes geocode + mapping with injected fetch and db", async () => {
    const r = await resolveFederalState("100 State Circle, Annapolis, MD", {
      db: fixtureDb(),
      fetchImpl: fakeFetch(CENSUS_MATCH),
    });
    expect(r.matched).toBe(true);
    expect(r.districtIds).toEqual({ us_house: "md-03", state_upper: "md-sd-30" });
    expect(r.unmapped).toEqual([{ layer: "state_lower", geoid: "2430A" }]);
  });

  test("returns an empty, matched=false result for an unmatched address", async () => {
    const r = await resolveFederalState("nowhere", {
      db: fixtureDb(),
      fetchImpl: fakeFetch(CENSUS_NO_MATCH),
    });
    expect(r.matched).toBe(false);
    expect(r.districtIds).toEqual({});
  });

  test("throws on a persistent geocoder HTTP error", async () => {
    await expect(
      resolveFederalState("x", {
        db: fixtureDb(),
        fetchImpl: fakeFetch({}, false),
        retries: 1,
      })
    ).rejects.toThrow(/HTTP 500/);
  });

  test("retries past a transient 5xx and then succeeds", async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 502, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => CENSUS_MATCH };
    }) as unknown as typeof fetch;

    const r = await resolveFederalState("100 State Circle, Annapolis, MD", {
      db: fixtureDb(),
      fetchImpl: flaky,
      retries: 3,
    });
    expect(calls).toBe(2);
    expect(r.matched).toBe(true);
    expect(r.districtIds).toEqual({ us_house: "md-03", state_upper: "md-sd-30" });
  });
});
