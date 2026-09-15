/**
 * Logical Unreal map URL helpers shared by spawn (backend) and Launch preview (renderer).
 */

/** Escape `\` and `"` inside a SessionName="…" quoted value. */
function escapeQuotedLaunchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Logical Unreal map URL (UI / logs / spawn argv):
 * `"TheIsland_WP"?SessionName="gabo"`
 */
export function buildMapUrlArg(map: string, sessionName: string): string {
  return `"${map}"?SessionName="${escapeQuotedLaunchValue(sessionName)}"`;
}
