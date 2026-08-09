// Seed/migration: build civic.db from the committed seed-data YAML.
//
// This is the one-time migration from the old flat registry AND the
// disaster-recovery rebuild path. It is idempotent: it drops and recreates the
// officials/sources/structure tables on every run. Votes and news are NOT here
// — they remain flat snapshot files in the generator package.
//
//   bun run packages/registry-tool/migrate/seed.ts
//   (or)  bun run seed
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { DB_PATH } from "@civic/shared/db";
import {
  DefaultsConfigSchema,
  DistrictSchema,
  ZipFileSchema,
  type Official,
} from "@civic/shared/schema";
import { inferOfficeType, defaultImportance } from "../src/office_type.ts";

const MIGRATE_DIR = import.meta.dir;
const SEED_DATA = join(MIGRATE_DIR, "..", "seed-data");

// Fixed provenance stamp so re-seeding produces a byte-identical DB.
const SEED_DATE = "2026-06-26";
const SEED_BY = "seed-migration";

function contactCols(o: Official) {
  const c = o.contact;
  return {
    phone: c?.phone ?? null,
    email: c?.email ?? null,
    website: c?.website ?? null,
    twitter: c?.twitter ?? null,
  };
}

export function seedDatabase(dbPath: string = DB_PATH) {
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");

  // Fresh slate (idempotent rebuild). Drop in FK-safe order.
  for (const t of [
    "official_committee",
    "source",
    "official",
    "zip_district",
    "zip",
    "district",
    "category",
  ]) {
    db.exec(`DROP TABLE IF EXISTS ${t};`);
  }

  db.exec(readFileSync(join(MIGRATE_DIR, "schema.sql"), "utf-8"));

  const insertDistrict = db.query(
    `INSERT INTO district (id, level, name) VALUES (?, ?, ?)`
  );
  const insertOfficial = db.query(
    `INSERT INTO official
       (district_id, ordinal, office, name, branch, level, district_label, party,
        office_type, importance, needs_verification,
        contact_phone, contact_email, contact_website, contact_twitter,
        status, confidence, source_url, verified_at, verified_by,
        last_checked, last_check_status)
     VALUES
       ($district_id, $ordinal, $office, $name, $branch, $level, $district_label, $party,
        $office_type, $importance, $needs_verification,
        $phone, $email, $website, $twitter,
        'verified', NULL, $source_url, $verified_at, $verified_by,
        NULL, 'unchecked')`
  );
  const insertCommittee = db.query(
    `INSERT INTO official_committee (official_id, ordinal, name) VALUES (?, ?, ?)`
  );
  const insertZip = db.query(
    `INSERT INTO zip (zip, place, state, county) VALUES (?, ?, ?, ?)`
  );
  const insertZipDistrict = db.query(
    `INSERT INTO zip_district (zip, district_id, layer, layer_ordinal, ordinal)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertSource = db.query(
    `INSERT INTO source
       (name, url, type, scope, state, zip, district_id, official_id, ordinal,
        status, confidence, source_url, verified_at, verified_by,
        last_checked, last_check_status)
     VALUES
       ($name, $url, $type, $scope, $state, $zip, $district_id, $official_id, $ordinal,
        'verified', NULL, NULL, $verified_at, $verified_by, NULL, 'unchecked')`
  );
  const insertCategory = db.query(
    `INSERT INTO category (name, ordinal) VALUES (?, ?)`
  );

  const run = db.transaction(() => {
    // ---- defaults: categories + national/state sources ----
    const defaults = DefaultsConfigSchema.parse(
      yaml.load(readFileSync(join(SEED_DATA, "_defaults.yaml"), "utf-8"))
    );
    defaults.categories.forEach((name, i) => insertCategory.run(name, i));
    defaults.sources.national.forEach((s, i) =>
      insertSource.run({
        $name: s.name,
        $url: s.url,
        $type: "news_outlet",
        $scope: "national",
        $state: null,
        $zip: null,
        $district_id: null,
        $official_id: null,
        $ordinal: i,
        $verified_at: SEED_DATE,
        $verified_by: SEED_BY,
      })
    );
    for (const [state, sources] of Object.entries(defaults.state_sources)) {
      sources.forEach((s, i) =>
        insertSource.run({
          $name: s.name,
          $url: s.url,
          $type: "news_outlet",
          $scope: "state",
          $state: state,
          $zip: null,
          $district_id: null,
          $official_id: null,
          $ordinal: i,
          $verified_at: SEED_DATE,
          $verified_by: SEED_BY,
        })
      );
    }

    // ---- districts + officials + committees ----
    const districtFiles = readdirSync(join(SEED_DATA, "districts"))
      .filter((f) => f.endsWith(".yaml"))
      .sort();
    for (const file of districtFiles) {
      const d = DistrictSchema.parse(
        yaml.load(readFileSync(join(SEED_DATA, "districts", file), "utf-8"))
      );
      insertDistrict.run(d.id, d.level, d.name ?? null);
      d.officials.forEach((o, i) => {
        const c = contactCols(o);
        const officeType = inferOfficeType(o.office, o.branch, o.level);
        const info = insertOfficial.run({
          $district_id: d.id,
          $ordinal: i,
          $office: o.office,
          $name: o.name,
          $branch: o.branch,
          $level: o.level,
          $district_label: o.district ?? null,
          $party: o.party ?? null,
          $office_type: officeType,
          $importance: defaultImportance(officeType, o.level),
          $needs_verification: o.needs_verification ? 1 : 0,
          $phone: c.phone,
          $email: c.email,
          $website: c.website,
          $twitter: c.twitter,
          // best-effort provenance: the official's own page
          $source_url: c.website,
          $verified_at: SEED_DATE,
          $verified_by: SEED_BY,
        });
        const officialId = Number(info.lastInsertRowid);
        (o.committees ?? []).forEach((name, ci) =>
          insertCommittee.run(officialId, ci, name)
        );
      });
    }

    // ---- zips + local sources + zip_district links ----
    const zipFiles = readdirSync(join(SEED_DATA, "zips"))
      .filter((f) => f.endsWith(".yaml"))
      .sort();
    for (const file of zipFiles) {
      const z = ZipFileSchema.parse(
        yaml.load(readFileSync(join(SEED_DATA, "zips", file), "utf-8"))
      );
      insertZip.run(z.zip, z.place, z.state, z.county ?? null);

      (z.sources?.local ?? []).forEach((s, i) =>
        insertSource.run({
          $name: s.name,
          $url: s.url,
          $type: "news_outlet",
          $scope: "local",
          $state: null,
          $zip: z.zip,
          $district_id: null,
          $official_id: null,
          $ordinal: i,
          $verified_at: SEED_DATE,
          $verified_by: SEED_BY,
        })
      );

      // Preserve the YAML layer order (Object.entries keeps insertion order)
      // so the resolved official/vote order matches the pre-migration build.
      Object.entries(z.districts ?? {}).forEach(([layer, ids], layerIdx) => {
        ids.forEach((districtId, i) =>
          insertZipDistrict.run(z.zip, districtId, layer, layerIdx, i)
        );
      });
    }
  });

  run();

  const counts = {
    zip: db.query("SELECT count(*) n FROM zip").get() as { n: number },
    district: db.query("SELECT count(*) n FROM district").get() as { n: number },
    official: db.query("SELECT count(*) n FROM official").get() as { n: number },
    source: db.query("SELECT count(*) n FROM source").get() as { n: number },
    category: db.query("SELECT count(*) n FROM category").get() as { n: number },
  };
  db.close();
  console.log(`Seeded ${dbPath}`);
  console.log(
    `  zips=${counts.zip.n} districts=${counts.district.n} ` +
      `officials=${counts.official.n} sources=${counts.source.n} ` +
      `categories=${counts.category.n}`
  );
}

if (import.meta.main) {
  seedDatabase();
}
