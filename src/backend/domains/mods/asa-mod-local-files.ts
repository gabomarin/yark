/**
 * Local ASA mod folders under Mods/83374 (#702).
 * YARK does not download mod bytes — ASA writes these on Start.
 */

import { lstat, readdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { normalizeModId } from "./mods-service";
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

/** Portable containment via `relative` (works with `/` and `\\`). */
function isStrictlyUnder(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
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
      if (!isStrictlyUnder(treeResolved, resolved)) continue;
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
 * Walk install → target with `lstat` and refuse any symlink/junction on the chain (#702).
 * Skips the install root itself (operator may point a profile at a junctioned folder).
 */
async function assertNoReparseOnPathChain(installDir: string, targetPath: string): Promise<void> {
  const root = resolve(installDir);
  const target = resolve(targetPath);
  if (!isStrictlyUnder(root, target) && !pathsEqualIgnoreCase(root, target)) {
    throw new Error(`Refusing to delete path outside install: "${targetPath}"`);
  }
  if (pathsEqualIgnoreCase(root, target)) {
    throw new Error(`Refusing to delete the install root: "${targetPath}"`);
  }
  const rel = relative(root, target);
  const segments = rel.split(/[/\\]/).filter((part) => part.length > 0);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isNotFoundErrno(error)) {
        throw new Error(`Mod folder disappeared before delete: "${current}"`);
      }
      throw error;
    }
    if (info.isSymbolicLink()) {
      throw new Error(`Refusing to delete through a reparse point: "${current}"`);
    }
  }
}

/**
 * Re-check immediately before `rm` so a swapped junction cannot escape the tree (#702 TOCTOU).
 */
async function assertSafeModFolderForDelete(installDir: string, targetPath: string): Promise<void> {
  const resolved = resolve(targetPath);
  const tree = dirname(resolved);
  const allowedTrees = asaMod83374Trees(installDir).map((path) => resolve(path));
  if (!allowedTrees.some((allowed) => pathsEqualIgnoreCase(allowed, tree))) {
    throw new Error(`Refusing to delete path outside mod tree: "${targetPath}"`);
  }
  if (!isStrictlyUnder(tree, resolved)) {
    throw new Error(`Refusing to delete path outside mod tree: "${targetPath}"`);
  }

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

  await assertNoReparseOnPathChain(installDir, resolved);
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
      await assertSafeModFolderForDelete(installDir, target);
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
