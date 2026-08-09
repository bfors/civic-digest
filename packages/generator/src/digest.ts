import { DigestSchema, type Digest } from "@civic/shared/schema";
import { loadZipConfig, resolveVotesByLevel } from "./registry.ts";
import { filterByValidCategories, type NewsProvider } from "./news.ts";

export async function buildDigest(zip: string, provider: NewsProvider): Promise<Digest> {
  const { config, warnings } = loadZipConfig(zip);

  for (const warning of warnings) {
    console.warn(`[warn] ${warning}`);
  }

  const raw = await provider.fetch(config);
  const articles = filterByValidCategories(raw, config.categories);

  const votes = resolveVotesByLevel(config.districts ?? {});

  const today = new Date().toISOString().split("T")[0] ?? new Date().toISOString();

  return DigestSchema.parse({
    zip,
    place: config.place,
    generated: today,
    config,
    articles,
    votes,
  });
}
