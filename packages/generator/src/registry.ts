import { readFileSync } from "fs";
import { join } from "path";
import { openDb } from "@civic/shared/db";
import { LEVEL_COLORS } from "@civic/shared/defaults";
import {
  DistrictSchema,
  VotesSnapshotSchema,
  ZipConfigSchema,
  type DefaultsConfig,
  type District,
  type DistrictRefs,
  type Level,
  type Official,
  type Source,
  type Vote,
  type ZipConfig,
} from "@civic/shared/schema";

// ---------------------------------------------------------------------------
// The registry is now civic.db (read-only). Officials, sources, districts and
// ZIPs come from SQLite; votes and news remain flat snapshot files in this
// package. Every exported signature and the {config, warnings[]} contract is
// unchanged, so digest.ts / render_html.ts / build.ts / news.ts are untouched.
// ---------------------------------------------------------------------------

// Row shapes as stored (snake_case columns). Projected to render types below.
interface OfficialDbRow {
  id: number;
  office: string;
  name: string | null;
  branch: string;
  level: Level;
  district_label: string | null;
  party: string | null;
  needs_verification: number;
  contact_phone: string | null;
  contact_email: string | null;
  contact_website: string | null;
  contact_twitter: string | null;
}

function rowToOfficial(row: OfficialDbRow, committees: string[]): Official {
  const contactEntries: Record<string, string> = {};
  if (row.contact_phone) contactEntries.phone = row.contact_phone;
  if (row.contact_email) contactEntries.email = row.contact_email;
  if (row.contact_website) contactEntries.website = row.contact_website;
  if (row.contact_twitter) contactEntries.twitter = row.contact_twitter;

  const official: Official = {
    office: row.office,
    name: row.name,
    branch: row.branch as Official["branch"],
    level: row.level,
    needs_verification: row.needs_verification === 1,
  };
  if (row.district_label) official.district = row.district_label;
  if (row.party) official.party = row.party;
  if (committees.length > 0) official.committees = committees;
  if (Object.keys(contactEntries).length > 0) {
    official.contact = contactEntries as Official["contact"];
  }
  return official;
}

function rowToSource(row: { name: string; url: string }): Source {
  return { name: row.name, url: row.url };
}

// national-level officials render under the "federal" bucket
function bucketFor(level: Level): "local" | "state" | "federal" {
  return level === "national" ? "federal" : level;
}

// Reconstruct DefaultsConfig from the DB (categories + national/state sources)
// plus the render-color constant. Mirrors the old _defaults.yaml shape so
// callers (build.ts render config, tests) are unchanged.
export function loadDefaults(): DefaultsConfig {
  const db = openDb();

  const categories = db
    .query("SELECT name FROM category ORDER BY ordinal")
    .all()
    .map((r) => (r as { name: string }).name);

  const national = db
    .query(
      "SELECT name, url FROM source WHERE scope='national' AND status='verified' ORDER BY ordinal"
    )
    .all()
    .map((r) => rowToSource(r as { name: string; url: string }));

  const stateRows = db
    .query(
      "SELECT state, name, url FROM source WHERE scope='state' AND status='verified' ORDER BY state, ordinal"
    )
    .all() as Array<{ state: string; name: string; url: string }>;
  const state_sources: Record<string, Source[]> = {};
  for (const r of stateRows) {
    (state_sources[r.state] ??= []).push(rowToSource(r));
  }

  return {
    categories,
    sources: { national },
    state_sources,
    render: { level_colors: { ...LEVEL_COLORS } },
  };
}

export function loadDistrict(id: string): District {
  const db = openDb();
  const drow = db
    .query("SELECT id, level, name FROM district WHERE id = ?")
    .get(id) as { id: string; level: Level; name: string | null } | null;
  if (!drow) {
    throw new Error(`District "${id}" not found in registry database`);
  }

  const officialRows = db
    .query(
      `SELECT id, office, name, branch, level, district_label, party,
              needs_verification, contact_phone, contact_email,
              contact_website, contact_twitter
         FROM official
        WHERE district_id = ? AND status = 'verified'
        ORDER BY ordinal`
    )
    .all(id) as OfficialDbRow[];

  const committeeStmt = db.query(
    "SELECT name FROM official_committee WHERE official_id = ? ORDER BY ordinal"
  );

  const officials = officialRows.map((row) => {
    const committees = committeeStmt
      .all(row.id)
      .map((c) => (c as { name: string }).name);
    return rowToOfficial(row, committees);
  });

  return DistrictSchema.parse({
    id: drow.id,
    level: drow.level,
    name: drow.name ?? undefined,
    officials,
  });
}

