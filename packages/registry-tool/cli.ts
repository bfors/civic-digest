#!/usr/bin/env bun
// Registry-tool CLI — the only writer of civic.db.
//
//   bun run tool <group> <action> [args]   (via the root "tool" script)
//
// Groups: officials | sources | districts | zip
// Top-level: propose | validate | seed | help
//
// Research lands rows as status='proposed'; a human reviews source_url and runs
// `officials verify <id>` / `sources verify <id>` to promote them. The generator
// reads only status='verified' rows.
import { openDb } from "@civic/shared/db";
import { inferOfficeType, defaultImportance } from "./src/office_type.ts";
import { runValidate } from "./src/validate.ts";
import { ProposeFileSchema } from "./src/propose.ts";
import { seedDatabase } from "./migrate/seed.ts";
import type { Branch, Level } from "@civic/shared/schema";

const TODAY = new Date().toISOString().slice(0, 10);

function parse(argv: string[]): { pos: string[]; flags: Record<string, string> } {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = "true";
      else {
        flags[key] = next;
        i++;
      }
    } else pos.push(a);
  }
  return { pos, flags };
}

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function table(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log("(none)");
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
}

// The CLI is the sole writer — always open a writable connection.
const db = openDb({ write: true });
db.exec("PRAGMA foreign_keys = ON;");

// --- officials -------------------------------------------------------------
function officials(action: string, pos: string[], f: Record<string, string>) {
  switch (action) {
    case "list": {
      const where: string[] = [];
      const params: unknown[] = [];
      if (f.district) {
        where.push("district_id = ?");
        params.push(f.district);
      }
      if (f.status) {
        where.push("status = ?");
        params.push(f.status);
      }
      const sql =
        "SELECT id, district_id, ordinal, office, name, branch, level, office_type, " +
        "importance, status, confidence, needs_verification, contact_website, " +
        "source_url, last_check_status FROM official" +
        (where.length ? " WHERE " + where.join(" AND ") : "") +
        " ORDER BY district_id, ordinal";
      table(db.query(sql).all(...(params as never[])) as Record<string, unknown>[]);
      return;
    }
    case "add": {
      const district_id = f.district ?? die("--district required");
      const office = f.office ?? die("--office required");
      const name = f.name === "null" ? null : f.name ?? die("--name required (or 'null' for unfilled)");
      const branch = (f.branch ?? die("--branch required")) as Branch;
      const level = (f.level ?? die("--level required")) as Level;
      const officeType = (f["office-type"] as Parameters<typeof defaultImportance>[0]) ??
        inferOfficeType(office, branch, level);
      const importance = f.importance ? Number(f.importance) : defaultImportance(officeType, level);
      const ord =
        f.ordinal != null
          ? Number(f.ordinal)
          : ((db.query("SELECT COALESCE(MAX(ordinal)+1,0) n FROM official WHERE district_id=?").get(district_id) as { n: number }).n);
      const info = db
        .query(
          `INSERT INTO official
             (district_id, ordinal, office, name, branch, level, district_label, party,
              office_type, importance, contact_phone, contact_email, contact_website,
              contact_twitter, status, confidence, source_url)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          district_id, ord, office, name, branch, level, f.district_label ?? null, f.party ?? null,
          officeType, importance, f.phone ?? null, f.email ?? null, f.website ?? null,
          f.twitter ?? null, f.status ?? "proposed", f.confidence ? Number(f.confidence) : null,
          f["source-url"] ?? null
        );
      const id = Number(info.lastInsertRowid);
      (f.committees ? f.committees.split("|") : []).forEach((c, i) =>
        db.query("INSERT INTO official_committee (official_id, ordinal, name) VALUES (?,?,?)").run(id, i, c)
      );
      console.log(`added official #${id} (status=${f.status ?? "proposed"})`);
      return;
    }
    case "update": {
      const id = pos[0] ?? die("official id required");
      const map: Record<string, string> = {
        office: "office", name: "name", party: "party", district: "district_label",
        "office-type": "office_type", importance: "importance", phone: "contact_phone",
        email: "contact_email", website: "contact_website", twitter: "contact_twitter",
        "needs-verification": "needs_verification", confidence: "confidence",
        "source-url": "source_url", status: "status",
      };
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [flag, col] of Object.entries(map)) {
        if (f[flag] !== undefined) {
          sets.push(`${col} = ?`);
          params.push(f[flag] === "null" ? null : f[flag]);
        }
      }
      if (!sets.length) die("no fields to update");
      params.push(id);
      const info = db.query(`UPDATE official SET ${sets.join(", ")} WHERE id = ?`).run(...(params as never[]));
      console.log(`updated official #${id} (${info.changes} row)`);
      return;
    }
    case "verify": {
      const id = pos[0] ?? die("official id required");
      db.query("UPDATE official SET status='verified', verified_at=?, verified_by=? WHERE id=?")
        .run(TODAY, f.by ?? "cli", id);
      console.log(`verified official #${id}`);
      return;
    }
    case "reject": {
      const id = pos[0] ?? die("official id required");
      db.query("UPDATE official SET status='rejected' WHERE id=?").run(id);
      console.log(`rejected official #${id}`);
      return;
    }
    default:
      die(`unknown officials action: ${action}`);
  }
}

