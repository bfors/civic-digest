-- civic.db — the registry source of truth.
-- Officials + data sources (+ the zip/district structure to attach them to).
-- Votes and news remain flat snapshot files in the generator package.
--
-- Conventions:
--   * enums are enforced with CHECK constraints
--   * every list-bearing table carries an `ordinal` so reads reproduce the
--     original YAML/array order (HTML parity depends on this)
--   * researched rows carry a verification block; the generator reads only
--     status='verified' rows

PRAGMA foreign_keys = ON;

-- A ZIP code (header of the old registry/zips/<zip>.yaml).
CREATE TABLE IF NOT EXISTS zip (
  zip    TEXT PRIMARY KEY,
  place  TEXT NOT NULL,
  state  TEXT NOT NULL,
  county TEXT
);

-- A first-class electoral unit (old registry/districts/<id>.yaml header).
-- Officials live in `official`, not embedded here.
CREATE TABLE IF NOT EXISTS district (
  id           TEXT PRIMARY KEY,
  level        TEXT NOT NULL CHECK (level IN ('local','state','national')),
  name         TEXT,
  -- US Census GEOID, the join key for address->district resolution (geo.ts).
  -- NULL until researched. Congressional District = state FIPS + district code
  -- (MD-08 = '2408'); State Legislative Upper/Lower = state FIPS + 3-char
  -- legislative code (MD Senate 15 = '24015'; MD subdistrict 15A = '2415A').
  -- Modeled 1:1 with a district, so Maryland's lettered lower subdistricts each
  -- become their own district row rather than sharing one.
  census_geoid TEXT UNIQUE
);

-- ZIP <-> district many-to-many, grouped by a free-form "layer"
-- (county_executive, state_senate, federal_house, …). A layer normally holds
-- one district; multiple rows with the same (zip,layer) mean the ZIP straddles.
CREATE TABLE IF NOT EXISTS zip_district (
  zip           TEXT NOT NULL REFERENCES zip(zip)     ON DELETE CASCADE,
  district_id   TEXT NOT NULL REFERENCES district(id) ON DELETE CASCADE,
  layer         TEXT NOT NULL,
  layer_ordinal INTEGER NOT NULL DEFAULT 0,  -- order the layer appears for this ZIP
  ordinal       INTEGER NOT NULL DEFAULT 0,  -- order within a layer (straddling)
  PRIMARY KEY (zip, district_id, layer)
);
CREATE INDEX IF NOT EXISTS idx_zipdistrict_zip ON zip_district(zip);

-- A seat-holder. name NULL = unfilled seat (drives the seat-unfilled warning).
CREATE TABLE IF NOT EXISTS official (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id    TEXT NOT NULL REFERENCES district(id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL DEFAULT 0,
  office         TEXT NOT NULL,
  name           TEXT,                          -- NULL = unfilled seat
  branch         TEXT NOT NULL
                   CHECK (branch IN ('executive','legislative','board','judicial')),
  level          TEXT NOT NULL CHECK (level IN ('local','state','national')),
  district_label TEXT,                          -- the render Official.district string
  party          TEXT,
  office_type    TEXT CHECK (office_type IN
                   ('executive','council','legislature_upper','legislature_lower',
                    'school_board','park_board','board','judicial',
                    'law_enforcement','other')),
  importance     INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  needs_verification INTEGER NOT NULL DEFAULT 0 CHECK (needs_verification IN (0,1)),
  -- inline 1:1 contact (sparse, single-valued)
  contact_phone   TEXT,
  contact_email   TEXT,
  contact_website TEXT,
  contact_twitter TEXT,
  -- verification block
  status            TEXT NOT NULL DEFAULT 'proposed'
                      CHECK (status IN ('proposed','verified','rejected')),
  confidence        REAL CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 1)),
  source_url        TEXT,
  verified_at       TEXT,
  verified_by       TEXT,
  last_checked      TEXT,
  last_check_status TEXT NOT NULL DEFAULT 'unchecked'
                      CHECK (last_check_status IN ('ok','broken','redirect','unchecked'))
);
CREATE INDEX IF NOT EXISTS idx_official_district ON official(district_id);
CREATE INDEX IF NOT EXISTS idx_official_status   ON official(status);

-- Committees for an official (render Official.committees: string[]).
CREATE TABLE IF NOT EXISTS official_committee (
  official_id INTEGER NOT NULL REFERENCES official(id) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  PRIMARY KEY (official_id, ordinal)
);

-- First-class, typed, scoped data source. Replaces the anonymous {name,url}
-- objects that used to live in _defaults.yaml (national/state) and each ZIP
-- (local). Exactly one association column is set per scope (enforced below).
CREATE TABLE IF NOT EXISTS source (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN
                ('news_outlet','official_legislative_record','official_website',
                 'government_portal','other')),
  scope       TEXT NOT NULL CHECK (scope IN
                ('national','state','local','district','official')),
  state       TEXT,
  zip         TEXT    REFERENCES zip(zip)        ON DELETE CASCADE,
  district_id TEXT    REFERENCES district(id)    ON DELETE CASCADE,
  official_id INTEGER REFERENCES official(id)    ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL DEFAULT 0,
  -- verification block
  status            TEXT NOT NULL DEFAULT 'proposed'
                      CHECK (status IN ('proposed','verified','rejected')),
  confidence        REAL CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 1)),
  source_url        TEXT,
  verified_at       TEXT,
  verified_by       TEXT,
  last_checked      TEXT,
  last_check_status TEXT NOT NULL DEFAULT 'unchecked'
                      CHECK (last_check_status IN ('ok','broken','redirect','unchecked')),
  -- scope/association invariant: exactly the right column is populated
  CHECK (
    (scope='national' AND state IS NULL     AND zip IS NULL AND district_id IS NULL AND official_id IS NULL) OR
    (scope='state'    AND state IS NOT NULL  AND zip IS NULL AND district_id IS NULL AND official_id IS NULL) OR
    (scope='local'    AND zip   IS NOT NULL  AND state IS NULL AND district_id IS NULL AND official_id IS NULL) OR
    (scope='district' AND district_id IS NOT NULL AND state IS NULL AND zip IS NULL AND official_id IS NULL) OR
    (scope='official' AND official_id IS NOT NULL AND state IS NULL AND zip IS NULL AND district_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_source_scope ON source(scope, state, zip);

-- Canonical category list (from _defaults.yaml `categories`).
CREATE TABLE IF NOT EXISTS category (
  name    TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL DEFAULT 0
);
