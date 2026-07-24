/**
 * Rutas y sync de caché SteamCMD para instalaciones ASA multi-servidor.
 * - depotcache: descargas comprimidas junto a steamcmd.exe (reuso de red)
 * - asa_content_cache: instalación compartida que se copia a cada server (reuso de disco)
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const ASA_APP_ID = "2430930";

/** Carpetas del servidor que no deben sobrescribirse al sincronizar desde la caché. */
export const ASA_CONTENT_SYNC_EXCLUDE_DIRS = ["ShooterGame\\Saved"] as const;

/** Tiempo durante el cual se reutiliza una caché de contenido ya actualizada en esta sesión. */
export const CONTENT_CACHE_FRESH_MS = 15 * 60 * 1000;

export class OperationCancelledError extends Error {
  constructor(message = "Operación cancelada por el usuario") {
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

/**
 * Orden requerido por SteamCMD moderno: force_install_dir antes de login.
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

export function isRobocopySuccess(exitCode: number | null): boolean {
  // Robocopy: 0–7 = éxito con distintos grados de copia; >= 8 = error.
  const code = exitCode ?? 16;
  return code >= 0 && code < 8;
}

export interface SyncAsaContentOptions {
  onSpawn?: (child: ChildProcess) => void;
  isCancelled?: () => boolean;
}

/**
 * Copia la instalación compartida al directorio del servidor,
 * preservando ShooterGame\Saved (mundos, INI, jugadores).
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
          `No se pudo ejecutar robocopy para sincronizar caché ASA: ${error.message}`,
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
            `Falló la sincronización de caché ASA (robocopy exit ${exitCode})${
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
