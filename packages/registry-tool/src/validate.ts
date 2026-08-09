import type { Database } from "bun:sqlite";
import type { LinkCheckStatus } from "@civic/shared/schema";

// Probe a URL: HEAD first, fall back to GET when a server rejects HEAD.
// 2xx -> ok, 3xx -> redirect, anything else / network error -> broken.
export async function checkUrl(url: string, timeoutMs = 8000): Promise<LinkCheckStatus> {
  const classify = (status: number): LinkCheckStatus | null => {
    if (status >= 200 && status < 300) return "ok";
    if (status >= 300 && status < 400) return "redirect";
    return null;
  };
  const probe = (method: string) =>
    fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  try {
    const head = await probe("HEAD");
    const c = classify(head.status);
    if (c) return c;
    // Many gov sites reject/!support HEAD — retry with GET before giving up.
    const get = await probe("GET");
    return classify(get.status) ?? "broken";
  } catch {
    return "broken"; // network error or timeout
  }
}

export interface ValidateSummary {
  checked: number;
  ok: number;
  redirect: number;
  broken: number;
  flagged: number; // verified officials newly flagged needs_verification
}

// Walk verified officials' websites and all source URLs, probe each, and write
// last_checked / last_check_status. A broken link on a verified official flips
// needs_verification=1 so the next digest build surfaces the existing warning.
export async function runValidate(
  db: Database,
  scope: "all" | "officials" | "sources",
  today: string
): Promise<ValidateSummary> {
  const summary: ValidateSummary = {
    checked: 0,
    ok: 0,
    redirect: 0,
    broken: 0,
    flagged: 0,
  };

  if (scope === "all" || scope === "officials") {
    const rows = db
      .query(
        `SELECT id, contact_website, status FROM official
          WHERE contact_website IS NOT NULL`
      )
      .all() as Array<{ id: number; contact_website: string; status: string }>;
    const update = db.query(
      "UPDATE official SET last_checked = ?, last_check_status = ? WHERE id = ?"
    );
    const flag = db.query(
      "UPDATE official SET needs_verification = 1 WHERE id = ?"
    );
    for (const r of rows) {
      const result = await checkUrl(r.contact_website);
      update.run(today, result, r.id);
      tally(summary, result);
      if (result === "broken" && r.status === "verified") {
        flag.run(r.id);
        summary.flagged++;
      }
    }
  }

  if (scope === "all" || scope === "sources") {
    const rows = db
      .query("SELECT id, url FROM source")
      .all() as Array<{ id: number; url: string }>;
    const update = db.query(
      "UPDATE source SET last_checked = ?, last_check_status = ? WHERE id = ?"
    );
    for (const r of rows) {
      const result = await checkUrl(r.url);
      update.run(today, result, r.id);
      tally(summary, result);
    }
  }

  return summary;
}

function tally(s: ValidateSummary, result: LinkCheckStatus) {
  s.checked++;
  if (result === "ok") s.ok++;
  else if (result === "redirect") s.redirect++;
  else if (result === "broken") s.broken++;
}
