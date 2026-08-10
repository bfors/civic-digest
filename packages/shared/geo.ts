// geo.ts — resident-facing address -> district resolution.
//
// Given a street address, resolve the resident's *federal and state* electoral
// districts (US House + state legislature upper/lower) to civic.db district ids,
// so the generator can look up the officials who represent that address.
//
// LOCAL districts (county council, school/park boards, sheriff) are NOT resolved
// here yet — there is no free national address->local-district API, so localities
// are a separate track (per-jurisdiction boundary files + point-in-polygon).
//
// Backing service: the free US Census Bureau Geocoder (no API key). We request
// the current post-redistricting vintage and read the Congressional + State
// Legislative (Upper/Lower) layers, then map each Census GEOID to our district
// id via district.census_geoid.
import type { Database } from "bun:sqlite";
import { openDb } from "./db.ts";

// Current benchmark + vintage return post-2020-redistricting boundaries
// (119th Congress / 2024 state legislative districts).
const GEOCODER =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const BENCHMARK = "Public_AR_Current";
const VINTAGE = "Current_Current";

export type Layer = "us_house" | "state_upper" | "state_lower";

export interface ResolvedDistricts {
  matched: boolean;
  matchedAddress?: string;
  // Raw Census GEOIDs for each layer that the address fell in.
  geoids: Partial<Record<Layer, string>>;
  // Our civic.db district ids (undefined when no district carries that GEOID).
  districtIds: Partial<Record<Layer, string>>;
  // GEOIDs Census returned but no district in civic.db maps to (a research gap).
  unmapped: Array<{ layer: Layer; geoid: string }>;
}

// The Census layer keys are vintage-stamped and change over time
// (e.g. "119th Congressional Districts", "2024 State Legislative Districts -
// Upper"), so match them by pattern rather than exact key.
const LAYER_PATTERNS: Array<{ layer: Layer; re: RegExp }> = [
  { layer: "us_house", re: /congressional district/i },
  { layer: "state_upper", re: /legislative districts?\s*-\s*upper/i },
  { layer: "state_lower", re: /legislative districts?\s*-\s*lower/i },
];

export function censusGeocodeUrl(address: string): string {
  const q = new URLSearchParams({
    address,
    benchmark: BENCHMARK,
    vintage: VINTAGE,
    format: "json",
  });
  return `${GEOCODER}?${q}`;
}

// Pull the federal/state district GEOIDs out of a Census geographies response.
// Returns matched=false when the geocoder found no address match.
export function extractGeoids(censusJson: unknown): {
  matched: boolean;
  matchedAddress?: string;
  geoids: Partial<Record<Layer, string>>;
} {
  const matches = (censusJson as any)?.result?.addressMatches;
  if (!Array.isArray(matches) || matches.length === 0) {
    return { matched: false, geoids: {} };
  }
  const match = matches[0];
  const geographies = match?.geographies ?? {};
  const geoids: Partial<Record<Layer, string>> = {};
  for (const [key, arr] of Object.entries(geographies)) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const hit = LAYER_PATTERNS.find((p) => p.re.test(key));
    const geoid = (arr[0] as any)?.GEOID;
    if (hit && typeof geoid === "string" && geoids[hit.layer] === undefined) {
      geoids[hit.layer] = geoid;
    }
  }
  return {
    matched: true,
    matchedAddress: match?.matchedAddress,
    geoids,
  };
}

// Map Census GEOIDs to our district ids via district.census_geoid.
export function mapGeoidsToDistricts(
  db: Database,
  geoids: Partial<Record<Layer, string>>
): { districtIds: Partial<Record<Layer, string>>; unmapped: Array<{ layer: Layer; geoid: string }> } {
  const stmt = db.query("SELECT id FROM district WHERE census_geoid = ?");
  const districtIds: Partial<Record<Layer, string>> = {};
  const unmapped: Array<{ layer: Layer; geoid: string }> = [];
  for (const [layer, geoid] of Object.entries(geoids) as Array<[Layer, string]>) {
    const row = stmt.get(geoid) as { id: string } | undefined;
    if (row) districtIds[layer] = row.id;
    else unmapped.push({ layer, geoid });
  }
  return { districtIds, unmapped };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GET the geocoder, retrying transient failures. The Census geocoder returns
// 5xx / drops connections often enough that a single attempt fails routinely,
// so retry on 5xx and network errors (not on 4xx, which won't fix themselves).
async function fetchGeocoder(
  doFetch: typeof fetch,
  url: string,
  retries: number,
  signal?: AbortSignal
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(300 * attempt);
    try {
      const res = await doFetch(url, { signal });
      if (res.ok) return res;
      if (res.status < 500) {
        throw new Error(`Census geocoder returned HTTP ${res.status}`);
      }
      lastErr = new Error(`Census geocoder returned HTTP ${res.status}`);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

// Resolve an address to our federal/state district ids. Pure aside from one
// Census HTTP GET; inject `fetchImpl` and `db` in tests to stay offline.
export async function resolveFederalState(
  address: string,
  opts: {
    db?: Database;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    retries?: number;
  } = {}
): Promise<ResolvedDistricts> {
  const doFetch = opts.fetchImpl ?? fetch;
  const db = opts.db ?? openDb();

  const res = await fetchGeocoder(
    doFetch,
    censusGeocodeUrl(address),
    opts.retries ?? 3,
    opts.signal
  );
  const { matched, matchedAddress, geoids } = extractGeoids(await res.json());
  if (!matched) {
    return { matched: false, geoids: {}, districtIds: {}, unmapped: [] };
  }
  const { districtIds, unmapped } = mapGeoidsToDistricts(db, geoids);
  return { matched: true, matchedAddress, geoids, districtIds, unmapped };
}
