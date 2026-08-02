import type { InstallationHealthStatus, ServerInstallationInfo } from "./types";

/** Stable reason codes produced by the install-health classifier. */
export type InstallationHealthReasonCode =
  | "path_empty"
  | "path_missing"
  | "path_not_directory"
  | "path_eacces"
  | "dir_eacces"
  | "dir_empty"
  | "asa_markers_absent"
  | "exe_absent"
  | "exe_empty"
  | "partial_tree"
  | "io_error"
  | "ready";

const GUIDANCE_BY_REASON: Record<InstallationHealthReasonCode, string> = {
  path_empty: "Set a valid Windows install folder on the server profile.",
  path_missing: "Create the folder or correct the install path, then install server files.",
  path_not_directory: "Point the profile at an install directory, not a file.",
  path_eacces: "Fix folder permissions or run YARK with access to the install path.",
  dir_eacces: "Fix folder permissions so YARK can read the install directory.",
  dir_empty: "Install ASA server files into this empty folder with Install / SteamCMD.",
  asa_markers_absent: "Install ASA server files into this folder with Install / SteamCMD.",
  exe_absent: "Run Install or Verify — ArkAscendedServer.exe is missing.",
  exe_empty: "Reinstall or Verify — the server executable is empty or corrupt.",
  partial_tree: "Run Install or Verify to finish the incomplete ASA installation.",
  io_error: "Retry the install check. If it keeps failing, inspect disk and path access.",
  ready: "Installation looks ready to start.",
};

const LABEL_BY_HEALTH: Record<InstallationHealthStatus, string> = {
  ready: "Ready",
  missing: "Missing path",
  empty: "Empty folder",
  incomplete: "Incomplete",
  inaccessible: "Inaccessible",
  suspicious: "Needs review",
  unknown: "Checking…",
};

/** Rank for degradation detection — lower is healthier. `unknown` is unscored. */
const HEALTH_RANK: Record<InstallationHealthStatus, number> = {
  ready: 0,
  empty: 1,
  incomplete: 2,
  missing: 2,
  suspicious: 3,
  inaccessible: 3,
  unknown: -1,
};

export function isInstallationReady(
  info: ServerInstallationInfo | null | undefined,
): boolean {
  if (info == null) {
    return false;
  }
  if (info.health != null) {
    return info.health === "ready";
  }
  return info.installed === true;
}

export function installationHealthLabel(
  health: InstallationHealthStatus | null | undefined,
): string {
  if (health == null) {
    return LABEL_BY_HEALTH.unknown;
  }
  return LABEL_BY_HEALTH[health];
}

export function guidanceForReasonCodes(
  reasonCodes: ReadonlyArray<string>,
): string {
  for (const code of reasonCodes) {
    if (code in GUIDANCE_BY_REASON) {
      return GUIDANCE_BY_REASON[code as InstallationHealthReasonCode];
    }
  }
  return GUIDANCE_BY_REASON.io_error;
}

export function isActionableInstallHealth(
  health: InstallationHealthStatus,
): boolean {
  return (
    health === "missing" ||
    health === "empty" ||
    health === "incomplete" ||
    health === "inaccessible" ||
    health === "suspicious"
  );
}

/**
 * True when health got worse vs a previously classified state.
 * Skips first observation (`previous` null/unknown) to avoid startup spam.
 */
export function isInstallHealthDegradation(
  previous: InstallationHealthStatus | null | undefined,
  next: InstallationHealthStatus,
): boolean {
  if (previous == null || previous === "unknown") {
    return false;
  }
  if (!isActionableInstallHealth(next)) {
    return false;
  }
  const prevRank = HEALTH_RANK[previous];
  const nextRank = HEALTH_RANK[next];
  if (prevRank < 0 || nextRank < 0) {
    return false;
  }
  return nextRank > prevRank || (previous === "ready" && next !== "ready");
}

export function buildInstallationHealthFields(
  health: InstallationHealthStatus,
  reasonCodes: ReadonlyArray<InstallationHealthReasonCode>,
): Pick<ServerInstallationInfo, "health" | "reasonCodes" | "guidance" | "installed"> {
  return {
    health,
    reasonCodes: [...reasonCodes],
    guidance: guidanceForReasonCodes(reasonCodes),
    installed: health === "ready",
  };
}
