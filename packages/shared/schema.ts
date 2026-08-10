import { z } from "zod";

// Enums
export const LevelSchema = z.enum(["local", "state", "national"]);
export type Level = z.infer<typeof LevelSchema>;

// Extended beyond executive|legislative so school/park boards and elected
// judges are modeled honestly. `branch` is validation metadata only (not used
// by any render/grouping code), so adding values is HTML-neutral. The finer
// office distinction (school_board vs park_board, …) rides in OfficialRow's
// office_type.
export const BranchSchema = z.enum([
  "executive",
  "legislative",
  "board",
  "judicial",
]);
export type Branch = z.infer<typeof BranchSchema>;

// Source
export const SourceSchema = z.object({
  name: z.string(),
  url: z.string().url(),
});
export type Source = z.infer<typeof SourceSchema>;

// Contact
export const ContactSchema = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().url().optional(),
  twitter: z.string().optional(),
});
export type Contact = z.infer<typeof ContactSchema>;

// Official
export const OfficialSchema = z.object({
  office: z.string(),
  name: z.string().nullable(),
  branch: BranchSchema,
  level: LevelSchema,
  district: z.string().optional(),
  party: z.string().optional(),
  committees: z.array(z.string()).optional(),
  contact: ContactSchema.optional(),
  needs_verification: z.boolean().optional(),
});
export type Official = z.infer<typeof OfficialSchema>;

// District references on a ZIP: layer name -> list of district ids.
// A layer normally holds one id; multiple ids mean the ZIP straddles that layer.
export const DistrictRefsSchema = z.record(z.array(z.string()));
export type DistrictRefs = z.infer<typeof DistrictRefsSchema>;

// District — a first-class electoral unit, defined once and referenced by ZIPs.
// Holds one or more officials (e.g. a statewide US Senate "district" holds two).
export const DistrictSchema = z.object({
  id: z.string(),
  level: LevelSchema,
  name: z.string().optional(),
  // US Census GEOID for address->district resolution (see geo.ts). Optional;
  // NULL for districts with no Census layer (e.g. statewide US Senate) or not
  // yet researched.
  census_geoid: z.string().optional(),
  officials: z.array(OfficialSchema),
});
export type District = z.infer<typeof DistrictSchema>;

// ZipFile — raw shape of registry/zips/<zip>.yaml (pre-resolution).
// Officials no longer live here; the ZIP references district files instead.
export const ZipFileSchema = z.object({
  zip: z.string(),
  place: z.string(),
  state: z.string(),
  county: z.string().optional(),
  districts: DistrictRefsSchema.optional(),
  sources: z
    .object({
      local: z.array(SourceSchema).optional(),
    })
    .optional(),
});
export type ZipFile = z.infer<typeof ZipFileSchema>;

// ZipConfig — post-resolution shape consumed by the build + renderer.
export const ZipConfigSchema = z.object({
  zip: z.string(),
  place: z.string(),
  state: z.string(),
  county: z.string().optional(),
  districts: DistrictRefsSchema.optional(),
  categories: z.array(z.string()),
  sources: z.object({
    local: z.array(SourceSchema).optional(),
    state: z.array(SourceSchema).optional(),
    national: z.array(SourceSchema),
  }),
  officials: z.object({
    local: z.array(OfficialSchema).optional(),
    state: z.array(OfficialSchema).optional(),
    federal: z.array(OfficialSchema).optional(),
  }),
});
export type ZipConfig = z.infer<typeof ZipConfigSchema>;

// Article
export const ArticleSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  affects_you: z.string(),
  category: z.string(),
  level: LevelSchema,
  source: z.string(),
  url: z.string().url().optional(),
  author: z.string().nullable(),
  published: z.string().optional(),
});
export type Article = z.infer<typeof ArticleSchema>;

// Vote — a recent or upcoming legislative vote/action by an official or body.
// Each must link to the official record (source_url) so a reader can verify.
export const VoteSchema = z.object({
  bill: z.string(),
  title: z.string(),
  summary: z.string(),
  body: z.string(),
  status: z.enum(["recent", "upcoming"]),
  date: z.string().optional(),
  result: z.string().optional(),
  // Member position(s). Omit when the official source doesn't record a
  // per-member position we can verify — we never invent a Yea/Nay.
  positions: z.array(z.object({ name: z.string(), vote: z.string() })).optional(),
  source_url: z.string().url(),
});
export type Vote = z.infer<typeof VoteSchema>;