// --- sources ---------------------------------------------------------------
function sources(action: string, pos: string[], f: Record<string, string>) {
  switch (action) {
    case "list": {
      const where: string[] = [];
      const params: unknown[] = [];
      if (f.scope) { where.push("scope = ?"); params.push(f.scope); }
      if (f.status) { where.push("status = ?"); params.push(f.status); }
      const sql =
        "SELECT id, name, url, type, scope, state, zip, district_id, official_id, " +
        "status, confidence, last_check_status FROM source" +
        (where.length ? " WHERE " + where.join(" AND ") : "") +
        " ORDER BY scope, ordinal";
      table(db.query(sql).all(...(params as never[])) as Record<string, unknown>[]);
      return;
    }
    case "add": {
      const name = f.name ?? die("--name required");
      const url = f.url ?? die("--url required");
      const type = f.type ?? die("--type required");
      const scope = f.scope ?? die("--scope required");
      const assoc = {
        state: scope === "state" ? (f.state ?? die("--state required for scope=state")) : null,
        zip: scope === "local" ? (f.zip ?? die("--zip required for scope=local")) : null,
        district_id: scope === "district" ? (f.district ?? die("--district required for scope=district")) : null,
        official_id: scope === "official" ? Number(f.official ?? die("--official required for scope=official")) : null,
      };
      const ord = f.ordinal != null ? Number(f.ordinal) : 0;
      const info = db
        .query(
          `INSERT INTO source (name, url, type, scope, state, zip, district_id, official_id,
              ordinal, status, confidence, source_url)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(name, url, type, scope, assoc.state, assoc.zip, assoc.district_id, assoc.official_id,
          ord, f.status ?? "proposed", f.confidence ? Number(f.confidence) : null, f["source-url"] ?? null);
      console.log(`added source #${Number(info.lastInsertRowid)} (status=${f.status ?? "proposed"})`);
      return;
    }
    case "update": {
      const id = pos[0] ?? die("source id required");
      const map: Record<string, string> = {
        name: "name", url: "url", type: "type", confidence: "confidence",
        "source-url": "source_url", status: "status",
      };
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [flag, col] of Object.entries(map)) {
        if (f[flag] !== undefined) { sets.push(`${col} = ?`); params.push(f[flag] === "null" ? null : f[flag]); }
      }
      if (!sets.length) die("no fields to update");
      params.push(id);
      const info = db.query(`UPDATE source SET ${sets.join(", ")} WHERE id = ?`).run(...(params as never[]));
      console.log(`updated source #${id} (${info.changes} row)`);
      return;
    }
    case "verify": {
      const id = pos[0] ?? die("source id required");
      db.query("UPDATE source SET status='verified', verified_at=?, verified_by=? WHERE id=?")
        .run(TODAY, f.by ?? "cli", id);
      console.log(`verified source #${id}`);
      return;
    }
    case "reject": {
      const id = pos[0] ?? die("source id required");
      db.query("UPDATE source SET status='rejected' WHERE id=?").run(id);
      console.log(`rejected source #${id}`);
      return;
    }
    default:
      die(`unknown sources action: ${action}`);
  }
}

// --- districts / zip -------------------------------------------------------
function districts(action: string, _pos: string[], f: Record<string, string>) {
  if (action === "list") {
    table(db.query("SELECT id, level, name FROM district ORDER BY id").all() as Record<string, unknown>[]);
  } else if (action === "add") {
    const id = f.id ?? die("--id required");
    const level = f.level ?? die("--level required");
    db.query("INSERT INTO district (id, level, name) VALUES (?,?,?)").run(id, level, f.name ?? null);
    console.log(`added district ${id}`);
  } else die(`unknown districts action: ${action}`);
}

function zip(action: string, _pos: string[], f: Record<string, string>) {
  if (action === "add") {
    const z = f.zip ?? die("--zip required");
    db.query("INSERT INTO zip (zip, place, state, county) VALUES (?,?,?,?)")
      .run(z, f.place ?? die("--place required"), f.state ?? die("--state required"), f.county ?? null);
    console.log(`added zip ${z}`);
  } else if (action === "link") {
    const z = f.zip ?? die("--zip required");
    const d = f.district ?? die("--district required");
    const layer = f.layer ?? die("--layer required");
    const layerOrd =
      f["layer-ordinal"] != null
        ? Number(f["layer-ordinal"])
        : ((db.query("SELECT COALESCE(MAX(layer_ordinal)+1,0) n FROM zip_district WHERE zip=?").get(z) as { n: number }).n);
    db.query("INSERT INTO zip_district (zip, district_id, layer, layer_ordinal, ordinal) VALUES (?,?,?,?,?)")
      .run(z, d, layer, layerOrd, f.ordinal ? Number(f.ordinal) : 0);
    console.log(`linked ${z} -> ${d} (${layer})`);
  } else die(`unknown zip action: ${action}`);
}

