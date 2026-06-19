import type { Digest, Official, Article } from "./schema.ts";

export interface RenderConfig {
  level_colors: {
    local: string;
    state: string;
    national: string;
  };
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function chip(label: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;background:${escHtml(color)};color:#fff;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">${escHtml(label)}</span>`;
}

function categoryPill(category: string): string {
  return `<span style="display:inline-block;padding:2px 9px;border-radius:10px;background:#e8edf2;color:#445;font-size:11px;font-weight:600;">${escHtml(category)}</span>`;
}

function renderContact(official: Official): string {
  if (!official.contact) return "";
  const links: string[] = [];
  const c = official.contact;
  if (c.website) {
    links.push(`<a href="${escHtml(c.website)}" style="color:#2563a8;">Website</a>`);
  }
  if (c.phone) {
    links.push(`<a href="tel:${escHtml(c.phone)}" style="color:#2563a8;">${escHtml(c.phone)}</a>`);
  }
  if (c.email) {
    links.push(`<a href="mailto:${escHtml(c.email)}" style="color:#2563a8;">${escHtml(c.email)}</a>`);
  }
  if (c.twitter) {
    links.push(`<a href="https://twitter.com/${escHtml(c.twitter)}" style="color:#2563a8;">@${escHtml(c.twitter)}</a>`);
  }
  if (links.length === 0) return "";
  return `<div style="margin-top:4px;font-size:13px;">${links.join(" &bull; ")}</div>`;
}

function renderOfficialCard(official: Official): string {
  const nameDisplay = official.name !== null
    ? escHtml(official.name)
    : `<em style="color:#888;">Seat Unfilled</em>`;

  const verifyBadge = official.needs_verification
    ? ` <span title="Needs verification" style="display:inline-block;background:#f59e0b;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700;">&#9888; Verify</span>`
    : "";

  const committees =
    official.committees && official.committees.length > 0
      ? `<div style="font-size:12px;color:#666;margin-top:3px;">${official.committees.map((c) => escHtml(c)).join(" &middot; ")}</div>`
      : "";

  // An unverified official is shown (with the Verify badge) but without contact
  // links we can't stand behind — we don't publish a URL we haven't confirmed.
  const contact = official.needs_verification ? "" : renderContact(official);

  return `
    <div style="background:#fff;border:1px solid #e2e6ea;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${escHtml(official.office)}</div>
      <div style="font-size:16px;font-weight:700;margin-top:4px;">${nameDisplay}${verifyBadge}</div>
      ${committees}
      ${contact}
    </div>`;
}

function renderArticleCard(article: Article): string {
  const headline = article.url
    ? `<a href="${escHtml(article.url)}" style="color:#1a1a1a;text-decoration:none;font-weight:700;font-size:16px;">${escHtml(article.headline)}</a>`
    : `<span style="font-weight:700;font-size:16px;">${escHtml(article.headline)}</span>`;

  const authorPart = article.author ? ` &bull; ${escHtml(article.author)}` : "";
  const sourceLine = `<div style="font-size:12px;color:#666;margin-top:8px;">${escHtml(article.source)}${authorPart}</div>`;

  return `
    <div style="background:#fff;border:1px solid #e2e6ea;border-radius:8px;padding:16px;margin-bottom:12px;">
      <div style="margin-bottom:8px;">${categoryPill(article.category)}</div>
      <div>${headline}</div>
      <p style="font-size:14px;color:#333;margin:8px 0 0;">${escHtml(article.summary)}</p>
      <div style="border-left:4px solid #2f7d4f;background:#f0faf4;padding:10px 14px;margin-top:10px;border-radius:0 6px 6px 0;">
        <div style="font-size:11px;font-weight:700;color:#2f7d4f;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">How this affects you</div>
        <p style="font-size:13px;color:#1a3d27;margin:0;">${escHtml(article.affects_you)}</p>
      </div>
      ${sourceLine}
    </div>`;
}

function renderLevelSection(
  label: string,
  color: string,
  officials: Official[],
  articles: Article[]
): string {
  if (officials.length === 0 && articles.length === 0) return "";

  const officialsHtml = officials.length > 0
    ? `<div style="margin-bottom:16px;">${officials.map(renderOfficialCard).join("")}</div>`
    : "";

  const articlesHtml = articles.map(renderArticleCard).join("");

  return `
    <section style="margin-bottom:32px;">
      <div style="margin-bottom:16px;">${chip(label, color)}</div>
      ${officialsHtml}
      ${articlesHtml}
    </section>`;
}

export function renderDigest(digest: Digest, renderConfig: RenderConfig): string {
  const { zip, place, generated, config, articles } = digest;
  const colors = renderConfig.level_colors;

  const localOfficials = config.officials.local ?? [];
  const stateOfficials = config.officials.state ?? [];
  const federalOfficials = config.officials.federal ?? [];

  const localArticles = articles.filter((a) => a.level === "local");
  const stateArticles = articles.filter((a) => a.level === "state");
  const nationalArticles = articles.filter((a) => a.level === "national");

  const sections = [
    renderLevelSection("Local", colors.local, localOfficials, localArticles),
    renderLevelSection("State", colors.state, stateOfficials, stateArticles),
    renderLevelSection("National", colors.national, federalOfficials, nationalArticles),
  ].join("");

  const dateFormatted = new Date(generated + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Civic Dispatch — ${escHtml(place)} (${escHtml(zip)})</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;">

    <header style="text-align:center;margin-bottom:32px;padding:24px;background:#fff;border-radius:10px;border:1px solid #e2e6ea;">
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#1a1a1a;">Daily Civic Dispatch</h1>
      <div style="font-size:16px;color:#555;margin-bottom:4px;">${escHtml(place)} &bull; ${escHtml(zip)}</div>
      <div style="font-size:14px;color:#888;">${escHtml(dateFormatted)}</div>
    </header>

    <main>
      ${sections}
    </main>

    <footer style="text-align:center;padding:24px 0;font-size:12px;color:#999;border-top:1px solid #e2e6ea;margin-top:8px;">
      <p style="margin:0 0 6px;"><strong>Disclaimer:</strong> This digest is generated automatically and may contain errors or omissions.</p>
      <p style="margin:0 0 6px;">Official information may have changed. Always verify with official government sources before making decisions.</p>
      <p style="margin:0;">Contact information for officials is provided for convenience and is subject to change.</p>
    </footer>

  </div>
</body>
</html>`;
}

export function renderIndex(
  entries: Array<{ zip: string; place: string; generated: string }>
): string {
  const rows = entries
    .map(
      (e) =>
        `<li style="margin-bottom:8px;"><a href="digest-${escHtml(e.zip)}.html" style="color:#2563a8;font-size:16px;">${escHtml(e.place)} (${escHtml(e.zip)})</a> <span style="color:#999;font-size:13px;">${escHtml(e.generated)}</span></li>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Civic Dispatch — Index</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <h1 style="font-size:24px;font-weight:800;color:#1a1a1a;margin-bottom:8px;">Daily Civic Dispatch</h1>
    <p style="color:#666;margin-bottom:24px;">Select your area to view today's civic digest.</p>
    <ul style="list-style:none;padding:0;margin:0;">
      ${rows}
    </ul>
  </div>
</body>
</html>`;
}
