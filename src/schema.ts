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

// Districts
export const DistrictsSchema = z.object({}).catchall(z.string().optional());
export type Districts = z.infer<typeof DistrictsSchema>;

// ZipConfig — post-merge shape
export const ZipConfigSchema = z.object({
  zip: z.string(),
  place: z.string(),
  state: z.string(),
  county: z.string().optional(),
  districts: DistrictsSchema.optional(),
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

// Digest
export const DigestSchema = z.object({
  zip: z.string(),
  place: z.string(),
  generated: z.string(),
  config: ZipConfigSchema,
  articles: z.array(ArticleSchema),
});
export type Digest = z.infer<typeof DigestSchema>;

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
