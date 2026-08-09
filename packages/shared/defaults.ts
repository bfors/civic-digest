// Presentation-only defaults. Render colors don't need research or verification,
// so they live as a constant rather than a DB table. loadDefaults() in the
// generator combines this with the category + national source rows from civic.db
// to assemble a DefaultsConfig.
export const LEVEL_COLORS = {
  local: "#2f7d4f",
  state: "#2563a8",
  national: "#9c4a2f",
} as const;
