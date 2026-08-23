/**
 * Staging copy / promote / rename helpers for MoveInstallService.
 */

import { access, readdir, rename, rm } from "node:fs/promises";
import { type ChildProcess } from "node:child_process";
import type { MoveInstallProgress } from "@shared/types";
import { readVolumeSpace } from "../backups/backup-disk";
import { robocopyTree } from "../updates/robocopy-tree";
import { ensureParentDirectory } from "./move-install-registry";

/** Progress range while robocopy runs (cross-volume). */
export const COPY_PROGRESS_START = 15;
const COPY_PROGRESS_END = 75;
/** Poll free-space (cheap) rather than walking the staging tree. */
const COPY_PROGRESS_POLL_MS = 2500;

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export interface MoveInstallFsHost {
  isCancelRequested: () => boolean;
  setActiveChild: (child: ChildProcess | null) => void;
  emitProgress: (progress: MoveInstallProgress) => void;
}

export async function prepareDestinationForPromote(
  destResolved: string,
  destHealth: "missing" | "empty" | string,
): Promise<void> {
  await ensureParentDirectory(destResolved);
  if (destHealth === "empty" && (await pathExists(destResolved))) {
    const entries = await readdir(destResolved);
    if (entries.length > 0) {
      throw new Error(`Destination is no longer empty: ${destResolved}`);
    }
    await rm(destResolved, { recursive: true, force: true });
  } else if (destHealth !== "missing" && (await pathExists(destResolved))) {
    throw new Error(`Destination already exists: ${destResolved}`);
  }
}

export async function promoteStaging(
  stagingDir: string,
  destResolved: string,
  destHealth: "missing" | "empty" | string,
): Promise<void> {
  await prepareDestinationForPromote(destResolved, destHealth);

  try {
    await rename(stagingDir, destResolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not promote staging to destination: ${message}. Profile still uses the original path.`,
    );
  }
}

/**
 * After a same-volume rename, put the install tree back at `sourceDir` when
 * cancel/fail happens before profile commit. Returns false when dest is gone
 * or source already exists (nothing safe to do).
 */
export async function rollbackSameVolumeRename(
  sourceDir: string,
  destResolved: string,
): Promise<boolean> {
  if (!(await pathExists(destResolved))) {
    return false;
  }
  if (await pathExists(sourceDir)) {
    return false;
  }
  await rename(destResolved, sourceDir);
  return true;
}

export async function copyToStagingWithProgress(
  host: MoveInstallFsHost,
  args: {
    serverId: string;
    sourceDir: string;
    stagingDir: string;
    destResolved: string;
    sourceBytes: number;
  },
): Promise<void> {
  const { serverId, sourceDir, stagingDir, destResolved, sourceBytes } = args;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let pollInFlight = false;

  // Free-space delta avoids repeatedly walking hundreds of thousands of files.
  const spaceBefore = await readVolumeSpace(stagingDir);
  const freeBaseline = spaceBefore?.freeBytes ?? null;

  const publishCopyProgress = async (): Promise<void> => {
    if (host.isCancelRequested() || sourceBytes <= 0 || freeBaseline === null) {
      return;
    }
    if (pollInFlight) {
      return;
    }
    pollInFlight = true;
    try {
      const space = await readVolumeSpace(stagingDir);
      if (space === null) {
        return;
      }
      const copied = Math.max(0, freeBaseline - space.freeBytes);
      const ratio = Math.min(1, copied / sourceBytes);
      const percent = Math.round(
        COPY_PROGRESS_START + ratio * (COPY_PROGRESS_END - COPY_PROGRESS_START),
      );
      host.emitProgress({
        serverId,
        active: true,
        phase: "copying",
        label: `Copying installation to the new location… ${percent}%`,
        percent,
        sourceDir,
        stagingDir,
        destinationDir: destResolved,
        oldSourceDir: null,
        error: null,
        awaitingCleanup: false,
      });
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
    await robocopyTree(sourceDir, stagingDir, {
      operationLabel: "Move installation copy",
      isCancelled: () => host.isCancelRequested(),
      onSpawn: (child) => {
        host.setActiveChild(child);
      },
    });
  } finally {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }
    host.setActiveChild(null);
  }
}
