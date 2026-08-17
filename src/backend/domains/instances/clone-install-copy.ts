/**
 * Full-tree copy for Clone server when the operator opts in (#160).
 * Uses the same robocopy helper as Move installation / ASA cache sync.
 */

import { type ChildProcess } from "node:child_process";
import { dirname } from "node:path";
import { readVolumeSpace } from "../backups/backup-disk";
import {
  estimateDirectoryBytes as estimateDirectoryBytesSafe,
} from "../../infra/fs/reparse-points";
import { robocopyTree } from "../updates/robocopy-tree";

/** Extra free-space headroom beyond estimated source size (10%). */
const FREE_SPACE_MARGIN = 1.1;

/** Cap directory-size walks so validation stays bounded. */
const MAX_SIZE_WALK_ENTRIES = 250_000;

/** Progress range while robocopy runs. */
const COPY_PROGRESS_START = 10;
const COPY_PROGRESS_END = 88;
/** Poll free-space (cheap) rather than walking the destination tree. */
const COPY_PROGRESS_POLL_MS = 2500;

export async function estimateDirectoryBytes(root: string): Promise<number> {
  return estimateDirectoryBytesSafe(root, { maxEntries: MAX_SIZE_WALK_ENTRIES });
}

export async function assertEnoughFreeSpaceForCopy(
  destinationDir: string,
  sourceBytes: number,
): Promise<void> {
  if (sourceBytes <= 0) {
    return;
  }
  const needed = Math.ceil(sourceBytes * FREE_SPACE_MARGIN);
  const space = await readVolumeSpace(dirname(destinationDir));
  if (space === null) {
    return;
  }
  if (space.freeBytes < needed) {
    const freeGb = (space.freeBytes / 1024 ** 3).toFixed(1);
    const needGb = (needed / 1024 ** 3).toFixed(1);
    throw new Error(
      `Not enough free space on ${space.volumePath} (need ~${needGb} GB, have ${freeGb} GB).`,
    );
  }
}

export interface CopyInstallTreeProgressArgs {
  sourceDir: string;
  destDir: string;
  sourceBytes: number;
  isCancelled: () => boolean;
  onSpawn: (child: ChildProcess) => void;
  onProgress: (percent: number, label: string) => void;
}

/**
 * Copies `sourceDir` → `destDir` with robocopy `/E` `/XJ` and reports approximate
 * progress from destination-volume free-space delta.
 */
export async function copyInstallTreeWithProgress(
  args: CopyInstallTreeProgressArgs,
): Promise<number> {
  const { sourceDir, destDir, sourceBytes, isCancelled, onSpawn, onProgress } = args;

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pollInFlight = false;
  const freeBaseline = await readVolumeSpace(destDir)
    .then((space) => space?.freeBytes ?? null)
    .catch(() => null);

  const publishCopyProgress = async (): Promise<void> => {
    if (pollInFlight || isCancelled() || sourceBytes <= 0 || freeBaseline === null) {
      return;
    }
    pollInFlight = true;
    try {
      const space = await readVolumeSpace(destDir);
      if (space === null) {
        return;
      }
      const copied = Math.max(0, freeBaseline - space.freeBytes);
      const ratio = Math.min(1, copied / sourceBytes);
      const percent = Math.round(
        COPY_PROGRESS_START + ratio * (COPY_PROGRESS_END - COPY_PROGRESS_START),
      );
      onProgress(percent, `Copying server folder… ${percent}%`);
    } catch {
      // Best effort — keep last progress.
    } finally {
      pollInFlight = false;
    }
  };

  pollTimer = setInterval(() => {
    void publishCopyProgress();
  }, COPY_PROGRESS_POLL_MS);

  try {
    return await robocopyTree(sourceDir, destDir, {
      operationLabel: "Clone folder copy",
      isCancelled,
      onSpawn,
    });
  } finally {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }
  }
}
