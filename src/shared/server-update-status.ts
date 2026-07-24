import type { ServerInstallationInfo } from "./types";

export type ServerUpdateState = "available" | "current" | "unknown";

/**
 * Compara únicamente builds equivalentes de Steam.
 * `ARK Version` puede diferir entre el dedicated descargable y servidores
 * oficiales durante despliegues escalonados, por lo que no decide updates.
 */
export function getServerUpdateState(
  installation: ServerInstallationInfo | null | undefined,
): ServerUpdateState {
  if (installation?.installed !== true) {
    return "unknown";
  }
  if (
    installation.steamBuild == null
    || installation.officialSteamBuild == null
  ) {
    return "unknown";
  }
  return installation.steamBuild === installation.officialSteamBuild
    ? "current"
    : "available";
}

export function isServerUpdateAvailable(
  installation: ServerInstallationInfo | null | undefined,
): boolean {
  return getServerUpdateState(installation) === "available";
}
