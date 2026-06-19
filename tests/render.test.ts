import { describe, test, expect } from "bun:test";
import { renderDigest, renderIndex } from "../src/render_html.ts";
import { buildDigest } from "../src/digest.ts";
import { MockProvider } from "../src/news.ts";
import { loadDefaults } from "../src/registry.ts";

async function getDigest() {
  const provider = new MockProvider();
  return buildDigest("20854", provider);
}

describe("renderDigest", () => {
  test("renders without throwing and produces HTML", async () => {
    const digest = await getDigest();
    const defaults = loadDefaults();
    const html = renderDigest(digest, defaults.render);
    expect(html).toBeTruthy();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Daily Civic Dispatch");
  });

  // Build a minimal digest with synthetic officials so these rendering rules
  // are tested directly, not coupled to whatever real data the registry holds.
  function digestWithOfficials(officials: any[]) {
    const defaults = loadDefaults();
    return {
      zip: "00000",
      place: "Testville",
      generated: "2026-06-19",
      config: {
        zip: "00000",
        place: "Testville",
        state: "XX",
        categories: defaults.categories,
        sources: { national: [] },
        officials: { local: officials },
      },
      articles: [],
    } as any;
  }

  test("needs_verification official shows Verify badge but no contact link", () => {
    const defaults = loadDefaults();
    const html = renderDigest(
      digestWithOfficials([
        {
          office: "Advisory Board",
          name: "Pat Doe",
          branch: "legislative",
          level: "local",
          needs_verification: true,
          contact: { website: "https://example.com/unconfirmed-link" },
        },
      ]),
      defaults.render
    );
    expect(html).toContain("Verify");
    expect(html).toContain("&#9888;");
    // Per policy: links for unverified officials are suppressed.
    expect(html).not.toContain("unconfirmed-link");
  });

  test("Seat Unfilled appears for name:null official", () => {
    const defaults = loadDefaults();
    const html = renderDigest(
      digestWithOfficials([
        {
          office: "County Executive",
          name: null,
          branch: "executive",
          level: "local",
        },
      ]),
      defaults.render
    );
    expect(html).toContain("Seat Unfilled");
  });

  test("all 3 level colors appear in output", async () => {
    const digest = await getDigest();
    const defaults = loadDefaults();
    const html = renderDigest(digest, defaults.render);
    expect(html).toContain(defaults.render.level_colors.local);
    expect(html).toContain(defaults.render.level_colors.state);
    expect(html).toContain(defaults.render.level_colors.national);
  });

  test("contains place and zip in header", async () => {
    const digest = await getDigest();
    const defaults = loadDefaults();
    const html = renderDigest(digest, defaults.render);
    expect(html).toContain("Potomac");
    expect(html).toContain("20854");
  });

  test("contains How this affects you callout", async () => {
    const digest = await getDigest();
    const defaults = loadDefaults();
    const html = renderDigest(digest, defaults.render);
    expect(html).toContain("How this affects you");
  });

  test("footer disclaimer is present", async () => {
    const digest = await getDigest();
    const defaults = loadDefaults();
    const html = renderDigest(digest, defaults.render);
    expect(html).toContain("Disclaimer");
    expect(html).toContain("official government sources");
  });
});

describe("renderIndex", () => {
  test("renders index with entry links", () => {
    const entries = [
      { zip: "20854", place: "Potomac", generated: "2026-06-13" },
    ];
    const html = renderIndex(entries);
    expect(html).toContain("digest-20854.html");
    expect(html).toContain("Potomac");
  });

  test("escapes HTML in entries", () => {
    const entries = [
      { zip: "12345", place: "<script>alert(1)</script>", generated: "2026-06-13" },
    ];
    const html = renderIndex(entries);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
