import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { buildDigest } from "./src/digest.ts";
import { availableZips } from "./src/registry.ts";
import { renderDigest, renderIndex } from "./src/render_html.ts";
import { MockProvider, ClaudeProvider, SnapshotProvider } from "./src/news.ts";
import { loadDefaults } from "./src/registry.ts";
import type { NewsProvider } from "./src/news.ts";

const args = process.argv.slice(2);

function getProvider(args: string[]): NewsProvider {
  const idx = args.indexOf("--provider");
  const providerName = idx !== -1 ? args[idx + 1] : "mock";

  if (providerName === "claude") {
    return new ClaudeProvider();
  } else if (providerName === "snapshot") {
    return new SnapshotProvider();
  } else if (providerName === "mock" || providerName === undefined) {
    return new MockProvider();
  } else {
    console.error(
      `Unknown provider: ${providerName}. Use "mock", "snapshot", or "claude".`
    );
    process.exit(1);
  }
}

async function main() {
  if (args.includes("--list")) {
    const zips = availableZips();
    console.log(zips.join("\n"));
    return;
  }

  mkdirSync("out", { recursive: true });

  const defaults = loadDefaults();
  const renderConfig = defaults.render;

  if (args.includes("--all")) {
    const zips = availableZips();
    if (zips.length === 0) {
      console.error("No ZIPs found in registry.");
      process.exit(1);
    }

    const provider = getProvider(args);
    const entries: Array<{ zip: string; place: string; generated: string }> = [];
    let anyFailed = false;

    for (const zip of zips) {
      try {
        console.log(`Building digest for ${zip}...`);
        const digest = await buildDigest(zip, provider);
        const html = renderDigest(digest, renderConfig);
        const outPath = join("out", `digest-${zip}.html`);
        writeFileSync(outPath, html, "utf-8");
        console.log(`  ✓ Written to ${outPath}`);
        entries.push({ zip: digest.zip, place: digest.place, generated: digest.generated });
      } catch (err) {
        console.error(`  ✗ Failed for ZIP ${zip}:`, err instanceof Error ? err.message : err);
        anyFailed = true;
      }
    }

    const indexHtml = renderIndex(entries);
    writeFileSync(join("out", "index.html"), indexHtml, "utf-8");
    console.log(`Written out/index.html (${entries.length} digest(s))`);

    if (anyFailed) {
      process.exit(1);
    }
    return;
  }

  // Single ZIP mode
  const zip = args.find((a) => !a.startsWith("--") && a !== args[args.indexOf("--provider") + 1]);

  if (!zip) {
    console.error(
      "Usage:\n" +
        "  bun run build.ts <zip> [--provider mock|claude]\n" +
        "  bun run build.ts --list\n" +
        "  bun run build.ts --all [--provider mock|claude]"
    );
    process.exit(1);
  }

  const provider = getProvider(args);

  try {
    const digest = await buildDigest(zip, provider);
    const html = renderDigest(digest, renderConfig);
    const outPath = join("out", `digest-${zip}.html`);
    writeFileSync(outPath, html, "utf-8");
    console.log(`Written to ${outPath}`);
  } catch (err) {
    console.error("Build failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
