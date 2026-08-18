/**
 * SteamCMD cache paths and sync for multi-server ASA installs.
 * - depotcache: compressed downloads next to steamcmd.exe (network reuse)
 * - asa_content_cache: shared install copied to each server (disk reuse)
 */

import type { ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { SteamCmdCacheKind } from "../../../shared/types";
import {
  DEFAULT_ROBOCOPY_THREADS,
  isOperationCancelledError,
  isOperationPausedError,
  isRobocopySuccess,
  OperationCancelledError,
  OperationPausedError,
  robocopyTree,
} from "./robocopy-tree";

/** Threads for robocopy — leave disk headroom so Electron stays responsive. */
export const ASA_CONTENT_SYNC_ROBOCOPY_THREADS = DEFAULT_ROBOCOPY_THREADS;

export const ASA_APP_ID = "2430930";

/** Server folders that must not be overwritten when syncing from the cache. */
export const ASA_CONTENT_SYNC_EXCLUDE_DIRS = ["ShooterGame\\Saved"] as const;

/** How long a content cache already updated in this session is reused. */
export const CONTENT_CACHE_FRESH_MS = 15 * 60 * 1000;

export {
  OperationCancelledError,
  OperationPausedError,
  isOperationCancelledError,
  isOperationPausedError,
  isRobocopySuccess,
};

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

export function resolveSteamCmdCacheDir(
  steamCmdHome: string,
  kind: SteamCmdCacheKind,
): string {
  return kind === "depot"
    ? resolveDepotCacheDir(steamCmdHome)
    : resolveAsaContentCacheDir(steamCmdHome);
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

/** Shared argv prefix for every steamcmd.exe spawn. */
export const STEAMCMD_ENGLISH_ARGS = ["-language", "english"] as const;

/**
 * Env overrides so SteamCMD prefers English even when the OS UI is not.
 * Best-effort on Windows (bootstrapper may still follow UI language until -language applies).
 */
export function steamCmdSpawnEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    LANGUAGE: "en_US:en",
    // Best-effort; recent builds may ignore it.
    STEAMCMD_OUTPUT_BUFFERS: "0",
  };
}

/**
 * Order required by modern SteamCMD: force_install_dir before login.
 * `-language english` keeps bootstrapper/progress text English so we do not
 * need a multilingual parser (Windows UI language otherwise localizes SteamCMD).
 */
export function buildSteamCmdAppUpdateArgs(installDir: string): string[] {
  return [
    ...STEAMCMD_ENGLISH_ARGS,
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
  return robocopyTree(cacheDir, installDir, {
    excludeDirs: ASA_CONTENT_SYNC_EXCLUDE_DIRS,
    onSpawn: options.onSpawn,
    isCancelled: options.isCancelled,
    operationLabel: "ASA cache sync",
  });
}
