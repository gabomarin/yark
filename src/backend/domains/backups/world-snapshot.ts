import { existsSync, type Dirent } from "node:fs";
import { basename, join, relative } from "node:path";
import { readdir } from "node:fs/promises";
import { isSafeMapToken, isSafeWindowsFolderName } from "@shared/map-identity";
import {
  isRealDirectory,
  isTraversableDirectoryDirent,
} from "../../infra/fs/reparse-points";
import { mapTokenFromWorldSaveName } from "../instances/import-existing-install";

/**
 * Helpers for live ASA SavedArks snapshots during world backups.
 * World archives are scoped to one map folder under SavedArks.
 * Folder name may differ from the launch map token (e.g. mod map
 * `Svartalfheim/` with files `Svartalfheim_WP.ark`) — resolve by folder
 * **name** candidates only, never by searching for `.ark` across siblings
 * (rotation leftovers can leave another map's `.ark` in the wrong folder).
 */

/** Dated game autosaves are never packaged in YARK world ZIPs. */
export const MAX_DATED_AUTOSAVES_PER_MAP = 0;

/**
 * Folder name candidates under SavedArks: optional operator override, then exact
 * `{MapToken}`, then strip trailing `_WP`. Deduped case-insensitively.
 */
export function worldMapDirNameCandidates(
  mapToken: string,
  mapSaveFolder?: string | null,
): string[] {
  const token = mapToken.trim();
  if (token.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  push(mapSaveFolder ?? "");
  push(token);
  if (/_WP$/i.test(token)) {
    push(token.replace(/_WP$/i, ""));
  }
  return out;
}

function primaryArkPath(dir: string, mapToken: string): string {
  return join(dir, `${mapToken.trim()}.ark`);
}

/**
 * Locate the live SavedArks subfolder for a launch map token by **folder name**
 * only (override → `{MapToken}` → strip trailing `_WP`). Does not scan sibling
 * folders for `.ark` files (unsafe under map rotation leftovers).
 * Junctions / symlinks are ignored so backup packaging cannot follow them (#322).
 */
export async function resolveWorldMapSaveDir(
  savedArksDir: string,
  mapToken: string,
  mapSaveFolder?: string | null,
): Promise<{ dir: string; folderName: string } | null> {
  const token = mapToken.trim();
  if (!isSafeMapToken(token) || !(await isRealDirectory(savedArksDir))) {
    return null;
  }

  const candidates = worldMapDirNameCandidates(token, mapSaveFolder);
  const override = mapSaveFolder?.trim() ?? "";
  if (override.length > 0) {
    if (!isSafeWindowsFolderName(override)) return null;
    const exactDir = join(savedArksDir, override);
    if (await isRealDirectory(exactDir)) {
      return { dir: exactDir, folderName: override };
    }
    try {
      const match = (await readdir(savedArksDir, { withFileTypes: true })).find(
        (entry) =>
          isTraversableDirectoryDirent(entry)
          && entry.name.toLowerCase() === override.toLowerCase(),
      );
      if (match === undefined) {
        return null;
      }
      const matchedDir = join(savedArksDir, match.name);
      if (!(await isRealDirectory(matchedDir))) {
        return null;
      }
      return { dir: matchedDir, folderName: match.name };
    } catch {
      return null;
    }
  }
  const candidateLower = new Set(candidates.map((name) => name.toLowerCase()));

  // Prefer a candidate folder that already holds the primary `.ark`.
  for (const folderName of candidates) {
    const dir = join(savedArksDir, folderName);
    if ((await isRealDirectory(dir)) && existsSync(primaryArkPath(dir, token))) {
      return { dir, folderName };
    }
  }

  // Case-insensitive match against the same candidate names only.
  let entries: Dirent[] = [];
  try {
    entries = await readdir(savedArksDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!isTraversableDirectoryDirent(entry)) continue;
    if (!candidateLower.has(entry.name.toLowerCase())) continue;
    const dir = join(savedArksDir, entry.name);
    if (!(await isRealDirectory(dir))) continue;
    if (existsSync(primaryArkPath(dir, token))) {
      return { dir, folderName: entry.name };
    }
  }

  // Folder exists under a candidate name but primary is not present yet.
  for (const folderName of candidates) {
    const dir = join(savedArksDir, folderName);
    if (await isRealDirectory(dir)) {
      return { dir, folderName };
    }
  }
  for (const entry of entries) {
    if (!isTraversableDirectoryDirent(entry)) continue;
    if (!candidateLower.has(entry.name.toLowerCase())) continue;
    const dir = join(savedArksDir, entry.name);
    if (!(await isRealDirectory(dir))) continue;
    return { dir, folderName: entry.name };
  }

  return null;
}

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

/** Player / tribe companions packaged with a map-scoped world snapshot. */
export function isWorldProfileOrTribeName(fileName: string): boolean {
  const lower = basename(fileName).toLowerCase();
  return (
    lower.endsWith(".arktribe")
    || lower.endsWith(".tribebak")
    || lower.endsWith(".arkprofile")
    || lower.endsWith(".arkprofile.bak")
    || lower.endsWith(".profilebak")
  );
}

/**
 * Anti-corruption companion next to the primary map save
 * (e.g. `TheIsland_WP.ark.bak` or ASA `*anticorruption*.bak`).
 */
export function isAntiCorruptionWorldSaveName(
  fileName: string,
  mapToken: string,
): boolean {
  const baseName = basename(fileName);
  const lower = baseName.toLowerCase();
  const token = mapToken.trim().toLowerCase();
  if (token.length === 0) return false;
  if (lower === `${token}.ark.bak`) return true;
  if (lower.includes("anticorruption") && lower.endsWith(".bak")) return true;
  return false;
}

/**
 * Files that must copy successfully when present on the *selected* source list.
 * Dated autosaves are never selected for packaging.
 */
export function isEssentialWorldSaveName(
  fileName: string,
  mapToken?: string,
): boolean {
  if (isDatedWorldAutosaveName(fileName)) return false;
  if (isTransientWorldSaveName(fileName)) return false;
  if (isPrimaryWorldSaveName(fileName)) return true;
  if (isWorldProfileOrTribeName(fileName)) return true;
  if (mapToken !== undefined && isAntiCorruptionWorldSaveName(fileName, mapToken)) {
    return true;
  }
  const lower = basename(fileName).toLowerCase();
  return lower.endsWith(".ark.bak");
}

/** Whether a file under a map folder should be packaged into a world ZIP. */
export function isSelectableWorldBackupFileName(
  fileName: string,
  mapToken: string,
): boolean {
  if (isTransientWorldSaveName(fileName)) return false;
  if (isDatedWorldAutosaveName(fileName)) return false;
  if (isPrimaryWorldSaveName(fileName)) {
    const token = mapTokenFromWorldSaveName(fileName);
    return token !== null && token.toLowerCase() === mapToken.trim().toLowerCase();
  }
  if (isAntiCorruptionWorldSaveName(fileName, mapToken)) return true;
  if (isWorldProfileOrTribeName(fileName)) return true;
  return false;
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
 * Choose which map-folder files to package: drop transients and dated autosaves;
 * keep primary `.ark`, anti-corruption bak, and profile/tribe companions.
 */
export function selectWorldBackupSourceFiles(
  candidates: readonly WorldBackupFileCandidate[],
  options?: { mapToken?: string; maxDatedAutosavesPerMap?: number },
): WorldBackupSourceSelection {
  const mapToken = options?.mapToken?.trim() ?? "";
  // Dated autosaves are omitted from world ZIPs (default 0). Callers may pass
  // a positive cap only for tests / experimental tooling.
  const maxDated = Math.max(
    0,
    options?.maxDatedAutosavesPerMap ?? MAX_DATED_AUTOSAVES_PER_MAP,
  );
  const selected: WorldBackupFileCandidate[] = [];
  let skippedTransientCount = 0;
  let skippedOlderDatedCount = 0;
  const datedByMap = new Map<string, WorldBackupFileCandidate[]>();

  for (const candidate of candidates) {
    const name = candidate.name;
    if (isTransientWorldSaveName(name)) {
      skippedTransientCount += 1;
      continue;
    }
    if (isDatedWorldAutosaveName(name)) {
      if (maxDated <= 0) {
        skippedOlderDatedCount += 1;
        continue;
      }
      const token = mapTokenFromWorldSaveName(name);
      if (token === null) {
        skippedOlderDatedCount += 1;
        continue;
      }
      const key = token.toLowerCase();
      const list = datedByMap.get(key) ?? [];
      list.push(candidate);
      datedByMap.set(key, list);
      continue;
    }
    if (mapToken.length > 0) {
      if (!isSelectableWorldBackupFileName(name, mapToken)) {
        continue;
      }
    }
    selected.push(candidate);
  }

  let retainedDatedCount = 0;
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
  options?: { mapToken?: string },
): Promise<CopySavedArksResult> {
  let copiedFileCount = 0;
  let skippedTransientCount = 0;
  const skippedTransient: string[] = [];
  const mapToken = options?.mapToken;

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
      if (isEssentialWorldSaveName(name, mapToken)) {
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
  options?: { mapToken?: string },
): string[] {
  const normalizeRel = (file: string, root: string) =>
    relative(root, file).split("\\").join("/").toLowerCase();
  const destRels = new Set(destFiles.map((file) => normalizeRel(file, destRoot)));
  const missing: string[] = [];
  for (const file of sourceFiles) {
    if (!isEssentialWorldSaveName(basename(file), options?.mapToken)) continue;
    const rel = relative(sourceRoot, file);
    if (destRels.has(rel.split("\\").join("/").toLowerCase())) continue;
    missing.push(rel);
  }
  return missing;
}
