import { describe, test, expect } from "bun:test";
import { MockProvider, filterByValidCategories } from "../src/news.ts";
import { loadZipConfig } from "../src/registry.ts";

describe("MockProvider", () => {
  test("returns articles for 20854", async () => {
    const { config } = loadZipConfig("20854");
    const provider = new MockProvider();
    const articles = await provider.fetch(config);
    expect(articles.length).toBeGreaterThan(0);
  });

  test("all returned articles have valid categories from config", async () => {
    const { config } = loadZipConfig("20854");
    const provider = new MockProvider();
    const articles = await provider.fetch(config);
    const validCategories = new Set(config.categories);
    for (const article of articles) {
      expect(validCategories.has(article.category)).toBe(true);
    }
  });

  test("articles span all 3 levels", async () => {
    const { config } = loadZipConfig("20854");
    const provider = new MockProvider();
    const articles = await provider.fetch(config);
    const levels = new Set(articles.map((a) => a.level));
    expect(levels.has("local")).toBe(true);
    expect(levels.has("state")).toBe(true);
    expect(levels.has("national")).toBe(true);
  });
});

describe("filterByValidCategories", () => {
  test("keeps articles with valid categories", () => {
    const articles = [
      {
        headline: "Test",
        summary: "Test",
        affects_you: "Test",
        category: "Health",
        level: "local" as const,
        source: "Test Source",
        author: null,
      },
    ];
    const result = filterByValidCategories(articles, ["Health", "Education"]);
    expect(result.length).toBe(1);
  });

  test("drops articles with invalid categories", () => {
    const articles = [
      {
        headline: "Test",
        summary: "Test",
        affects_you: "Test",
        category: "InvalidCategory",
        level: "local" as const,
        source: "Test Source",
        author: null,
      },
      {
        headline: "Test 2",
        summary: "Test 2",
        affects_you: "Test 2",
        category: "Health",
        level: "state" as const,
        source: "Test Source",
        author: null,
      },
    ];
    const result = filterByValidCategories(articles, ["Health", "Education"]);
    expect(result.length).toBe(1);
    expect(result[0]?.category).toBe("Health");
  });

  test("returns empty array when all categories invalid", () => {
    const articles = [
      {
        headline: "Test",
        summary: "Test",
        affects_you: "Test",
        category: "BadCategory",
        level: "national" as const,
        source: "Test Source",
        author: null,
      },
    ];
    const result = filterByValidCategories(articles, ["Health"]);
    expect(result.length).toBe(0);
  });
});
