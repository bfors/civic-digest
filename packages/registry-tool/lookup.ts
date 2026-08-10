#!/usr/bin/env bun
// lookup.ts — resolve a street address to the federal/state districts and the
// officials who represent it, straight from civic.db.
//
//   bun run lookup "9500 Newbridge Dr, Potomac, MD 20854"
//   bun run lookup --json "<address>"
//
// Read-only preview of geo.ts (the resident-facing resolver). Unresolved layers
// are surfaced as research gaps — the GEOIDs to go add to the registry. LOCAL
// districts (council, school/park boards, sheriff) are not resolved yet.
import { openDb } from "@civic/shared/db";
import { resolveFederalState, type Layer } from "@civic/shared/geo";

const LAYER_LABEL: Record<Layer, string> = {
  us_house: "U.S. House",
  state_upper: "State Senate",
  state_lower: "State House (lower)",
};

function officialsFor(db: ReturnType<typeof openDb>, districtId: string) {
  return db
    .query(
      `SELECT office, name, party FROM official
        WHERE district_id = ? AND status = 'verified'
        ORDER BY ordinal`
    )
    .all(districtId) as Array<{ office: string; name: string | null; party: string | null }>;
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const address = argv.filter((a) => a !== "--json").join(" ").trim();
  if (!address) {
    console.error('usage: bun run lookup [--json] "<street address>"');
    process.exit(1);
  }

  const db = openDb(); // read-only
  let resolved;
  try {
    resolved = await resolveFederalState(address, { db });
  } catch (err) {
    console.error(`Census geocoder error: ${(err as Error).message}`);
    console.error("(the geocoder is flaky — try again)");
    process.exit(2);
  }

  if (asJson) {
    const districts = Object.fromEntries(
      (Object.entries(resolved.districtIds) as Array<[Layer, string]>).map(
        ([layer, id]) => [layer, { district_id: id, officials: officialsFor(db, id) }]
      )
    );
    console.log(JSON.stringify({ ...resolved, districts }, null, 2));
    return;
  }

  if (!resolved.matched) {
    console.log(`No Census address match for: ${address}`);
    console.log("Try a more complete address (street, city, state, ZIP).");
    return;
  }

  console.log(`\n  ${resolved.matchedAddress ?? address}\n`);
  const layers: Layer[] = ["us_house", "state_upper", "state_lower"];
  for (const layer of layers) {
    const geoid = resolved.geoids[layer];
    if (!geoid) continue;
    const districtId = resolved.districtIds[layer];
    const label = LAYER_LABEL[layer];
    if (!districtId) {
      console.log(`  ${label.padEnd(20)} GEOID ${geoid}  —  ⚠ not in registry (research gap)`);
      continue;
    }
    const officials = officialsFor(db, districtId);
    console.log(`  ${label.padEnd(20)} ${districtId}  (GEOID ${geoid})`);
    if (officials.length === 0) {
      console.log(`      (no verified officials yet)`);
    }
    for (const o of officials) {
      const who = o.name ?? "unfilled seat";
      const party = o.party ? ` (${o.party})` : "";
      console.log(`      • ${who}${party} — ${o.office}`);
    }
  }

  if (resolved.unmapped.length) {
    console.log(
      `\n  ${resolved.unmapped.length} unmapped layer(s) — add these GEOIDs to the registry:`
    );
    for (const u of resolved.unmapped) {
      console.log(`      ${LAYER_LABEL[u.layer]}: ${u.geoid}`);
    }
  }
  console.log(
    `\n  Note: local districts (council, school/park boards, sheriff) are not resolved yet.\n`
  );
}

await main();
