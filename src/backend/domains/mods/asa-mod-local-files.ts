/**
 * Local ASA mod folders under Mods/83374 (#702).
 * YARK does not download mod bytes — ASA writes these on Start.
 */

import { lstat, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { normalizeModId } from "./mods-service";
import { isPathInside } from "../instances/move-install-service";
import { isTraversableDirectoryDirent } from "../../infra/fs/reparse-points";

/** Same trees import scans for Project IDs. Native path join — do not Windows-normalize for FS. */
function asaMod83374Trees(installDir: string): string[] {
  const root = resolve(installDir);
  return [
    join(root, "ShooterGame", "Binaries", "Win64", "ShooterGame", "Mods", "83374"),
    join(root, "ShooterGame", "Mods", "83374"),
  ];
}

/** Any `{projectId}_{fileId}` child name under an 83374 tree. */
const ANY_PROJECT_FOLDER_RE = /^(\d+)_(\d+)$/;

function isNotFoundErrno(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function pathsEqualIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

async function forEachLocalModFolder(
  installDir: string,
  onFolder: (projectId: string, resolvedPath: string) => void,
): Promise<void> {
  for (const tree of asaMod83374Trees(installDir)) {
    const treeResolved = resolve(tree);
    let entries;
    try {
      entries = await readdir(tree, { withFileTypes: true });
    } catch (error) {
      if (isNotFoundErrno(error)) continue;
      throw error;
    }
    for (const entry of entries) {
      const match = ANY_PROJECT_FOLDER_RE.exec(entry.name);
      if (match === null) continue;
      if (!isTraversableDirectoryDirent(entry)) continue;
      const full = join(tree, entry.name);
      const resolved = resolve(full);
      if (!isPathInside(treeResolved, resolved) && !pathsEqualIgnoreCase(resolved, treeResolved)) {
        continue;
      }
      if (pathsEqualIgnoreCase(resolved, treeResolved)) continue;
      onFolder(match[1]!, resolved);
    }
  }
}

/**
 * Direct `{projectId}_{fileId}` children under both 83374 trees.
 * Skips junctions/symlinks and anything that resolves outside its tree.
 */
export async function listLocalModFolders(installDir: string, rawProjectId: string): Promise<string[]> {
  const projectId = normalizeModId(rawProjectId);
  const found: string[] = [];
  await forEachLocalModFolder(installDir, (id, resolvedPath) => {
    if (id === projectId) found.push(resolvedPath);
  });
  return found;
}

/**
 * Which of the requested Project IDs have at least one local `{id}_{fileId}` folder (#702).
 * Scans each 83374 tree once.
 */
export async function listLocalModPresence(
  installDir: string,
  rawProjectIds: readonly string[],
): Promise<Record<string, boolean>> {
  const wanted = new Map<string, string>();
  for (const raw of rawProjectIds) {
    const id = normalizeModId(raw);
    if (id.length === 0) continue;
    wanted.set(id, id);
  }
  const present = new Set<string>();
  if (wanted.size > 0) {
    await forEachLocalModFolder(installDir, (projectId) => {
      if (wanted.has(projectId)) present.add(projectId);
    });
  }
  const out: Record<string, boolean> = {};
  for (const id of wanted.keys()) {
    out[id] = present.has(id);
  }
  return out;
}

export type DeleteLocalModFoldersResult = {
  deletedPaths: string[];
  message: string;
};

export const NO_LOCAL_MOD_FILES_REDOWNLOAD = "No local files for this mod. ARK will download them on the next start.";

export const NO_LOCAL_MOD_FILES_OPEN = "No local files for this mod yet.";

export const STOP_SERVER_BEFORE_DELETE_MOD_FILES = "Stop the server before deleting mod files.";

/**
 * Re-check immediately before `rm` so a swapped junction cannot escape the tree (#702 TOCTOU).
 */
async function assertSafeModFolderForDelete(targetPath: string): Promise<void> {
  const treeResolved = resolve(dirname(targetPath));
  let info;
  try {
    info = await lstat(targetPath);
  } catch (error) {
    if (isNotFoundErrno(error)) {
      throw new Error(`Mod folder disappeared before delete: "${targetPath}"`);
    }
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`Refusing to delete non-directory or reparse point: "${targetPath}"`);
  }
  const resolved = resolve(targetPath);
  if (!isPathInside(treeResolved, resolved) || pathsEqualIgnoreCase(resolved, treeResolved)) {
    throw new Error(`Refusing to delete path outside mod tree: "${targetPath}"`);
  }
}

/**
 * Delete every matching local folder for one Project ID. Does not touch the profile.
 */
export async function deleteLocalModFolders(
  installDir: string,
  rawProjectId: string,
): Promise<DeleteLocalModFoldersResult> {
  const targets = await listLocalModFolders(installDir, rawProjectId);
  if (targets.length === 0) {
    return { deletedPaths: [], message: NO_LOCAL_MOD_FILES_REDOWNLOAD };
  }

  const deletedPaths: string[] = [];
  const failures: string[] = [];
  for (const target of targets) {
    try {
      await assertSafeModFolderForDelete(target);
      await rm(target, { recursive: true, force: false });
      deletedPaths.push(target);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      failures.push(`"${target}": ${detail}`);
    }
  }

  if (failures.length > 0) {
    const deletedNote =
      deletedPaths.length === 0
        ? "No folders were deleted."
        : `Already deleted ${deletedPaths.length}: ${deletedPaths.map((path) => `"${path}"`).join(", ")}.`;
    throw new Error(`Could not delete all mod folders. ${deletedNote} Failures: ${failures.join("; ")}`);
  }

  // Confirm nothing matching remains (partial failure / race).
  const remaining = await listLocalModFolders(installDir, rawProjectId);
  if (remaining.length > 0) {
    throw new Error(
      `Could not finish deleting mod files; still present: ${remaining.map((path) => `"${path}"`).join(", ")}`,
    );
  }

  return {
    deletedPaths,
    message:
      deletedPaths.length === 1
        ? "Deleted local mod files. ARK will download them again on the next start."
        : `Deleted ${deletedPaths.length} local mod folders. ARK will download them again on the next start.`,
  };
}
