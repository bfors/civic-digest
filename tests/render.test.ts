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

  test("verify badge appears for needs_verification official", async () => {
    const digest = await getDigest();
    const defaults = loadDefaults();
    const html = renderDigest(digest, defaults.render);
    expect(html).toContain("Verify");
    expect(html).toContain("&#9888;");
  });

  test("Seat Unfilled appears for name:null official", async () => {
    const digest = await getDigest();
    const defaults = loadDefaults();
    const html = renderDigest(digest, defaults.render);
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
