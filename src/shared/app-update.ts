/** YARK desktop self-update status (distinct from ASA/SteamCMD updates). */

export const YARK_GITHUB_OWNER = "gabomarin";
export const YARK_GITHUB_REPO = "yark";
export const YARK_RELEASES_URL = `https://github.com/${YARK_GITHUB_OWNER}/${YARK_GITHUB_REPO}/releases`;
/** List endpoint — `/releases/latest` 404s while every published tag is a GitHub prerelease (0.x). */
export const YARK_RELEASES_API =
  `https://api.github.com/repos/${YARK_GITHUB_OWNER}/${YARK_GITHUB_REPO}/releases`;
export const YARK_LATEST_RELEASE_API = `${YARK_RELEASES_API}/latest`;

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
 */
export function compareSemver(a: string, b: string): number {
  const left = stripVersionPrefix(a);
  const right = stripVersionPrefix(b);
  const leftSplit = left.split("-");
  const rightSplit = right.split("-");
  const leftCore = leftSplit[0] ?? "";
  const rightCore = rightSplit[0] ?? "";
  const leftPre = leftSplit[1] ?? "";
  const rightPre = rightSplit[1] ?? "";
  const leftParts = leftCore.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = rightCore.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < len; i += 1) {
    const l = leftParts[i] ?? 0;
    const r = rightParts[i] ?? 0;
    if (l !== r) return l - r;
  }
  if (leftPre === rightPre) return 0;
  if (leftPre === "") return 1;
  if (rightPre === "") return -1;
  return leftPre.localeCompare(rightPre);
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
