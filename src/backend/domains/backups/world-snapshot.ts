import { basename, join, relative } from "node:path";
import { mapTokenFromWorldSaveName } from "../instances/import-existing-install";

/**
 * Helpers for live ASA SavedArks snapshots during world backups.
 * Timestamped rollback buffers rotate while the dedicated server is writing;
 * primary map / tribe / profile files must still be present for a valid backup.
 */

/** Newest dated autosaves kept per map token (in addition to the primary `.ark`). */
export const MAX_DATED_AUTOSAVES_PER_MAP = 2;

/** Transient / rotating names that may vanish mid-copy without failing the backup. */
export function isTransientWorldSaveName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".arkrbf") || lower.endsWith(".tmp");
}

/**
 * Dated game autosave next to a primary map save
 * (`TheIsland_WP_24.07.2025_21.51.53.ark` vs `TheIsland_WP.ark`).
 */
export function isDatedWorldAutosaveName(fileName: string): boolean {
  const baseName = basename(fileName);
  if (!/\.ark$/i.test(baseName) || isTransientWorldSaveName(baseName)) {
    return false;
  }
  const lower = baseName.toLowerCase();
  if (
    lower.endsWith(".arktribe")
    || lower.endsWith(".arkprofile")
    || lower.endsWith(".arkprofile.bak")
    || lower.endsWith(".profilebak")
  ) {
    return false;
  }
  const token = mapTokenFromWorldSaveName(baseName);
  if (token === null) return false;
  const stem = baseName.replace(/\.ark$/i, "");
  return stem.toLowerCase() !== token.toLowerCase();
}

/** Primary map `.ark` (not a dated autosave). */
export function isPrimaryWorldSaveName(fileName: string): boolean {
  const baseName = basename(fileName);
  if (!/\.ark$/i.test(baseName) || isTransientWorldSaveName(baseName)) {
    return false;
  }
  if (isDatedWorldAutosaveName(baseName)) return false;
  return mapTokenFromWorldSaveName(baseName) !== null;
}

/**
 * Files that must copy successfully when present on the *selected* source list.
 * Dated autosaves are optional history — never fail the backup if older ones are trimmed.
 */
export function isEssentialWorldSaveName(fileName: string): boolean {
  if (isDatedWorldAutosaveName(fileName)) return false;
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith(".ark")
    || lower.endsWith(".arktribe")
    || lower.endsWith(".arkprofile")
    || lower.endsWith(".arkprofile.bak")
    || lower.endsWith(".profilebak")
  );
}

export function isWorldCopyMissingError(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "ENOENT";
}

export interface WorldBackupFileCandidate {
  path: string;
  name: string;
  mtimeMs: number;
}

export interface WorldBackupSourceSelection {
  selected: WorldBackupFileCandidate[];
  skippedTransientCount: number;
  skippedOlderDatedCount: number;
  retainedDatedCount: number;
}

/**
 * Stat SavedArks paths for packaging. Transient files that vanish between
 * enumerate and stat are skipped (same contract as mid-copy ENOENT).
 */
export async function collectWorldBackupCandidates(
  paths: readonly string[],
  statFile: (path: string) => Promise<{ mtimeMs: number }>,
): Promise<WorldBackupFileCandidate[]> {
  const candidates = await Promise.all(
    paths.map(async (path): Promise<WorldBackupFileCandidate | null> => {
      const name = basename(path);
      try {
        const info = await statFile(path);
        return {
          path,
          name,
          mtimeMs: info.mtimeMs,
        };
      } catch (error) {
        if (isWorldCopyMissingError(error) && isTransientWorldSaveName(name)) {
          return null;
        }
        throw error;
      }
    }),
  );
  return candidates.filter(
    (candidate): candidate is WorldBackupFileCandidate => candidate !== null,
  );
}

/**
 * Choose which SavedArks files to package: drop transients, keep every primary
 * map save, and retain only the newest dated autosaves per map token.
 */
export function selectWorldBackupSourceFiles(
  candidates: readonly WorldBackupFileCandidate[],
  options?: { maxDatedAutosavesPerMap?: number },
): WorldBackupSourceSelection {
  const maxDated = Math.max(
    0,
    options?.maxDatedAutosavesPerMap ?? MAX_DATED_AUTOSAVES_PER_MAP,
  );
  const selected: WorldBackupFileCandidate[] = [];
  let skippedTransientCount = 0;
  const datedByMap = new Map<string, WorldBackupFileCandidate[]>();

  for (const candidate of candidates) {
    const name = candidate.name;
    if (isTransientWorldSaveName(name)) {
      skippedTransientCount += 1;
      continue;
    }
    if (isDatedWorldAutosaveName(name)) {
      const token = mapTokenFromWorldSaveName(name);
      if (token === null) {
        selected.push(candidate);
        continue;
      }
      const key = token.toLowerCase();
      const list = datedByMap.get(key) ?? [];
      list.push(candidate);
      datedByMap.set(key, list);
      continue;
    }
    selected.push(candidate);
  }

  let retainedDatedCount = 0;
  let skippedOlderDatedCount = 0;
  for (const list of datedByMap.values()) {
    list.sort((a, b) => {
      if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
      return b.name.localeCompare(a.name);
    });
    const keep = list.slice(0, maxDated);
    retainedDatedCount += keep.length;
    skippedOlderDatedCount += Math.max(0, list.length - keep.length);
    selected.push(...keep);
  }

  return {
    selected,
    skippedTransientCount,
    skippedOlderDatedCount,
    retainedDatedCount,
  };
}

export interface CopySavedArksResult {
  copiedFileCount: number;
  skippedTransientCount: number;
  skippedTransient: string[];
}

/**
 * Copy a pre-enumerated SavedArks file list into `destRoot`, skipping transient
 * files that disappear mid-copy and failing on missing essentials.
 */
export async function copySavedArksFiles(
  sourceRoot: string,
  destRoot: string,
  sourceFiles: string[],
  copyFile: (src: string, dest: string) => Promise<void>,
): Promise<CopySavedArksResult> {
  let copiedFileCount = 0;
  let skippedTransientCount = 0;
  const skippedTransient: string[] = [];

  for (const src of sourceFiles) {
    const rel = relative(sourceRoot, src);
    const name = basename(src);
    try {
      await copyFile(src, join(destRoot, rel));
      copiedFileCount += 1;
    } catch (error) {
      if (!isWorldCopyMissingError(error)) throw error;
      if (isTransientWorldSaveName(name)) {
        skippedTransientCount += 1;
        if (skippedTransient.length < 8) {
          skippedTransient.push(rel);
        }
        continue;
      }
      if (isEssentialWorldSaveName(name)) {
        throw new Error(
          `Essential world save disappeared during backup: ${rel}`,
        );
      }
      throw error;
    }
  }

  return { copiedFileCount, skippedTransientCount, skippedTransient };
}

/**
 * After a copy, ensure every essential basename that existed on the source still
 * exists under the destination tree (by relative path).
 */
export function missingEssentialWorldRels(
  sourceRoot: string,
  destRoot: string,
  sourceFiles: string[],
  destFiles: string[],
): string[] {
  const normalizeRel = (file: string, root: string) =>
    relative(root, file).split("\\").join("/").toLowerCase();
  const destRels = new Set(destFiles.map((file) => normalizeRel(file, destRoot)));
  const missing: string[] = [];
  for (const file of sourceFiles) {
    if (!isEssentialWorldSaveName(basename(file))) continue;
    const rel = relative(sourceRoot, file);
    if (destRels.has(rel.split("\\").join("/").toLowerCase())) continue;
    missing.push(rel);
  }
  return missing;
}
