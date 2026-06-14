import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import {
  DefaultsConfigSchema,
  ZipConfigSchema,
  type DefaultsConfig,
  type ZipConfig,
} from "./schema.ts";

const REGISTRY_DIR = join(import.meta.dir, "..", "registry");

export function loadDefaults(): DefaultsConfig {
  const raw = readFileSync(join(REGISTRY_DIR, "_defaults.yaml"), "utf-8");
  const parsed = yaml.load(raw);
  return DefaultsConfigSchema.parse(parsed);
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
  const zipData = yaml.load(zipRaw) as Record<string, unknown>;

  const state = zipData["state"] as string | undefined;

  // Merge sources: national from defaults, state from state_sources[state], local from zip
  const stateSources = state ? (defaults.state_sources[state] ?? []) : [];
  const localSources =
    (zipData["sources"] as { local?: unknown[] } | undefined)?.local ?? [];

  const mergedSources = {
    national: defaults.sources.national,
    state: stateSources,
    local: localSources,
  };

  const merged = {
    ...zipData,
    categories: defaults.categories,
    sources: mergedSources,
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
