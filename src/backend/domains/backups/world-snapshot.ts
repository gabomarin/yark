import { basename, join, relative } from "node:path";

/**
 * Helpers for live ASA SavedArks snapshots during world backups.
 * Timestamped rollback buffers rotate while the dedicated server is writing;
 * primary map / tribe / profile files must still be present for a valid backup.
 */

/** Transient / rotating names that may vanish mid-copy without failing the backup. */
export function isTransientWorldSaveName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".arkrbf") || lower.endsWith(".tmp");
}

/** Files that must copy successfully when present on the source tree. */
export function isEssentialWorldSaveName(fileName: string): boolean {
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
  return sourceFiles
    .filter((file) => isEssentialWorldSaveName(basename(file)))
    .map((file) => relative(sourceRoot, file))
    .filter((rel) => !destRels.has(rel.split("\\").join("/").toLowerCase()));
}
