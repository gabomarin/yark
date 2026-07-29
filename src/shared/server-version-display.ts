import type { ServerInstallationInfo } from "./types";

/** ARK-style network/product versions like `92.28`, `v57.18` (not Steam `build 123`). */
export function isArkStyleVersion(value: string): boolean {
  return /^v?\d+(\.\d+)+$/i.test(value.trim());
}

/**
 * Prefer a file/exe ARK-style build over log-derived `arkVersion`, so the UI
 * reflects SteamCMD updates before the next server boot rewrites the log.
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
  if (build !== null) return build;
  return version;
}
