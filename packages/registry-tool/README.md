# @civic/registry-tool

The **data registry** half of civic-digest. Owns `civic.db` (the committed
SQLite source of truth for representatives and data sources) plus the tooling to
research, store, verify, and validate that data. The generator
(`@civic/generator`) reads this database; it never writes it.

Scope (v1): **officials + data sources** and the zip/district structure they
attach to. Votes and news remain flat snapshot files in the generator package.

## Data model (`migrate/schema.sql`)

| table | what it holds |
|-------|---------------|
| `zip` | a ZIP: place, state, county |
| `district` | a first-class electoral unit (level + name) |
| `zip_district` | ZIP↔district links, grouped by `layer` (county_executive, state_senate, …); `layer_ordinal` preserves order; multiple rows per layer = a straddling ZIP |
| `official` | a seat-holder: office, name (NULL=unfilled), branch, level, party, **office_type**, **importance (1–5)**, inline contact, verification block |
| `official_committee` | committees per official (ordered) |
| `source` | first-class typed/scoped data source: `type` (news_outlet, official_legislative_record, official_website, government_portal, other) × `scope` (national/state/local/district/official) + verification block |
| `category` | the canonical category list |

`branch` is `executive | legislative | board | judicial` (boards and elected
judges are modeled honestly; the finer label lives in `office_type`).

**Verification block** (on `official` and `source`): `status`
(proposed/verified/rejected), `confidence`, `source_url` (provenance),
`verified_at`, `verified_by`, `last_checked`, `last_check_status`
(ok/redirect/broken/unchecked).

Three independent signals: **`status`** is the lifecycle gate — the generator
reads only `verified` rows. **`needs_verification`** is a soft flag on an
otherwise-verified official that still emits the build warning. **`name IS NULL`**
is an unfilled seat. Render colors are presentation, kept as a constant in
`@civic/shared/defaults`, not a table.

## Seeding / rebuilding

`civic.db` is committed (binary, the runtime artifact). To (re)build it from the
committed `seed-data/` YAML — the one-time migration and the disaster-recovery
path:

```bash
bun run seed          # -> civic.db at the repo root
```

The seed is deterministic and idempotent (fixed provenance stamp), so re-running
produces a byte-identical DB.

## CLI

```bash
bun run tool <group> <action> [args]
```

| command | purpose |
|---------|---------|
| `officials list [--district id] [--status s]` | inspect officials |
| `officials add --district .. --office .. --name .. --branch .. --level .. [--office-type ..] [--importance 1-5] [--party ..] [--phone/--email/--website/--twitter ..] [--source-url ..] [--confidence ..] [--committees "a\|b"]` | add one (defaults to `proposed`) |
| `officials update <id> --<field> <value>` | edit fields (use `null` to clear) |
| `officials verify <id> [--by name]` | promote proposed → verified |
| `officials reject <id>` | mark rejected |
| `sources list\|add\|update\|verify\|reject` | same lifecycle for data sources |
| `districts list\|add --id --level [--name]` | manage districts |
| `zip add --zip --place --state [--county]` / `zip link --zip --district --layer [--ordinal]` | manage ZIPs + links |
| `propose --json <file>` | bulk-insert proposed rows (research skill output) |
| `validate [--scope all\|officials\|sources]` | link-check URLs, write `last_check_status` |
| `seed` | rebuild civic.db from seed-data |

The CLI is the **only** writer of `civic.db`.

## Researching new data

Use the Claude Code skill in `.claude/skills/research-district/`. It web-searches
authoritative sources for a district/ZIP — including high-impact local offices
(school board, park/planning board, sheriff, council) — and emits a `propose`
JSON with a `source_url` and `confidence` per row. All rows land as `proposed`.

## Verify / validate process

```
research skill ──propose──▶ proposed ──human reviews source_url──▶ verify ──▶ verified
                                  └──────────────────────────────▶ reject  ──▶ rejected
verified ──validate (HEAD/GET link-check)──▶ last_check_status
              broken on a verified official ──▶ needs_verification=1 (build warning)
```

1. **Propose** — research lands rows as `proposed`; never auto-verified.
2. **Review** — `officials list --status proposed`; inspect each `source_url`.
3. **Promote** — `officials verify <id> --by <reviewer>` (records who/when), or
   `reject`.
4. **Validate** — `validate` probes every official website and source URL,
   recording `last_check_status`. A broken link on a verified official flips
   `needs_verification=1` so the next digest build surfaces it. Run it on demand
   and on a schedule (it can reuse the daily CI cron).

## v1 rollout

1. Seed 20854 from YAML and confirm HTML parity + tests (done by the migration).
2. Research high-impact offices 20854 lacks today (school/park boards, sheriff…).
3. Research new ZIPs/districts; each verified ZIP joins `--all` builds and the
   Pages publish automatically.
