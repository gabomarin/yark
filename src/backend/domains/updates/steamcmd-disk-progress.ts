/**
 * Progreso fiable sin depender del stdout bufferizado de SteamCMD:
 * 1) Tail de logs/console_log.txt (sin delay de pipe)
 * 2) BytesDownloaded/BytesToDownload en appmanifest de ESTA instalación
 * 3) Tamaño de steamapps/downloading bajo force_install_dir
 *
 * Nunca mide depotcache del home de SteamCMD (evita falsos positivos).
 */

import { open, readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ASA_APP_ID } from "./steamcmd-content-cache";

/** Tamaño típico del dedicated server ASA (~12.0 GiB). Se reemplaza si hay total real. */
export const ASA_DEDICATED_APPROX_BYTES = 12_838_814_817;

export interface DiskProgressSample {
  bytes: number;
  timedOut: boolean;
  pathsChecked: number;
}

export interface AppManifestProgress {
  bytesDownloaded: number | null;
  bytesToDownload: number | null;
  percent: number | null;
}

interface WalkOptions {
  maxMs: number;
  maxFiles: number;
}

export function steamCmdConsoleLogPath(steamCmdHome: string): string {
  return join(resolve(steamCmdHome), "logs", "console_log.txt");
}

export function appManifestPath(forceInstallDir: string, appId = ASA_APP_ID): string {
  return join(resolve(forceInstallDir), "steamapps", `appmanifest_${appId}.acf`);
}

/**
 * Lee BytesDownloaded / BytesToDownload del appmanifest de esta instalación.
 */
export function parseAppManifestProgress(manifestText: string): AppManifestProgress {
  const downloadedMatch = /"BytesDownloaded"\s+"(\d+)"/i.exec(manifestText);
  const toDownloadMatch = /"BytesToDownload"\s+"(\d+)"/i.exec(manifestText);
  // Algunos builds usan Staged / SizeOnDisk durante la descarga.
  const stagedMatch = /"BytesStaged"\s+"(\d+)"/i.exec(manifestText);
  const sizeOnDiskMatch = /"SizeOnDisk"\s+"(\d+)"/i.exec(manifestText);

  const bytesDownloaded = downloadedMatch
    ? Number(downloadedMatch[1])
    : stagedMatch
      ? Number(stagedMatch[1])
      : null;
  const bytesToDownload = toDownloadMatch
    ? Number(toDownloadMatch[1])
    : sizeOnDiskMatch
      ? Number(sizeOnDiskMatch[1])
      : null;

  const downloaded =
    bytesDownloaded !== null && Number.isFinite(bytesDownloaded) ? bytesDownloaded : null;
  const total =
    bytesToDownload !== null && Number.isFinite(bytesToDownload) && bytesToDownload > 0
      ? bytesToDownload
      : null;

  let percent: number | null = null;
  if (downloaded !== null && total !== null && total > 0) {
    percent = Math.max(0, Math.min(99.9, (downloaded / total) * 100));
  }

  return { bytesDownloaded: downloaded, bytesToDownload: total, percent };
}

export async function readInstallAppManifestProgress(
  forceInstallDir: string,
  appId = ASA_APP_ID,
): Promise<AppManifestProgress | null> {
  const path = appManifestPath(forceInstallDir, appId);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const text = await readFile(path, "utf8");
    return parseAppManifestProgress(text);
  } catch {
    return null;
  }
}

/**
 * Lee bytes nuevos de console_log.txt desde un offset (tail).
 * SteamCMD escribe aquí sin el buffering agresivo del pipe stdout.
 */
export async function readConsoleLogSince(
  steamCmdHome: string,
  offset: number,
): Promise<{ text: string; nextOffset: number }> {
  const path = steamCmdConsoleLogPath(steamCmdHome);
  if (!existsSync(path)) {
    return { text: "", nextOffset: offset };
  }

  let handle;
  try {
    handle = await open(path, "r");
    const info = await handle.stat();
    const size = info.size;
    // Log rotado/truncado
    const start = offset > size ? 0 : offset;
    if (size <= start) {
      await handle.close();
      return { text: "", nextOffset: size };
    }
    const length = size - start;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    await handle.close();
    return { text: buffer.toString("utf8"), nextOffset: size };
  } catch {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch {
        // ignore
      }
    }
    return { text: "", nextOffset: offset };
  }
}

export async function sumDirectoryBytes(
  rootDir: string,
  options: WalkOptions = { maxMs: 350, maxFiles: 25_000 },
): Promise<DiskProgressSample> {
  if (!existsSync(rootDir)) {
    return { bytes: 0, timedOut: false, pathsChecked: 0 };
  }

  const started = Date.now();
  let bytes = 0;
  let pathsChecked = 0;
  let timedOut = false;
  const stack: string[] = [rootDir];

  while (stack.length > 0) {
    if (Date.now() - started > options.maxMs || pathsChecked >= options.maxFiles) {
      timedOut = true;
      break;
    }

    const current = stack.pop()!;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      pathsChecked += 1;
      if (Date.now() - started > options.maxMs || pathsChecked >= options.maxFiles) {
        timedOut = true;
        break;
      }
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === "saved") {
          continue;
        }
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      try {
        const info = await stat(full);
        bytes += info.size;
      } catch {
        // ignore
      }
    }
  }

  return { bytes, timedOut, pathsChecked };
}

/** Solo downloading/temp bajo force_install_dir (esta instalación). */
export function installScopedDownloadWatchPaths(forceInstallDir: string): string[] {
  const root = resolve(forceInstallDir);
  const paths = [
    join(root, "steamapps", "downloading"),
    join(root, "steamapps", "temp"),
  ];
  return paths.filter((path) => existsSync(path));
}

export async function measureInstallDownloadingBytes(forceInstallDir: string): Promise<number> {
  const paths = installScopedDownloadWatchPaths(forceInstallDir);
  let total = 0;
  for (const path of paths) {
    const sample = await sumDirectoryBytes(path, { maxMs: 280, maxFiles: 20_000 });
    total += sample.bytes;
  }
  return total;
}

/** @deprecated usar measureInstallDownloadingBytes */
export async function measureInstallDirDownloadBytes(forceInstallDir: string): Promise<number> {
  return measureInstallDownloadingBytes(forceInstallDir);
}

export function estimateProgressFromDisk(
  bytesOnDisk: number,
  knownTotal: number | null,
  baselineBytes = 0,
): {
  percent: number;
  downloaded: number;
  total: number;
  deltaBytes: number;
} {
  const total =
    knownTotal !== null && knownTotal > 0 ? knownTotal : ASA_DEDICATED_APPROX_BYTES;
  const deltaBytes = Math.max(0, bytesOnDisk - baselineBytes);
  const downloaded = Math.max(0, Math.min(Math.max(bytesOnDisk, deltaBytes), total));
  const percent = Math.max(0, Math.min(99.5, (downloaded / total) * 100));
  return { percent, downloaded, total, deltaBytes };
}
