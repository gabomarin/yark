import { join } from "node:path";

/** Win64 binaries folder under an ASA install root. */
export function asaWin64Dir(installDir: string): string {
  return join(installDir, "ShooterGame", "Binaries", "Win64");
}

/** Path to AsaApiLoader.exe next to ArkAscendedServer.exe. */
export function asaApiLoaderPath(installDir: string): string {
  return join(asaWin64Dir(installDir), "AsaApiLoader.exe");
}

/**
 * DLL side-load entry from ArkServerApi/AsaApiLoader `VersionLoader.zip`.
 * Windows loads this when starting ArkAscendedServer.exe (case-insensitive).
 */
export function asaApiVersionDllPath(installDir: string): string {
  return join(asaWin64Dir(installDir), "Version.dll");
}

/** YARK-renamed Version.dll so Start without AsaApi (or loader mode) does not inject. */
export function asaApiVersionDllDisabledPath(installDir: string): string {
  return join(asaWin64Dir(installDir), "Version.dll.yark-off");
}

/** Core API binary under ArkApi\. */
export function asaApiCoreDllPath(installDir: string): string {
  return join(asaWin64Dir(installDir), "ArkApi", "AsaApi.dll");
}

/** Native plugins root (`…\Win64\ArkApi\Plugins`). */
export function asaApiPluginsDir(installDir: string): string {
  return join(asaWin64Dir(installDir), "ArkApi", "Plugins");
}

/**
 * Parked plugins — sibling of `Plugins` under ArkApi so AsaApi does not
 * auto-load them (`…\Win64\ArkApi\Disabled_Plugins`).
 */
export function asaApiDisabledPluginsDir(installDir: string): string {
  return join(asaWin64Dir(installDir), "ArkApi", "Disabled_Plugins");
}

/**
 * Brief earlier layout: parked next to ArkApi under Win64. Migrated on read/toggle.
 */
export function asaApiLegacyWin64DisabledPluginsDir(installDir: string): string {
  return join(asaWin64Dir(installDir), "Disabled_Plugins");
}

export const ASA_API_GITHUB_OWNER = "ArkServerApi";
export const ASA_API_GITHUB_REPO = "AsaApi";
export const ASA_API_LOADER_GITHUB_REPO = "AsaApiLoader";
const ASA_API_RELEASES_API = `https://api.github.com/repos/${ASA_API_GITHUB_OWNER}/${ASA_API_GITHUB_REPO}/releases`;
export const ASA_API_RELEASES_LATEST = `${ASA_API_RELEASES_API}/latest`;
export const ASA_API_VERSION_LOADER_RELEASES_LATEST = `https://api.github.com/repos/${ASA_API_GITHUB_OWNER}/${ASA_API_LOADER_GITHUB_REPO}/releases/latest`;

/**
 * Legacy YARK suffix under Plugins (pre–Disabled_Plugins). Migrated on read/toggle.
 */
export const ASA_API_PLUGIN_DISABLED_SUFFIX = ".disabled";
