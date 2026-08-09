---
name: research-district
description: Research the elected officials and reliable data sources for a district or ZIP and propose them (status=proposed) into civic.db for human review. Use when adding a new ZIP/district to the registry, or filling in high-impact local offices (school board, park/planning board, sheriff, council) that aren't covered yet. Writes only proposed rows — never verified.
---

# Research a district / ZIP for the civic registry

You are populating `civic.db` (the registry-tool package) with **representatives**
and **reliable data sources** for a jurisdiction. Everything you write lands as
`status='proposed'`; a human reviews each row's `source_url` and promotes it with
`officials verify` / `sources verify`. **Never write `verified` rows and never
edit existing verified data.**

## Input
A district id (e.g. `moco-school-board`) or a ZIP (e.g. `20854`), plus optionally
the place/state/county if the ZIP is new.

## What to find

Prioritize **offices with high impact on daily local life**, not just the famous
ones. For a typical ZIP that includes:

- County/city **executive** and **council** members for the relevant district
- **School board** members (board branch, office_type `school_board`)
- **Park / planning board** members (board branch, office_type `park_board`)
- **Sheriff** / elected law-enforcement (office_type `law_enforcement`)
- State senator + delegates/representatives for the district
- US House representative + US senators
- Other elected boards with budget/land-use authority (e.g. soil conservation,
  register of wills, clerk of court) when they materially affect residents

For **data sources**, find the authoritative, durable URLs the generator should
trust per jurisdiction:

- `official_legislative_record` — the body's roll-call / bill site (e.g. a state
  legislature member page, congress.gov, a county council legislation portal)
- `official_website` — the official's own .gov page
- `government_portal` — county/city/agency landing pages
- `news_outlet` — established local outlets that cover this place

## How to research

1. Use `WebSearch` / `WebFetch` against **authoritative** pages first: `.gov`
   sites, official legislature/member directories, county board rosters. Prefer
   primary sources over aggregators.
2. For every fact (a person, a contact detail, a source), record the exact page
   you found it on as `source_url`. If you can't find an authoritative page,
   **omit the row** — do not guess. A missing official is better than a fabricated
   one (this registry has a hard anti-fabrication stance).
3. Assign a `confidence` 0–1 reflecting how authoritative/current the source is
   (1.0 = official .gov roster dated this term; lower for indirect sources).
4. Set `name: null` for a seat you can confirm exists but is currently vacant.

## Output: a propose JSON, then run the CLI

Write a JSON file matching `packages/registry-tool/src/propose.ts`
(`ProposeFileSchema`) and ingest it:

```bash
bun run tool propose --json /path/to/proposed.json
```

Shape:

```json
{
  "districts": [
    { "id": "moco-school-board", "level": "local", "name": "MCPS Board of Education" }
  ],
  "zips": [
    { "zip": "20854", "place": "Potomac", "state": "MD", "county": "Montgomery County",
      "links": [ { "district_id": "moco-school-board", "layer": "school_board" } ] }
  ],
  "officials": [
    { "district_id": "moco-school-board", "office": "Board of Education — District 2",
      "name": "Jane Doe", "branch": "board", "level": "local",
      "office_type": "school_board", "importance": 4,
      "contact": { "website": "https://www.montgomeryschoolsmd.org/boe/members/" },
      "source_url": "https://www.montgomeryschoolsmd.org/boe/members/", "confidence": 0.9 }
  ],
  "sources": [
    { "name": "Montgomery County Council Legislation", "url": "https://www.montgomerycountymd.gov/COUNCIL/legislative.html",
      "type": "government_portal", "scope": "district", "district_id": "moco-school-board",
      "source_url": "https://www.montgomerycountymd.gov/COUNCIL/", "confidence": 0.9 }
  ]
}
```

Notes:
- `branch` ∈ `executive | legislative | board | judicial`. Use `board` for school
  / park / planning boards; `office_type` carries the finer label.
- `office_type` / `importance` are optional — if omitted they're inferred (see
  `src/office_type.ts`). Override `importance` (1–5) when you want to rank a seat.
- Source `scope` must match its association: `national` (no assoc), `state`+`state`,
  `local`+`zip`, `district`+`district_id`, `official`+`official_id`. District- and
  official-scoped sources are stored for future use (not yet rendered).

## After proposing

Tell the human to review and promote:

```bash
bun run tool officials list --status proposed
bun run tool sources   list --status proposed
# inspect each source_url, then:
bun run tool officials verify <id> --by <reviewer>
bun run tool validate --scope all       # link-check before/after promotion
```

Do **not** run `verify` yourself — promotion is the human review gate.
