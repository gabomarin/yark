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
  if (arkVersion !== null) return arkVersion;
  if (version !== null && isArkStyleVersion(version)) return version;
  return null;
}

export const VERSION_REFRESHES_ON_START_HINT =
  "Server is up to date. Version refreshes after you start the server.";

/**
 * When Steam build matches but the displayed ARK Version differs from Wildcard's
 * informational official version, the label is likely from a prior boot/log.
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
  return normalizeArkVersionLabel(local) !== normalizeArkVersionLabel(official);
}