// Level of a district, used to bucket its votes (lighter than loadDistrict).
function districtLevel(id: string): Level {
  const db = openDb();
  const row = db.query("SELECT level FROM district WHERE id = ?").get(id) as
    | { level: Level }
    | null;
  if (!row) {
    throw new Error(`District "${id}" not found in registry database`);
  }
  return row.level;
}

const VOTES_DIR = join(import.meta.dir, "..", "registry", "votes");

// Load a district's committed votes snapshot, if one exists (optional, flat).
export function loadVotes(districtId: string): Vote[] {
  const file = join(VOTES_DIR, `${districtId}.json`);
  let raw: string;
  try {
    raw = readFileSync(file, "utf-8");
  } catch {
    return []; // votes are optional per district
  }
  return VotesSnapshotSchema.parse(JSON.parse(raw)).votes;
}

// Resolve all referenced districts' votes, bucketed by level for rendering.
export function resolveVotesByLevel(districtRefs: DistrictRefs): {
  local: Vote[];
  state: Vote[];
  federal: Vote[];
} {
  const votes = { local: [] as Vote[], state: [] as Vote[], federal: [] as Vote[] };
  for (const ids of Object.values(districtRefs)) {
    for (const id of ids) {
      votes[bucketFor(districtLevel(id))].push(...loadVotes(id));
    }
  }
  return votes;
}

// Build a ZIP's layer -> [district id] map, preserving the original YAML layer
// order (layer_ordinal) so resolved official/vote order is stable.
function loadDistrictRefs(zip: string): DistrictRefs {
  const db = openDb();
  const rows = db
    .query(
      "SELECT layer, district_id FROM zip_district WHERE zip = ? ORDER BY layer_ordinal, ordinal"
    )
    .all(zip) as Array<{ layer: string; district_id: string }>;
  const refs: DistrictRefs = {};
  for (const r of rows) {
    (refs[r.layer] ??= []).push(r.district_id);
  }
  return refs;
}

export function loadZipConfig(zip: string): { config: ZipConfig; warnings: string[] } {
  const db = openDb();
  const zipRow = db
    .query("SELECT zip, place, state, county FROM zip WHERE zip = ?")
    .get(zip) as
    | { zip: string; place: string; state: string; county: string | null }
    | null;
  if (!zipRow) {
    throw new Error(`No registry entry found for ZIP ${zip}`);
  }

  const defaults = loadDefaults();

  // Merge sources: national from defaults, state from state_sources[state],
  // local from the ZIP's own verified sources.
  const stateSources = defaults.state_sources[zipRow.state] ?? [];
  const localSources = db
    .query(
      "SELECT name, url FROM source WHERE scope='local' AND zip = ? AND status='verified' ORDER BY ordinal"
    )
    .all(zip)
    .map((r) => rowToSource(r as { name: string; url: string }));

  const mergedSources = {
    national: defaults.sources.national,
    state: stateSources,
    local: localSources,
  };

  // Resolve referenced district files into officials grouped by level.
  const districtRefs = loadDistrictRefs(zip);
  const officials: { local: Official[]; state: Official[]; federal: Official[] } = {
    local: [],
    state: [],
    federal: [],
  };
  for (const ids of Object.values(districtRefs)) {
    for (const id of ids) {
      const district = loadDistrict(id);
      officials[bucketFor(district.level)].push(...district.officials);
    }
  }

  const merged = {
    zip: zipRow.zip,
    place: zipRow.place,
    state: zipRow.state,
    county: zipRow.county ?? undefined,
    districts: districtRefs,
    categories: defaults.categories,
    sources: mergedSources,
    officials,
  };

  const result = ZipConfigSchema.parse(merged);

  const warnings: string[] = [];

  // Warn for empty local sources
  if (!result.sources.local || result.sources.local.length === 0) {
    warnings.push(`ZIP ${zip}: no local sources defined`);
  }

  // Check officials for warnings
  const allOfficials = [
    ...(result.officials.local ?? []),
    ...(result.officials.state ?? []),
    ...(result.officials.federal ?? []),
  ];

  if (allOfficials.length === 0) {
    warnings.push(`ZIP ${zip}: no officials defined`);
  }

  for (const official of allOfficials) {
    if (official.needs_verification) {
      warnings.push(`ZIP ${zip}: official "${official.office}" needs verification`);
    }
    if (official.name === null) {
      warnings.push(`ZIP ${zip}: seat unfilled for "${official.office}"`);
    }
  }

  return { config: result, warnings };
}

export function availableZips(): string[] {
  const db = openDb();
  return db
    .query("SELECT zip FROM zip ORDER BY zip")
    .all()
    .map((r) => (r as { zip: string }).zip);
}
