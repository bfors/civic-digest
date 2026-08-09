# civic-digest

Generates per-ZIP **civic digests** — single-page HTML briefings on what local,
state, and federal government is doing and how it affects residents.

The project is a Bun-workspaces monorepo split into two parts joined by a SQLite
database (`civic.db`):

```
packages/
  shared/         @civic/shared        — Zod schema, db helper, render constants
  registry-tool/  @civic/registry-tool — the data registry: civic.db + research/verify tooling
  generator/      @civic/generator     — reads civic.db, emits the HTML digests
civic.db          committed SQLite source of truth (officials + data sources)
```

- **`registry-tool`** owns the data. Representatives (including high-impact local
  offices like school/park boards) and a typed, scoped set of reliable data
  sources live in `civic.db`. Data is researched (a Claude Code skill proposes
  rows), human-reviewed, verified, and link-checked. See
  [`packages/registry-tool/README.md`](packages/registry-tool/README.md).
- **`generator`** reads `civic.db` directly and renders the digests. Votes and
  news remain flat snapshot files in the generator package.

## Quick start

```bash
bun install
bun run seed                                  # build civic.db from seed-data/ (one-time / recovery)
bun run build -- --all --provider snapshot    # render out/*.html  (or: bun run build 20854 ...)
bun run list                                  # list available ZIPs
bun test                                       # generator parity + render tests
bun run tool help                              # registry-tool CLI
```

`civic.db` is committed, so a fresh checkout can build without seeding. CI
(`.github/workflows/build-digests.yml`) builds `--all` on push / daily / dispatch
and publishes `out/` to GitHub Pages.
