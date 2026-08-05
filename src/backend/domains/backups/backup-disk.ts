import { dirname, resolve } from "node:path";
import { mkdir, statfs } from "node:fs/promises";
import { existsSync } from "node:fs";

export interface VolumeSpace {
  volumePath: string;
  freeBytes: number;
  totalBytes: number;
}

/** Windows drive root (`C:\`) or UNC share root; otherwise the path itself. */
export function volumeRootForPath(absPath: string): string {
  const resolved = resolve(absPath);
  const drive = /^([a-zA-Z]:)[\\/]/.exec(resolved);
  if (drive !== null) {
    return `${drive[1]}\\`;
  }
  const unc = /^(\\\\[^\\]+\\[^\\]+)/.exec(resolved);
  if (unc?.[1] !== undefined) {
    return unc[1];
  }
  return resolved;
}

function samePath(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase();
}

/**
 * Ensure the parent directory of `filePath` exists.
 * Skips creating Windows drive / UNC roots — `mkdir('H:\\')` throws EPERM even when the volume exists.
 */
export async function ensureParentDir(filePath: string): Promise<void> {
  const parent = dirname(resolve(filePath));
  if (existsSync(parent)) return;

  const volumeRoot = volumeRootForPath(parent);
  const missing: string[] = [];
  let cursor = parent;
  while (!existsSync(cursor) && !samePath(cursor, volumeRoot)) {
    missing.push(cursor);
    const next = dirname(cursor);
    if (samePath(next, cursor)) break;
    cursor = next;
  }

  if (!existsSync(volumeRoot) && missing.length > 0) {
    throw new Error(`Destination volume is unavailable: ${volumeRoot}`);
  }

  for (const dir of missing.reverse()) {
    try {
      await mkdir(dir);
    } catch (err) {
      const code =
        err !== null && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if ((code === "EEXIST" || code === "EPERM") && existsSync(dir)) {
        continue;
      }
      throw err;
    }
  }
}

/** True when the backup root exists or its parent can host a new folder. */
export function isBackupDestinationReachable(rootPath: string): boolean {
  if (existsSync(rootPath)) return true;
  const parent = resolve(rootPath, "..");
  return existsSync(parent);
}

export async function readVolumeSpace(anyPathOnVolume: string): Promise<VolumeSpace | null> {
  const volumePath = volumeRootForPath(anyPathOnVolume);
  const probe = existsSync(anyPathOnVolume)
    ? anyPathOnVolume
    : existsSync(volumePath)
      ? volumePath
      : null;
  if (probe === null) return null;
  try {
    const stats = await statfs(probe);
    const block = Number(stats.bsize);
    return {
      volumePath,
      freeBytes: Number(stats.bavail) * block,
      totalBytes: Number(stats.blocks) * block,
    };
  } catch {
    return null;
  }
}
