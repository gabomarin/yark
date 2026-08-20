/** YARK desktop self-update status (distinct from ASA/SteamCMD updates). */

const YARK_GITHUB_OWNER = "gabomarin";
const YARK_GITHUB_REPO = "yark";
export const YARK_RELEASES_URL = `https://github.com/${YARK_GITHUB_OWNER}/${YARK_GITHUB_REPO}/releases`;
/** List endpoint — `/releases/latest` 404s while every published tag is a GitHub prerelease (0.x). */
export const YARK_RELEASES_API =
  `https://api.github.com/repos/${YARK_GITHUB_OWNER}/${YARK_GITHUB_REPO}/releases`;

export interface GithubReleaseRef {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

/**
 * While YARK is still `0.x`, GitHub marks every release as prerelease (release workflow).
 * Accept those until the installed app is `1.0.0+`, then require non-prerelease only.
 */
export function allowsPrereleaseUpdates(currentVersion: string): boolean {
  const core = stripVersionPrefix(currentVersion).split("-")[0] ?? "0";
  const major = Number.parseInt(core.split(".")[0] ?? "0", 10);
  return !Number.isFinite(major) || major < 1;
}

/**
 * Pick the newest published release that the current app is allowed to follow.
 * Prefer SemVer order over API list order.
 */
export function pickNewestAllowedRelease(
  releases: GithubReleaseRef[],
  currentVersion: string,
): GithubReleaseRef | null {
  const allowPrerelease = allowsPrereleaseUpdates(currentVersion);
  let best: GithubReleaseRef | null = null;
  let bestVersion = "";
  for (const release of releases) {
    if (release.draft === true) continue;
    if (!allowPrerelease && release.prerelease === true) continue;
    const tag = release.tag_name;
    if (typeof tag !== "string" || tag.trim() === "") continue;
    const version = parseReleaseVersion(tag);
    if (version === null) continue;
    if (best === null || compareSemver(version, bestVersion) > 0) {
      best = release;
      bestVersion = version;
    }
  }
  return best;
}

export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "error";

/**
 * Why Restart and install is disabled.
 * `null` means install is allowed (packaged + downloaded + safety gates clear).
 */
export type AppUpdateInstallBlockReason =
  | "dev"
  | "not-ready"
  | "servers-running"
  | "critical-job"
  | "operation-in-progress";

export interface AppUpdateStatus {
  phase: AppUpdatePhase;
  currentVersion: string;
  availableVersion: string | null;
  /** Download progress 0–100 while phase is downloading. */
  percent: number | null;
  error: string | null;
  isPackaged: boolean;
  releasePageUrl: string;
  /** Specific release page when a newer version is known. */
  releaseNotesUrl: string | null;
  installBlockedReason: AppUpdateInstallBlockReason | null;
  installBlockedMessage: string | null;
}

export function stripVersionPrefix(version: string): string {
  const trimmed = version.trim();
  return trimmed.startsWith("v") || trimmed.startsWith("V")
    ? trimmed.slice(1)
    : trimmed;
}

/**
 * Strip an optional `v`/`V` prefix and require a non-empty version body.
 * Tags that are only `"v"` / `"V"` (or whitespace) are rejected.
 */
export function parseReleaseVersion(version: string): string | null {
  const stripped = stripVersionPrefix(version);
  return stripped.length > 0 ? stripped : null;
}

/**
 * Compare SemVer-ish strings (optional leading `v`, optional prerelease suffix).
 * Returns negative if `a < b`, 0 if equal, positive if `a > b`.
 * Prerelease identifiers follow SemVer rules (numeric vs alphanumeric, dotted parts).
 */
export function compareSemver(a: string, b: string): number {
  const left = stripVersionPrefix(a);
  const right = stripVersionPrefix(b);
  const leftDash = left.indexOf("-");
  const rightDash = right.indexOf("-");
  const leftCore = leftDash === -1 ? left : left.slice(0, leftDash);
  const rightCore = rightDash === -1 ? right : right.slice(0, rightDash);
  const leftPre = leftDash === -1 ? "" : left.slice(leftDash + 1);
  const rightPre = rightDash === -1 ? "" : right.slice(rightDash + 1);
  const leftParts = leftCore.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = rightCore.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < len; i += 1) {
    const l = leftParts[i] ?? 0;
    const r = rightParts[i] ?? 0;
    if (l !== r) return l - r;
  }
  return comparePrereleaseIdentifiers(leftPre, rightPre);
}

function comparePrereleaseIdentifiers(left: string, right: string): number {
  if (left === right) return 0;
  if (left === "") return 1;
  if (right === "") return -1;
  const leftIds = left.split(".");
  const rightIds = right.split(".");
  const len = Math.max(leftIds.length, rightIds.length);
  for (let i = 0; i < len; i += 1) {
    const l = leftIds[i];
    const r = rightIds[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    if (lNumeric && rNumeric) {
      const diff = Number(l) - Number(r);
      if (diff !== 0) return diff;
      continue;
    }
    if (lNumeric !== rNumeric) return lNumeric ? -1 : 1;
    const cmp = l.localeCompare(r);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/** True while a download is in flight or waiting for Restart and install. */
export function isAppUpdateInFlight(phase: AppUpdatePhase): boolean {
  return phase === "downloading" || phase === "ready";
}

/**
 * Keep downloading/ready across a later check when the remote version is the
 * same or older. A newer remote version should still replace the in-flight state.
 */
export function shouldPreserveAppUpdateProgress(
  phase: AppUpdatePhase,
  availableVersion: string | null,
  remoteVersion: string,
): boolean {
  if (!isAppUpdateInFlight(phase)) return false;
  if (availableVersion === null || availableVersion.trim() === "") return true;
  return compareSemver(remoteVersion, availableVersion) <= 0;
}

export function installBlockMessage(
  reason: AppUpdateInstallBlockReason | null,
): string | null {
  switch (reason) {
    case "dev":
      return "Install is only available in the packaged Windows app. Use a GitHub Release build.";
    case "not-ready":
      return "Download the update before restarting to install.";
    case "servers-running":
      return "Stop all ARK servers before installing a YARK update.";
    case "critical-job":
      return "Wait for SteamCMD or backup jobs to finish before installing.";
    case "operation-in-progress":
      return "Wait for the active server operation to finish before installing.";
    default:
      return null;
  }
}

export function createIdleAppUpdateStatus(
  currentVersion: string,
  isPackaged: boolean,
): AppUpdateStatus {
  return {
    phase: "idle",
    currentVersion,
    availableVersion: null,
    percent: null,
    error: null,
    isPackaged,
    releasePageUrl: YARK_RELEASES_URL,
    releaseNotesUrl: null,
    installBlockedReason: isPackaged ? "not-ready" : "dev",
    installBlockedMessage: installBlockMessage(isPackaged ? "not-ready" : "dev"),
  };
}
