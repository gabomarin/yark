/**
 * SteamCMD cache paths and sync for multi-server ASA installs.
 * - depotcache: compressed downloads next to steamcmd.exe (network reuse)
 * - asa_content_cache: shared install copied to each server (disk reuse)
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const ASA_APP_ID = "2430930";

/** Server folders that must not be overwritten when syncing from the cache. */
export const ASA_CONTENT_SYNC_EXCLUDE_DIRS = ["ShooterGame\\Saved"] as const;

/** How long a content cache already updated in this session is reused. */
export const CONTENT_CACHE_FRESH_MS = 15 * 60 * 1000;

export class OperationCancelledError extends Error {
  constructor(message = "Operation cancelled by the user") {
    super(message);
    this.name = "OperationCancelledError";
  }
}

export function isOperationCancelledError(error: unknown): boolean {
  return (
    error instanceof OperationCancelledError
    || (error instanceof Error && error.name === "OperationCancelledError")
  );
}

export function resolveSteamCmdHome(steamcmdExe: string): string {
  const trimmed = steamcmdExe.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === "steamcmd.exe") {
    return process.cwd();
  }
  return dirname(resolve(trimmed));
}

export function resolveDepotCacheDir(steamCmdHome: string): string {
  return join(steamCmdHome, "steamapps", "depotcache");
}

export function resolveAsaContentCacheDir(steamCmdHome: string): string {
  return join(steamCmdHome, "asa_content_cache");
}

export function asaAppManifestPath(installOrCacheDir: string): string {
  return join(installOrCacheDir, "steamapps", `appmanifest_${ASA_APP_ID}.acf`);
}

/** Reads `"buildid"` from an ASA appmanifest, if present. */
export function readAsaManifestBuildId(installOrCacheDir: string): string | null {
  const manifestPath = asaAppManifestPath(installOrCacheDir);
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    const content = readFileSync(manifestPath, "utf8");
    const buildId = content.match(/"buildid"\s+"([^"]+)"/i)?.[1]?.trim() ?? "";
    return buildId.length > 0 ? buildId : null;
  } catch {
    return null;
  }
}

/**
 * True only when cache and install are the same directory (nothing to copy).
 * Matching Steam buildids alone are not enough: the install tree can still be
 * missing or corrupted, so robocopy must still run for distinct paths.
 */
export function canSkipAsaContentSync(cacheDir: string, installDir: string): boolean {
  const source = resolve(cacheDir);
  const dest = resolve(installDir);
  return source.toLowerCase() === dest.toLowerCase();
}

/**
 * Order required by modern SteamCMD: force_install_dir before login.
 */
export function buildSteamCmdAppUpdateArgs(installDir: string): string[] {
  return [
    "+force_install_dir",
    installDir,
    "+login",
    "anonymous",
    "+app_update",
    ASA_APP_ID,
    "validate",
    "+quit",
  ];
}

export function isContentCacheFresh(
  cacheDir: string,
  updatedAtMs: number,
  nowMs = Date.now(),
  freshMs = CONTENT_CACHE_FRESH_MS,
): boolean {
  if (updatedAtMs <= 0) {
    return false;
  }
  if (!existsSync(asaAppManifestPath(cacheDir))) {
    return false;
  }
  return nowMs - updatedAtMs < freshMs;
}

export function shouldReuseAsaContentCache(
  operation: "install-files" | "update" | "verify-files",
  cacheDir: string,
  updatedAtMs: number,
): boolean {
  // An explicit update/verify action must always query Steam.
  // The freshness window only avoids repeated downloads when installing other servers.
  return operation === "install-files" && isContentCacheFresh(cacheDir, updatedAtMs);
}

export function isRobocopySuccess(exitCode: number | null): boolean {
  // Robocopy: 0–7 = success with varying copy degrees; >= 8 = error.
  const code = exitCode ?? 16;
  return code >= 0 && code < 8;
}

export interface SyncAsaContentOptions {
  onSpawn?: (child: ChildProcess) => void;
  isCancelled?: () => boolean;
}

/**
 * Copies the shared install to the server directory,
 * preserving ShooterGame\Saved (worlds, INI, players).
 */
export async function syncAsaContentCacheToInstallDir(
  cacheDir: string,
  installDir: string,
  options: SyncAsaContentOptions = {},
): Promise<number> {
  const source = resolve(cacheDir);
  const dest = resolve(installDir);
  if (source.toLowerCase() === dest.toLowerCase()) {
    return 0;
  }

  return await new Promise<number>((resolvePromise, reject) => {
    if (options.isCancelled?.() === true) {
      reject(new OperationCancelledError());
      return;
    }

    const args = [
      source,
      dest,
      "/E",
      "/XD",
      ...ASA_CONTENT_SYNC_EXCLUDE_DIRS,
      "/R:2",
      "/W:2",
      "/MT:8",
      "/NFL",
      "/NDL",
      "/NJH",
      "/NJS",
      "/nc",
      "/ns",
      "/np",
    ];
    const child = spawn("robocopy.exe", args, {
      windowsHide: true,
      shell: false,
    });
    options.onSpawn?.(child);

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.once("error", (error) => {
      reject(
        new Error(
          `Could not run robocopy to sync ASA cache: ${error.message}`,
        ),
      );
    });

    child.once("exit", (code) => {
      if (options.isCancelled?.() === true) {
        reject(new OperationCancelledError());
        return;
      }
      const exitCode = code ?? 16;
      if (!isRobocopySuccess(exitCode)) {
        reject(
          new Error(
            `ASA cache sync failed (robocopy exit ${exitCode})${
              stderr.trim().length > 0 ? `: ${stderr.trim()}` : ""
            }`,
          ),
        );
        return;
      }
      resolvePromise(exitCode);
    });
  });
}
