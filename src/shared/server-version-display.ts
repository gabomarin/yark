import type { ServerInstallationInfo } from "./types";
import type { ServerUpdateState } from "./server-update-status";

/** ARK-style network/product versions like `92.28`, `v57.18` (not Steam `build 123`). */
export function isArkStyleVersion(value: string): boolean {
  return /^v?\d+(\.\d+)+$/i.test(value.trim());
}

/** Normalize ARK version strings for equality (`v92.28` ≡ `92.28`). */
export function normalizeArkVersionLabel(value: string): string {
  return value.trim().replace(/^v/i, "").toLowerCase();
}

/**
 * Compare ARK-style dotted versions (`92.47` vs `92.54`, optional `v` prefix).
 * Returns negative if `a` is behind `b`, positive if ahead, `0` if equal,
 * or `null` when either side is not an ARK-style version.
 */
export function compareArkVersionLabels(
  a: string,
  b: string,
): number | null {
  const left = normalizeArkVersionLabel(a);
  const right = normalizeArkVersionLabel(b);
  if (!isArkStyleVersion(left) || !isArkStyleVersion(right)) return null;

  const leftParts = left.split(".").map((part) => Number(part));
  const rightParts = right.split(".").map((part) => Number(part));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let i = 0; i < length; i += 1) {
    const l = leftParts[i] ?? 0;
    const r = rightParts[i] ?? 0;
    if (l !== r) return l - r;
  }
  return 0;
}

/**
 * Prefer a file/exe ARK-style build over log-derived `arkVersion`, so the UI
 * reflects SteamCMD updates before the next server boot rewrites the log.
 * Never surfaces Steam `build NNNNN` ids as the operator-facing version.
 */
export function resolveDisplayedServerVersion(
  installation:
    | Pick<ServerInstallationInfo, "arkVersion" | "build" | "version">
    | null
    | undefined,
): string | null {
  if (!installation) return null;
  const build = installation.build?.trim() || null;
  const arkVersion = installation.arkVersion?.trim() || null;
  const version = installation.version?.trim() || null;

  if (build !== null && isArkStyleVersion(build)) return build;
  if (arkVersion !== null && isArkStyleVersion(arkVersion)) return arkVersion;
  if (version !== null && isArkStyleVersion(version)) return version;
  return null;
}

export const VERSION_REFRESHES_ON_START_HINT =
  "Server is up to date. Version refreshes after you start the server.";

/**
 * When Steam build matches but the displayed ARK Version is still behind
 * Wildcard's informational official version, the label is likely from a prior
 * boot/log. Dedicated installs often ship ahead of officials during staggered
 * ASA rollouts — do not hint in that case (restart will not match official).
 */
export function shouldHintVersionRefreshesOnStart(input: {
  updateState: ServerUpdateState;
  localVersion: string | null | undefined;
  officialVersion: string | null | undefined;
}): boolean {
  if (input.updateState !== "current") return false;
  const local = input.localVersion?.trim() || null;
  const official = input.officialVersion?.trim() || null;
  if (local === null || official === null) return false;
  const order = compareArkVersionLabels(local, official);
  return order !== null && order < 0;
}
