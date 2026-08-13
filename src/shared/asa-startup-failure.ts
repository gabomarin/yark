export type AsaStartupFailureKind =
  | "mods_not_installed"
  | "fatal"
  | "generic";

export interface AsaStartupFailure {
  kind: AsaStartupFailureKind;
  summary: string;
  cause: string;
  suggestion: string;
  excerpt: string;
  missingModIds: string[];
}

const TIMESTAMP_PREFIX =
  /^(?:\[[^\]]+\]\s*)?(?:\[[\s0-9]+\]\s*)?(?:\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?\s*(?:\[[^\]]+\])?\s*)?/;

function stripLogPrefix(line: string): string {
  return line.replace(TIMESTAMP_PREFIX, "").trim();
}

function collectModIds(text: string): string[] {
  const match = text.match(/Mods not installed:\s*([0-9]+(?:\s*,\s*[0-9]+)*)/i);
  if (match === null || match[1] === undefined) return [];
  return match[1]
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function relevantExcerpt(lines: string[], start: number): string {
  const slice = lines.slice(start, Math.min(lines.length, start + 8));
  return slice.map(stripLogPrefix).filter((line) => line.length > 0).join("\n");
}

/**
 * Reads ASA `ShooterGame.log` / Runtime lines for operator-facing startup fatals
 * (CFCore mods not installed, Unreal Fatal). Returns null when nothing matches.
 */
export function diagnoseAsaStartupFailure(logText: string): AsaStartupFailure | null {
  const lines = logText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  const modsIndex = lines.findIndex((line) =>
    /ASAMods:\s*Error:\s*Not all mods were installed/i.test(line),
  );
  if (modsIndex >= 0) {
    const window = lines.slice(modsIndex, modsIndex + 8).join("\n");
    const missingModIds = collectModIds(window);
    const cosmetics = /Custom Cosmetics/i.test(window);
    const crossPlatform = /pc-only mods on a cross-platform server/i.test(
      window,
    );
    const idList = missingModIds.length > 0 ? missingModIds.join(", ") : "unknown";
    return {
      kind: "mods_not_installed",
      summary: `ASA did not install all mods (${idList}).`,
      cause: cosmetics
        ? "A Custom Cosmetics / skins Project ID is on the dedicated-server mod list, or a PC-only mod was launched with -ServerPlatform=ALL."
        : crossPlatform
          ? "A PC-only mod cannot install while the server is launched with -ServerPlatform=ALL (cross-play)."
          : "CFCore reported one or more mods were not installed before the dedicated process exited.",
      suggestion: cosmetics
        ? "Disable or remove cosmetics/skins Project IDs on the Mods tab, then start again. PC-only mods need -ServerPlatform=PC on Launch; YARK defaults to ALL."
        : "Open Mods, disable the IDs listed as not installed, then start again. Check CFCore lines in Runtime.",
      excerpt: relevantExcerpt(lines, modsIndex),
      missingModIds,
    };
  }

  const fatalIndex = lines.findIndex((line) =>
    /(?:^|\s)(?:LogFatal|Fatal error)/i.test(stripLogPrefix(line)),
  );
  if (fatalIndex >= 0) {
    return {
      kind: "fatal",
      summary: "ASA reported a Fatal error during startup.",
      cause: "The dedicated process hit an engine fatal (often a missing mod, pak, or assert).",
      suggestion:
        "Read the Fatal lines in Runtime (ShooterGame.log). After a SteamCMD update, Verify files or disable the last mods you added.",
      excerpt: relevantExcerpt(lines, fatalIndex),
      missingModIds: [],
    };
  }

  return null;
}
