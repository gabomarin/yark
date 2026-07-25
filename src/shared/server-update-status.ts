import type { ServerInstallationInfo } from "./types";

export type ServerUpdateState = "available" | "current" | "unknown";

/**
 * Compares only equivalent Steam builds.
 * `ARK Version` can differ between the downloadable dedicated and official
 * servers during staggered rollouts, so it does not decide updates.
 */
export function getServerUpdateState(
  installation: ServerInstallationInfo | null | undefined,
  officialSteamBuild: string | null | undefined,
): ServerUpdateState {
  if (installation?.installed !== true) {
    return "unknown";
  }
  if (
    installation.steamBuild == null
    || officialSteamBuild == null
  ) {
    return "unknown";
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
