import { z } from "zod";

// Enums
export const LevelSchema = z.enum(["local", "state", "national"]);
export type Level = z.infer<typeof LevelSchema>;

export const BranchSchema = z.enum(["executive", "legislative"]);
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
