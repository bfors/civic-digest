import type { Branch, Level, OfficeType } from "@civic/shared/schema";

// Best-effort classification of an office into an office_type + importance,
// used by the seed (and offered as defaults by the CLI). office_type/importance
// are not rendered, so a wrong guess here never affects HTML — it only helps
// humans filter and rank seats by local impact.
export function inferOfficeType(
  office: string,
  branch: Branch,
  level: Level
): OfficeType {
  const o = office.toLowerCase();
  if (branch === "executive") return "executive";
  if (branch === "judicial") return "judicial";
  if (branch === "board") {
    if (o.includes("school") || o.includes("education")) return "school_board";
    if (o.includes("park") || o.includes("planning")) return "park_board";
    return "board";
  }
  if (o.includes("sheriff") || o.includes("police")) return "law_enforcement";
  if (o.includes("council")) return "council";
  if (o.includes("senator") || o.includes("senate")) return "legislature_upper";
  if (
    o.includes("delegate") ||
    o.includes("representative") ||
    o.includes("assembly") ||
    o.includes("house")
  ) {
    return "legislature_lower";
  }
  return "other";
}

// Default importance (1–5) by office_type — county exec / federal seats rank
// highest, advisory boards lower. Humans can override per row.
export function defaultImportance(officeType: OfficeType, level: Level): number {
  switch (officeType) {
    case "executive":
      return 5;
    case "council":
      return level === "local" ? 5 : 4;
    case "legislature_upper":
      return 4;
    case "legislature_lower":
      return level === "national" ? 4 : 3;
    case "law_enforcement":
      return 4;
    case "school_board":
      return 4;
    case "park_board":
      return 3;
    case "judicial":
      return 3;
    case "board":
      return 2;
    default:
      return 3;
  }
}
