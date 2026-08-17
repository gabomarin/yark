/**
 * Reparse-point policy for YARK recursive filesystem operations (#322).
 *
 * Policy (install, backup, restore, import, move, cleanup, ASA cache sync):
 * - Trees are treated as real directories and files only.
 * - Symbolic links, NTFS junctions, and other reparse points are not followed
 *   during size estimation, packaging, enumeration, or Robocopy copies (`/XJ`).
 * - Before writes: reject reparse points on the path chain from an approved root
 *   down to the target (parent-junction escape), then reject links under the
 *   destination tree. Robocopy `/XJ` alone does not stop writing *through* a
 *   destination junction.
 * - Recursive deletes rely on Node `fs.rm`: they remove the link entry and do
 *   not traverse into the junction/symlink target.
 * - Operator errors name the relative path inside the approved root only; they
 *   never include the external link target.
 */

import type { Dirent } from "node:fs";
import { readdir, lstat, mkdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

/** True for symbolic links and Windows directory junctions (`readdir` + file types). */
export function isReparsePointDirent(entry: Dirent): boolean {
  return entry.isSymbolicLink();
}

/** Directory we may descend into (excludes junctions / symlink dirs). */
export function isTraversableDirectoryDirent(entry: Dirent): boolean {
  return entry.isDirectory() && !entry.isSymbolicLink();
}

/** Regular file we may size or package (excludes symlink files). */
export function isRegularFileDirent(entry: Dirent): boolean {
  return entry.isFile() && !entry.isSymbolicLink();
}

function isNotFoundErrno(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function pathsEqualWin(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase();
}

function isPathInsideOrEqualWin(inner: string, outer: string): boolean {
  const child = resolve(inner).toLowerCase();
  const parent = resolve(outer).toLowerCase();
  if (child === parent) {
    return true;
  }
  const prefix = parent.endsWith("\\") ? parent : `${parent}\\`;
  return child.startsWith(prefix);
}

function relPosixUnderRoot(root: string, full: string): string {
  return relative(root, full).split(/[/\\]/).join("/") || ".";
}

function throwCancelled(): never {
  const error = new Error("Operation cancelled by the user");
  error.name = "OperationCancelledError";
  throw error;
}

function throwReparseBlocked(label: string, rel: string): never {
  throw new Error(
    `${label} blocked: this folder contains a link or junction at "${rel}". Remove the link and try again.`,
  );
}

export interface ReparseAssertOptions {
  operationLabel?: string;
  maxEntries?: number;
  /** When true mid-walk, abort with OperationCancelledError. */
  isCancelled?: () => boolean;
  /**
   * Relative directory names to skip (same shape as robocopy `/XD`, e.g.
   * `ShooterGame\\Saved`). Junctions only under these trees are ignored because
   * the matching copy also skips them.
   */
  excludeDirs?: readonly string[];
}

function normalizeExcludeDirs(excludeDirs: readonly string[] | undefined): string[] {
  if (excludeDirs === undefined || excludeDirs.length === 0) {
    return [];
  }
  return excludeDirs.map((dir) =>
    dir.replace(/[/\\]+/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase(),
  );
}

function isExcludedRel(relPosix: string, excludes: readonly string[]): boolean {
  if (excludes.length === 0) {
    return false;
  }
  const rel = relPosix.toLowerCase();
  return excludes.some(
    (ex) => rel === ex || rel.startsWith(`${ex}/`),
  );
}

/**
 * Fail closed when any *existing* path from `approvedRoot` down to `targetPath`
 * is a reparse point. Skips `approvedRoot` itself (operator may point a profile
 * at a junctioned folder). Call **before** `mkdir` / writes.
 */
export async function assertPathChainHasNoReparsePoints(
  approvedRoot: string,
  targetPath: string,
  options: Pick<ReparseAssertOptions, "operationLabel" | "isCancelled"> = {},
): Promise<void> {
  const root = resolve(approvedRoot);
  const target = resolve(targetPath);
  const label = options.operationLabel ?? "write into this folder";

  if (!isPathInsideOrEqualWin(target, root)) {
    throw new Error(
      `${label} blocked: destination is outside the approved folder.`,
    );
  }

  if (options.isCancelled?.() === true) {
    throwCancelled();
  }

  if (pathsEqualWin(target, root)) {
    return;
  }

  const rel = relPosixUnderRoot(root, target);
  if (rel === "." || rel.startsWith("..")) {
    return;
  }

  const segments = rel.split("/").filter((part) => part.length > 0);
  let current = root;
  for (const segment of segments) {
    if (options.isCancelled?.() === true) {
      throwCancelled();
    }
    current = join(current, segment);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isNotFoundErrno(error)) {
        // Remaining segments will be created as real directories by mkdir.
        return;
      }
      throw error;
    }
    if (info.isSymbolicLink()) {
      throwReparseBlocked(label, relPosixUnderRoot(root, current));
    }
  }
}

/**
 * Before creating `destDir`, reject when any existing ancestor is a reparse
 * point (up to `maxAncestors` hops). Stops at the filesystem root or optional
 * `stopAt` (exclusive — `stopAt` itself is not checked).
 *
 * When `includeLeaf` is false (default for robocopy into an approved install
 * root), `destDir` itself may be a junction; only parents are checked.
 */
export async function assertNoReparsePointAncestors(
  destDir: string,
  options: Pick<ReparseAssertOptions, "operationLabel" | "isCancelled"> & {
    maxAncestors?: number;
    stopAt?: string;
    /** When true, also reject if `destDir` itself is a reparse point. Default true. */
    includeLeaf?: boolean;
  } = {},
): Promise<void> {
  const dest = resolve(destDir);
  const label = options.operationLabel ?? "write into this folder";
  const maxAncestors = options.maxAncestors ?? 8;
  const includeLeaf = options.includeLeaf !== false;
  const stopAt =
    options.stopAt !== undefined ? resolve(options.stopAt) : null;

  let current = includeLeaf ? dest : dirname(dest);
  if (!includeLeaf && pathsEqualWin(current, dest)) {
    return;
  }

  for (let hop = 0; hop <= maxAncestors; hop += 1) {
    if (options.isCancelled?.() === true) {
      throwCancelled();
    }
    if (stopAt !== null && pathsEqualWin(current, stopAt)) {
      break;
    }

    let info: Awaited<ReturnType<typeof lstat>> | null;
    try {
      info = await lstat(current);
    } catch (error) {
      if (isNotFoundErrno(error)) {
        info = null;
      } else {
        throw error;
      }
    }
    if (info?.isSymbolicLink() === true) {
      const rel =
        pathsEqualWin(current, dest) ? "." : basenameSafe(current);
      throwReparseBlocked(label, rel);
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

/**
 * Before creating `destDir`, reject when `destDir` or nearby ancestors are
 * reparse points (extract/staging escape).
 */
export async function assertDestAndParentNotReparsePoints(
  destDir: string,
  options: Pick<ReparseAssertOptions, "operationLabel" | "isCancelled"> = {},
): Promise<void> {
  await assertNoReparsePointAncestors(destDir, {
    ...options,
    maxAncestors: 8,
    includeLeaf: true,
  });
}

/** True when `path` exists as a real directory (not a junction/symlink). */
export async function isRealDirectory(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

function basenameSafe(pathValue: string): string {
  const parts = resolve(pathValue).split(/[/\\]/).filter((p) => p.length > 0);
  return parts[parts.length - 1] ?? ".";
}

/**
 * Fail closed when any link/junction exists under `approvedRoot`.
 * Skips the root itself (operator may point a profile at a junctioned folder).
 */
export async function assertNoReparsePointsUnderRoot(
  approvedRoot: string,
  options: ReparseAssertOptions = {},
): Promise<void> {
  const root = resolve(approvedRoot);
  const label = options.operationLabel ?? "write into this folder";
  const maxEntries = options.maxEntries ?? 500_000;
  const excludes = normalizeExcludeDirs(options.excludeDirs);

  if (options.isCancelled?.() === true) {
    throwCancelled();
  }

  let rootInfo;
  try {
    rootInfo = await lstat(root);
  } catch (error) {
    if (isNotFoundErrno(error)) {
      return;
    }
    throw error;
  }
  if (rootInfo.isSymbolicLink()) {
    // Root itself is allowed; still scan children via readdir (lists the target).
    // We do not treat the root link as a blocking child entry.
  } else if (!rootInfo.isDirectory()) {
    return;
  }

  let visited = 0;
  const queue = [root];
  while (queue.length > 0) {
    if (options.isCancelled?.() === true) {
      throwCancelled();
    }
    const current = queue.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (isNotFoundErrno(error)) {
        continue;
      }
      throw error;
    }
    for (const entry of entries) {
      visited += 1;
      if (visited > maxEntries) {
        throw new Error(
          `Could not finish checking for links or junctions before ${label} (folder tree is too large).`,
        );
      }
      if (options.isCancelled?.() === true) {
        throwCancelled();
      }

      const full = join(current, entry.name);
      const rel = relPosixUnderRoot(root, full);
      if (isExcludedRel(rel, excludes)) {
        continue;
      }

      if (isReparsePointDirent(entry)) {
        throwReparseBlocked(label, rel);
      }
      if (entry.isDirectory()) {
        queue.push(full);
      }
    }
  }
}

/**
 * Prepare a destination directory for safe writes under `approvedRoot`:
 * path-chain check (before create), mkdir, then under-root scan.
 */
export async function prepareWritableDirUnderRoot(
  approvedRoot: string,
  targetDir: string,
  options: ReparseAssertOptions = {},
): Promise<void> {
  await assertPathChainHasNoReparsePoints(approvedRoot, targetDir, options);
  await mkdir(targetDir, { recursive: true });
  await assertNoReparsePointsUnderRoot(targetDir, options);
}

export interface EstimateDirectoryBytesOptions {
  maxEntries?: number;
}

/**
 * Sum regular-file sizes under `root`, skipping reparse points so estimates
 * match Robocopy `/XJ` source scope.
 */
export async function estimateDirectoryBytes(
  root: string,
  options: EstimateDirectoryBytesOptions = {},
): Promise<number> {
  const maxEntries = options.maxEntries ?? 250_000;
  let total = 0;
  let visited = 0;
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      if (visited > maxEntries) {
        return total;
      }
      const full = join(current, entry.name);
      if (isTraversableDirectoryDirent(entry)) {
        queue.push(full);
        continue;
      }
      if (!isRegularFileDirent(entry)) {
        continue;
      }
      try {
        const info = await stat(full);
        total += info.size;
      } catch {
        // Skip unreadable files; space check remains best-effort.
      }
    }
  }
  return total;
}

/** List regular files under `root`, skipping reparse-point branches. */
export async function listFilesRecursiveSafe(root: string): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (isTraversableDirectoryDirent(entry)) {
      out.push(...(await listFilesRecursiveSafe(full)));
    } else if (isRegularFileDirent(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Directory size for backup quotas; skips reparse points. */
export async function directorySizeSafe(path: string): Promise<number> {
  let total = 0;
  let entries: Dirent[];
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (isTraversableDirectoryDirent(entry)) {
      total += await directorySizeSafe(full);
    } else if (isRegularFileDirent(entry)) {
      try {
        total += (await stat(full)).size;
      } catch {
        // skip
      }
    }
  }
  return total;
}
