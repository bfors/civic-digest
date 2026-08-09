import { z } from "zod";
import {
  BranchSchema,
  LevelSchema,
  OfficeTypeSchema,
  SourceScopeSchema,
  SourceTypeSchema,
} from "@civic/shared/schema";

// Shape of the JSON the research skill emits and `tool propose --json` ingests.
// Officials and sources land as status='proposed' (pending human review).
// Districts and ZIPs are structural and inserted directly (they carry no
// lifecycle of their own). Every researched fact must carry a source_url.

export const ProposedOfficialSchema = z.object({
  district_id: z.string(),
  office: z.string(),
  name: z.string().nullable(),
  branch: BranchSchema,
  level: LevelSchema,
  office_type: OfficeTypeSchema.optional(),
  importance: z.number().int().min(1).max(5).optional(),
  district: z.string().optional(),
  party: z.string().optional(),
  committees: z.array(z.string()).optional(),
  contact: z
    .object({
      phone: z.string().optional(),
      email: z.string().optional(),
      website: z.string().url().optional(),
      twitter: z.string().optional(),
    })
    .optional(),
  source_url: z.string().url(),
  confidence: z.number().min(0).max(1).optional(),
});

export const ProposedSourceSchema = z
  .object({
    name: z.string(),
    url: z.string().url(),
    type: SourceTypeSchema,
    scope: SourceScopeSchema,
    state: z.string().optional(),
    zip: z.string().optional(),
    district_id: z.string().optional(),
    official_id: z.number().int().optional(),
    source_url: z.string().url().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine(
    (s) =>
      (s.scope === "national") ||
      (s.scope === "state" && !!s.state) ||
      (s.scope === "local" && !!s.zip) ||
      (s.scope === "district" && !!s.district_id) ||
      (s.scope === "official" && s.official_id != null),
    { message: "source scope/association mismatch (e.g. scope=local needs zip)" }
  );

export const ProposedDistrictSchema = z.object({
  id: z.string(),
  level: LevelSchema,
  name: z.string().optional(),
});

export const ProposedZipSchema = z.object({
  zip: z.string(),
  place: z.string(),
  state: z.string(),
  county: z.string().optional(),
  links: z
    .array(
      z.object({
        district_id: z.string(),
        layer: z.string(),
        ordinal: z.number().int().optional(),
      })
    )
    .optional(),
});

export const ProposeFileSchema = z.object({
  districts: z.array(ProposedDistrictSchema).optional(),
  zips: z.array(ProposedZipSchema).optional(),
  officials: z.array(ProposedOfficialSchema).optional(),
  sources: z.array(ProposedSourceSchema).optional(),
});

export type ProposeFile = z.infer<typeof ProposeFileSchema>;
