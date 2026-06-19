import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import {
  DefaultsConfigSchema,
  DistrictSchema,
  VotesSnapshotSchema,
  ZipConfigSchema,
  ZipFileSchema,
  type DefaultsConfig,
  type District,
  type DistrictRefs,
  type Level,
  type Official,
  type Vote,
  type ZipConfig,
} from "./schema.ts";

const REGISTRY_DIR = join(import.meta.dir, "..", "registry");

export function loadDefaults(): DefaultsConfig {
  const raw = readFileSync(join(REGISTRY_DIR, "_defaults.yaml"), "utf-8");
  const parsed = yaml.load(raw);
  return DefaultsConfigSchema.parse(parsed);
}

export function loadDistrict(id: string): District {
  const file = join(REGISTRY_DIR, "districts", `${id}.yaml`);
  let raw: string;
  try {
    raw = readFileSync(file, "utf-8");
  } catch {
    throw new Error(
      `District "${id}" not found (expected registry/districts/${id}.yaml)`
    );
  }
  try {
    return DistrictSchema.parse(yaml.load(raw));
  } catch (err) {
    throw new Error(
      `District "${id}" is malformed: ${err instanceof Error ? err.message : err}`
    );
  }
}

// national-level officials render under the "federal" bucket
function bucketFor(level: Level): "local" | "state" | "federal" {
  return level === "national" ? "federal" : level;
}

const VOTES_DIR = join(import.meta.dir, "..", "registry", "votes");

// Load a district's committed votes snapshot, if one exists (optional).
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
      const district = loadDistrict(id);
      votes[bucketFor(district.level)].push(...loadVotes(id));
    }
  }
  return votes;
}

export function loadZipConfig(zip: string): { config: ZipConfig; warnings: string[] } {
  const zipFile = join(REGISTRY_DIR, "zips", `${zip}.yaml`);
  let zipRaw: string;
  try {
    zipRaw = readFileSync(zipFile, "utf-8");
  } catch {
    throw new Error(`No registry entry found for ZIP ${zip}`);
  }

  const defaults = loadDefaults();
  const zipData = ZipFileSchema.parse(yaml.load(zipRaw));

  // Merge sources: national from defaults, state from state_sources[state], local from zip
  const stateSources = defaults.state_sources[zipData.state] ?? [];
  const localSources = zipData.sources?.local ?? [];

  const mergedSources = {
    national: defaults.sources.national,
    state: stateSources,
    local: localSources,
  };

  // Resolve referenced district files into officials grouped by level.
  const districtRefs = zipData.districts ?? {};
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
    zip: zipData.zip,
    place: zipData.place,
    state: zipData.state,
    county: zipData.county,
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
  const zipsDir = join(REGISTRY_DIR, "zips");
  const files = readdirSync(zipsDir);
  return files
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(".yaml", ""));
}
