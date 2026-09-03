import type { ServerInstallationInfo } from "./types";
import { isInstallationReady } from "./installation-health";

export type ServerUpdateState = "available" | "current" | "unknown";

/** Parse `build 123456` → numeric id, or null when not a Steam build label. */
function parseSteamBuildId(label: string | null | undefined): number | null {
  if (label == null) return null;
  const match = label.trim().match(/^build\s+(\d+)$/i);
  if (match?.[1] === undefined) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

/**
 * Compares only equivalent Steam builds.
 * `ARK Version` can differ between the downloadable dedicated and official
 * servers during staggered rollouts, so it does not decide updates.
 *
 * Local build **ahead of** the official probe counts as current: SteamCMD can
 * finish an update before `api.steamcmd.net` reflects the new public buildid
 * (#490 false-positive Update chrome).
 */
export function getServerUpdateState(
  installation: ServerInstallationInfo | null | undefined,
  officialSteamBuild: string | null | undefined,
): ServerUpdateState {
  if (installation == null || !isInstallationReady(installation)) {
    return "unknown";
  }
  if (installation.steamBuild == null || officialSteamBuild == null) {
    return "unknown";
  }
  const localId = parseSteamBuildId(installation.steamBuild);
  const officialId = parseSteamBuildId(officialSteamBuild);
  if (localId !== null && officialId !== null) {
    return localId >= officialId ? "current" : "available";
  }
  return installation.steamBuild === officialSteamBuild
    ? "current"
    : "available";
}

export function isServerUpdateAvailable(
  installation: ServerInstallationInfo | null | undefined,
  officialSteamBuild: string | null | undefined,
): boolean {
  return getServerUpdateState(installation, officialSteamBuild) === "available";
}
