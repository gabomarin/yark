import { resolve } from "node:path";
import { statfs } from "node:fs/promises";
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
