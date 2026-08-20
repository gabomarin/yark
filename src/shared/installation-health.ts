import type { InstallationHealthStatus, ServerInstallationInfo } from "./types";

/** Stable reason codes produced by the install-health classifier. */
export type InstallationHealthReasonCode =
  | "path_empty"
  | "path_missing"
  | "path_not_directory"
  | "path_eacces"
  | "dir_eacces"
  | "dir_empty"
  | "foreign_contents"
  | "asa_markers_absent"
  | "exe_absent"
  | "exe_empty"
  | "exe_not_file"
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
  foreign_contents: "Point the profile at a real ASA server install.",
  asa_markers_absent: "Point the profile at a real ASA server install.",
  exe_absent: "Run Install or Verify — ArkAscendedServer.exe is missing.",
  exe_empty: "Reinstall or Verify — the server executable is empty or corrupt.",
  exe_not_file:
    "ArkAscendedServer.exe is not a normal file. Clear or repair that path, then Install or Verify.",
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
  unknown: "Check failed",
};

/** Rank for degradation detection — lower is healthier. */
const HEALTH_RANK: Record<InstallationHealthStatus, number> = {
  ready: 0,
  empty: 1,
  incomplete: 2,
  missing: 2,
  suspicious: 3,
  inaccessible: 3,
  unknown: 3,
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

/** Healths where Install/SteamCMD into the path is a reasonable CTA. */
export function isInstallOfferHealth(
  health: InstallationHealthStatus | null | undefined,
): boolean {
  return health === "missing" || health === "empty" || health === "incomplete";
}

export function installationHealthLabel(
  health: InstallationHealthStatus | null | undefined,
): string {
  if (health == null) {
    return "Checking…";
  }
  return LABEL_BY_HEALTH[health];
}

/** Compact local timestamp for last install-health check. */
export function formatInstallationCheckedAt(
  checkedAt: string | null | undefined,
): string {
  if (checkedAt == null || checkedAt.trim() === "") {
    return "—";
  }
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

export function guidanceForReasonCodes(
  reasonCodes: ReadonlyArray<string>,
): string {
  for (const code of reasonCodes) {
    if (Object.prototype.hasOwnProperty.call(GUIDANCE_BY_REASON, code)) {
      return GUIDANCE_BY_REASON[code as InstallationHealthReasonCode];
    }
  }
  return GUIDANCE_BY_REASON.io_error;
}

function isActionableInstallHealth(
  health: InstallationHealthStatus,
): boolean {
  return health !== "ready";
}

/**
 * True when health got worse vs a previously classified state.
 * Skips first observation (`previous` null) to avoid startup spam.
 */
export function isInstallHealthDegradation(
  previous: InstallationHealthStatus | null | undefined,
  next: InstallationHealthStatus,
): boolean {
  if (previous == null) {
    return false;
  }
  if (!isActionableInstallHealth(next)) {
    return false;
  }
  if (previous === "ready" && next !== "ready") {
    return true;
  }
  const prevRank = HEALTH_RANK[previous];
  const nextRank = HEALTH_RANK[next];
  return nextRank > prevRank;
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
