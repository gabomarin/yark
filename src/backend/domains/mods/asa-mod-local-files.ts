/**
 * Local ASA mod folders under Mods/83374 (#702).
 * YARK does not download mod bytes — ASA writes these on Start.
 */

import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { normalizeModId } from "./mods-service";
import { isPathInside } from "../instances/move-install-service";
import { isTraversableDirectoryDirent } from "../../infra/fs/reparse-points";
import { normalizeWindowsPath } from "@shared/server/server-install-path";

/** Same trees import scans for Project IDs. */
function asaMod83374Trees(installDir: string): string[] {
  const root = normalizeWindowsPath(installDir);
  return [
    join(root, "ShooterGame", "Binaries", "Win64", "ShooterGame", "Mods", "83374"),
    join(root, "ShooterGame", "Mods", "83374"),
  ];
}

/** Any `{projectId}_{fileId}` child name under an 83374 tree. */
const ANY_PROJECT_FOLDER_RE = /^(\d+)_(\d+)$/;

async function forEachLocalModFolder(
  installDir: string,
  onFolder: (projectId: string, resolvedPath: string) => void,
): Promise<void> {
  for (const tree of asaMod83374Trees(installDir)) {
    if (!existsSync(tree)) continue;
    const treeResolved = resolve(tree);
    let entries;
    try {
      entries = await readdir(tree, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const match = ANY_PROJECT_FOLDER_RE.exec(entry.name);
      if (match === null) continue;
      if (!isTraversableDirectoryDirent(entry)) continue;
      const full = join(tree, entry.name);
      const resolved = resolve(full);
      if (!isPathInside(treeResolved, resolved) && resolved.toLowerCase() !== treeResolved.toLowerCase()) {
        continue;
      }
      if (resolved.toLowerCase() === treeResolved.toLowerCase()) continue;
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
  for (const target of targets) {
    try {
      await rm(target, { recursive: true, force: false });
      deletedPaths.push(target);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Could not delete mod files at "${target}": ${detail}`);
    }
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
