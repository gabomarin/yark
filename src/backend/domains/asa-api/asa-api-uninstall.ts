import { existsSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { AsaApiStatus } from "@shared/types";
import { asaWin64Dir } from "./asa-api-paths";
import { readAsaApiStatus } from "./asa-api-status";

/**
 * Root files shipped by AsaApi / VersionLoader extracts (and YARK’s parked DLL).
 * Never include game binaries (ArkAscendedServer.exe, etc.).
 */
const ASA_API_UNINSTALL_ROOT_FILES = [
  "AsaApiLoader.exe",
  "AsaApiLoader.pdb",
  "Version.dll",
  "Version.dll.yark-off",
  "Version.pdb",
  "libcrypto-3-x64.dll",
  "libssl-3-x64.dll",
  "msdia140.dll",
  "msvcp140.dll",
] as const;

/** Root folders owned by the AsaApi layout under Win64. */
const ASA_API_UNINSTALL_ROOT_DIRS = [
  "ArkApi",
  "Lib",
  // Leftover from brief Win64\Disabled_Plugins layout (now under ArkApi\).
  "Disabled_Plugins",
] as const;

function looksLikeAsaApiConfigJson(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as {
      settings?: Record<string, unknown>;
    };
    const settings = parsed.settings;
    if (settings === null || typeof settings !== "object") return false;
    return (
      "AutomaticPluginReloading" in settings ||
      "AttachToParent" in settings ||
      "AutomaticCacheDownload" in settings
    );
  } catch {
    return false;
  }
}

async function removePath(target: string): Promise<void> {
  if (!existsSync(target)) return;
  await rm(target, { recursive: true, force: true });
}

/**
 * Remove community AsaApi / Version.dll / plugins from Win64, leaving the ASA
 * dedicated binary and Steam files intact. Does not change profile flags —
 * callers clear `useAsaApi` / `useAsaApiLoader`.
 */
export async function uninstallAsaApiFromInstall(
  installDir: string,
): Promise<AsaApiStatus> {
  const win64 = asaWin64Dir(installDir);
  if (!existsSync(win64)) {
    return readAsaApiStatus(installDir);
  }

  for (const name of ASA_API_UNINSTALL_ROOT_FILES) {
    await removePath(join(win64, name));
  }
  for (const name of ASA_API_UNINSTALL_ROOT_DIRS) {
    await removePath(join(win64, name));
  }

  const configPath = join(win64, "config.json");
  if (existsSync(configPath)) {
    try {
      const raw = await readFile(configPath, "utf8");
      if (looksLikeAsaApiConfigJson(raw)) {
        await removePath(configPath);
      }
    } catch {
      // Leave unknown/unreadable config.json alone.
    }
  }

  // AsaApi log path variants under Win64 (community docs differ slightly).
  await removePath(join(win64, "logs", "ArkApi.log"));
  const logsDir = join(win64, "logs");
  if (existsSync(logsDir)) {
    try {
      const left = await readdir(logsDir);
      if (left.length === 0) {
        await removePath(logsDir);
      }
    } catch {
      // best-effort
    }
  }

  return readAsaApiStatus(installDir);
}