// --- propose (bulk insert from research skill) -----------------------------
function propose(f: Record<string, string>) {
  const path = f.json ?? die("--json <file> required");
  const data = ProposeFileSchema.parse(JSON.parse(require("fs").readFileSync(path, "utf-8")));
  let nd = 0, nz = 0, no = 0, ns = 0;
  const tx = db.transaction(() => {
    for (const d of data.districts ?? []) {
      db.query("INSERT OR IGNORE INTO district (id, level, name) VALUES (?,?,?)").run(d.id, d.level, d.name ?? null);
      nd++;
    }
    for (const z of data.zips ?? []) {
      db.query("INSERT OR IGNORE INTO zip (zip, place, state, county) VALUES (?,?,?,?)")
        .run(z.zip, z.place, z.state, z.county ?? null);
      (z.links ?? []).forEach((lk, i) =>
        db.query("INSERT OR IGNORE INTO zip_district (zip, district_id, layer, layer_ordinal, ordinal) VALUES (?,?,?,?,?)")
          .run(z.zip, lk.district_id, lk.layer, i, lk.ordinal ?? 0)
      );
      nz++;
    }
    for (const o of data.officials ?? []) {
      const officeType = o.office_type ?? inferOfficeType(o.office, o.branch, o.level);
      const importance = o.importance ?? defaultImportance(officeType, o.level);
      const ord = (db.query("SELECT COALESCE(MAX(ordinal)+1,0) n FROM official WHERE district_id=?").get(o.district_id) as { n: number }).n;
      const info = db.query(
        `INSERT INTO official (district_id, ordinal, office, name, branch, level, district_label,
           party, office_type, importance, contact_phone, contact_email, contact_website,
           contact_twitter, status, confidence, source_url)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'proposed', ?, ?)`
      ).run(o.district_id, ord, o.office, o.name, o.branch, o.level, o.district ?? null, o.party ?? null,
        officeType, importance, o.contact?.phone ?? null, o.contact?.email ?? null,
        o.contact?.website ?? null, o.contact?.twitter ?? null, o.confidence ?? null, o.source_url);
      const id = Number(info.lastInsertRowid);
      (o.committees ?? []).forEach((c, i) =>
        db.query("INSERT INTO official_committee (official_id, ordinal, name) VALUES (?,?,?)").run(id, i, c));
      no++;
    }
    for (const s of data.sources ?? []) {
      db.query(
        `INSERT INTO source (name, url, type, scope, state, zip, district_id, official_id,
           ordinal, status, confidence, source_url)
         VALUES (?,?,?,?,?,?,?,?,0,'proposed',?,?)`
      ).run(s.name, s.url, s.type, s.scope, s.state ?? null, s.zip ?? null, s.district_id ?? null,
        s.official_id ?? null, s.confidence ?? null, s.source_url ?? null);
      ns++;
    }
  });
  tx();
  console.log(`proposed: ${nd} districts, ${nz} zips, ${no} officials, ${ns} sources`);
  console.log(`review with: bun run tool officials list --status proposed`);
}

async function validate(f: Record<string, string>) {
  const scope = (f.scope ?? "all") as "all" | "officials" | "sources";
  console.log(`link-checking (${scope})…`);
  const s = await runValidate(db, scope, TODAY);
  console.log(`checked ${s.checked}: ok=${s.ok} redirect=${s.redirect} broken=${s.broken}` +
    (s.flagged ? `; flagged ${s.flagged} verified official(s) needs_verification` : ""));
}

const HELP = `civic registry-tool
  officials list|add|update|verify|reject
  sources   list|add|update|verify|reject
  districts list|add
  zip       add|link
  propose   --json <file>
  validate  [--scope all|officials|sources]
  seed      (rebuild civic.db from seed-data YAML)`;

async function main() {
  const [group, action, ...rest] = process.argv.slice(2);
  const { pos, flags } = parse(rest);
  switch (group) {
    case "officials": officials(action ?? "list", pos, flags); break;
    case "sources": sources(action ?? "list", pos, flags); break;
    case "districts": districts(action ?? "list", pos, flags); break;
    case "zip": zip(action ?? "", pos, flags); break;
    case "propose": propose(parse(process.argv.slice(3)).flags); break;
    case "validate": await validate(parse(process.argv.slice(3)).flags); break;
    case "seed": seedDatabase(); break;
    case undefined:
    case "help": console.log(HELP); break;
    default: die(`unknown group: ${group}\n\n${HELP}`);
  }
}

await main();
