import { dirname } from "node:path";
import { isSafeMapToken, isSafeWindowsFolderName } from "@shared/map-identity";
import { MAP_NAME_COPY } from "@shared/map-name-copy";
import {
  isAntiCorruptionWorldSaveName,
  isPrimaryWorldSaveName,
  isWorldProfileOrTribeName,
} from "./world-snapshot";

/**
 * Prefer an existing/live or manifest folder name over inventing a strip-`_WP`
 * guess that would break official maps (wipe / first restore).
 */
export function preferredWorldMapRestoreFolderName(options: {
  mapToken: string;
  mapSaveFolder?: string | null;
  mapFolderName?: string | null;
}): string | null {
  const token = options.mapToken.trim();
  if (!isSafeMapToken(token)) return null;
  const picks = [options.mapSaveFolder, options.mapFolderName, token];
  for (const pick of picks) {
    const name = pick?.trim() ?? "";
    if (name.length === 0) continue;
    if (!isSafeWindowsFolderName(name)) continue;
    return name;
  }
  return null;
}

/**
 * Resolve which map-folder name under backup SavedArks to apply.
 * Callers supply directory listing / existence so this stays pure (#146).
 */
export function resolveWorldRestoreMapToken(input: {
  backupMapToken: string | null;
  serverMap: string;
  /** Whether `SavedArks/{serverMap}` exists on the archive side. */
  serverMapPathExists: boolean;
  /** Traversable directory names under backup SavedArks. */
  backupSavedDirNames: string[];
}): string {
  if (input.backupMapToken !== null && isSafeMapToken(input.backupMapToken)) {
    return input.backupMapToken.trim();
  }
  const serverMap = input.serverMap.trim();
  if (isSafeMapToken(serverMap) && input.serverMapPathExists) {
    return serverMap;
  }
  const dirs = input.backupSavedDirNames;
  if (dirs.length === 1 && isSafeMapToken(dirs[0])) {
    return dirs[0]!;
  }
  if (isSafeMapToken(serverMap)) {
    return serverMap;
  }
  throw new Error(MAP_NAME_COPY.worldBackupUnresolved);
}

/** Whether a world-archive file should be copied onto the live map folder. */
export function shouldCopyWorldRestoreFile(options: {
  fileName: string;
  mapToken: string;
  restoreProfilesTribes: boolean;
}): boolean {
  const name = options.fileName;
  if (!options.restoreProfilesTribes && isWorldProfileOrTribeName(name)) {
    return false;
  }
  // Always allow primary + anti-corruption; skip dated/transient if somehow present.
  if (
    isWorldProfileOrTribeName(name)
    || isPrimaryWorldSaveName(name)
    || isAntiCorruptionWorldSaveName(name, options.mapToken)
    || name.toLowerCase().endsWith(".ark.bak")
  ) {
    return true;
  }
  const lower = name.toLowerCase();
  if (lower.endsWith(".arkrbf") || lower.endsWith(".tmp")) return false;
  if (lower.endsWith(".ark") && !isPrimaryWorldSaveName(name)) return false;
  return true;
}

/**
 * Validate flat PlayerProfiles layout before copying onto the live install.
 * Throws the same operator-facing messages as the previous inline checks.
 */
export function assertPlayersRestoreArchiveLayout(input: {
  hasPlayerProfilesRoot: boolean;
  hasSavedArksAtBackupRoot: boolean;
  /** Relative paths under PlayerProfiles (empty array when root missing). */
  relativePathsUnderPlayerProfiles: string[];
}): void {
  if (!input.hasPlayerProfilesRoot) {
    if (input.hasSavedArksAtBackupRoot) {
      throw new Error(
        "This player archive uses a legacy nested layout and cannot be restored. Create a new join/leave player backup.",
      );
    }
    throw new Error("Players backup has no profile data");
  }
  if (input.relativePathsUnderPlayerProfiles.length === 0) {
    throw new Error("Players backup has no profile data");
  }
  for (const rel of input.relativePathsUnderPlayerProfiles) {
    if (dirname(rel) !== ".") {
      throw new Error(
        "This player archive nests profiles under a map folder (legacy layout) and cannot be restored. Create a new join/leave player backup.",
      );
    }
  }
}

/** Minimal restore-history fields needed for critical-job ownership checks. */
export interface RestoreHistoryOwnershipEvidence {
  serverId: string;
  backupId: string;
  notes: string | null;
}

export function isRestoreHistoryOwnedByJob(
  jobId: string,
  serverId: string,
  backupId: string | null,
  history: RestoreHistoryOwnershipEvidence,
): boolean {
  const marker = `[critical-job:${jobId}]`;
  if (history.serverId !== serverId) return false;
  if (backupId !== null && history.backupId !== backupId) return false;
  return history.notes?.includes(marker) === true;
}