// VotesSnapshot — committed votes for one district (registry/votes/<district>.json),
// generated out-of-band from official sources. Keyed by district so it dedups
// across ZIPs, exactly like the district/officials data.
export const VotesSnapshotSchema = z.object({
  district: z.string(),
  generated: z.string(),
  votes: z.array(VoteSchema),
});
export type VotesSnapshot = z.infer<typeof VotesSnapshotSchema>;

// Digest
export const DigestSchema = z.object({
  zip: z.string(),
  place: z.string(),
  generated: z.string(),
  config: ZipConfigSchema,
  articles: z.array(ArticleSchema),
  votes: z.object({
    local: z.array(VoteSchema),
    state: z.array(VoteSchema),
    federal: z.array(VoteSchema),
  }),
});
export type Digest = z.infer<typeof DigestSchema>;

// NewsSnapshot — committed real-news data for a ZIP (registry/news/<zip>.json).
// Generated out-of-band (e.g. by Claude Code via web search) and read by
// SnapshotProvider so the build needs no live API calls.
export const NewsSnapshotSchema = z.object({
  zip: z.string(),
  generated: z.string(),
  articles: z.array(ArticleSchema),
});
export type NewsSnapshot = z.infer<typeof NewsSnapshotSchema>;

// DefaultsConfig — shape of _defaults.yaml
export const DefaultsConfigSchema = z.object({
  categories: z.array(z.string()),
  sources: z.object({
    national: z.array(SourceSchema),
  }),
  state_sources: z.record(z.array(SourceSchema)),
  render: z.object({
    level_colors: z.object({
      local: z.string(),
      state: z.string(),
      national: z.string(),
    }),
  }),
});
export type DefaultsConfig = z.infer<typeof DefaultsConfigSchema>;

// ---------------------------------------------------------------------------
// DB-row schemas — the shapes stored in / read from civic.db. These are
// distinct from the render types above: they carry row identity, ordering, and
// research/verification provenance. The generator projects rows back down to
// the render types (OfficialRow -> Official, SourceRow -> Source) before
// assembling a ZipConfig, so the rendered HTML is unaffected by these columns.
// ---------------------------------------------------------------------------

// Classifies an office so we can surface high-local-impact seats (school/park
// boards, sheriff, council, …) even when `branch` is coarse.
export const OfficeTypeSchema = z.enum([
  "executive",
  "council",
  "legislature_upper",
  "legislature_lower",
  "school_board",
  "park_board",
  "board",
  "judicial",
  "law_enforcement",
  "other",
]);
export type OfficeType = z.infer<typeof OfficeTypeSchema>;

// Where a data source applies. Drives which association column is populated.
export const SourceTypeSchema = z.enum([
  "news_outlet",
  "official_legislative_record",
  "official_website",
  "government_portal",
  "other",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceScopeSchema = z.enum([
  "national",
  "state",
  "local",
  "district",
  "official",
]);
export type SourceScope = z.infer<typeof SourceScopeSchema>;

// Research/verification lifecycle. The generator reads only `verified` rows.
export const VerificationStatusSchema = z.enum([
  "proposed",
  "verified",
  "rejected",
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const LinkCheckStatusSchema = z.enum([
  "ok",
  "broken",
  "redirect",
  "unchecked",
]);
export type LinkCheckStatus = z.infer<typeof LinkCheckStatusSchema>;

// Provenance + lifecycle carried by every researched row.
export const VerificationSchema = z.object({
  status: VerificationStatusSchema,
  confidence: z.number().min(0).max(1).nullable(),
  source_url: z.string().url().nullable(),
  verified_at: z.string().nullable(),
  verified_by: z.string().nullable(),
  last_checked: z.string().nullable(),
  last_check_status: LinkCheckStatusSchema,
});
export type Verification = z.infer<typeof VerificationSchema>;

// A row in the `official` table (render Official + identity + research cols).
export const OfficialRowSchema = OfficialSchema.extend({
  id: z.number().int(),
  district_id: z.string(),
  ordinal: z.number().int(),
  office_type: OfficeTypeSchema.nullable(),
  importance: z.number().int().min(1).max(5),
}).merge(VerificationSchema);
export type OfficialRow = z.infer<typeof OfficialRowSchema>;

// A row in the `source` table (render Source + type/scope + research cols).
export const SourceRowSchema = SourceSchema.extend({
  id: z.number().int(),
  type: SourceTypeSchema,
  scope: SourceScopeSchema,
  state: z.string().nullable(),
  zip: z.string().nullable(),
  district_id: z.string().nullable(),
  official_id: z.number().int().nullable(),
  ordinal: z.number().int(),
}).merge(VerificationSchema);
export type SourceRow = z.infer<typeof SourceRowSchema>;
