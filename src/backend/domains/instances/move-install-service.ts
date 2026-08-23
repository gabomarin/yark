/**
 * Move installation: same-volume rename or cross-volume copy → verify → commit (#56).
 * After a verified commit, the previous folder is removed when possible.
 */

import { EventEmitter } from "node:events";
import {
  access,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { type ChildProcess } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import {
  getWindowsPathError,
  normalizeWindowsPath,
  selfNestInstallWarning,
} from "@shared/server-install-path";
import { isInstallationReady } from "@shared/installation-health";
import type { MoveInstallProgress } from "@shared/types";
import { readVolumeSpace, volumeRootForPath } from "../backups/backup-disk";
import type { BackupService } from "../backups/backup-service";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import { killChildProcessTreeAsync } from "../../infra/process/kill-win-process-tree";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import {
  installDirKey,
  isWindowsDriveRoot,
} from "./install-dir-safety";
import type { InstanceService } from "./instance-service";
import { serverBinaryPath } from "./launch-args";
import {
  classifyInstallHealthAsync,
  inspectServerInstallationAsync,
} from "./server-installation";
import {
  isOperationCancelledError,
  OperationCancelledError,
} from "../updates/robocopy-tree";
import { estimateDirectoryBytes as estimateDirectoryBytesSafe } from "../../infra/fs/reparse-points";
import { MoveInstallCleanup } from "./move-install-cleanup";
import {
  COPY_PROGRESS_START,
  copyToStagingWithProgress,
  prepareDestinationForPromote,
  promoteStaging,
  rollbackSameVolumeRename,
} from "./move-install-fs";
import { MoveInstallRegistry } from "./move-install-registry";

/** Marker file written into every YARK-owned move staging directory. */
export const MOVE_STAGING_MARKER = ".yark-move-staging";

/** Extra free-space headroom beyond estimated source size (10%) for cross-volume copy. */
const FREE_SPACE_MARGIN = 1.1;

/** Cap directory-size walks so validation stays bounded. */
const MAX_SIZE_WALK_ENTRIES = 250_000;

export interface MoveInstallResult {
  serverId: string;
  sourceDir: string;
  destinationDir: string;
  /** Previous install path (deleted after a successful verified move when possible). */
  oldSourceDir: string;
  /** True when the previous folder was removed after commit. */
  oldSourceRemoved: boolean;
  /** Set when commit succeeded but deleting the previous folder failed. */
  cleanupError: string | null;
}

function stagingDirFor(serverId: string, destinationDir: string): string {
  return join(dirname(destinationDir), `.yark-move-${serverId}-staging`);
}

function isStagingDirName(name: string): boolean {
  return /^\.yark-move-.+-staging$/i.test(name);
}

/** True when both absolute paths share a Windows volume root. */
function pathsOnSameVolume(a: string, b: string): boolean {
  return volumeRootForPath(a).toLowerCase() === volumeRootForPath(b).toLowerCase();
}

/** True when `child` is `parent` or nested under it (Windows, case-insensitive). */
export function isPathInside(parent: string, child: string): boolean {
  const p = resolve(parent).replace(/[/\\]+$/, "").toLowerCase();
  const c = resolve(child).replace(/[/\\]+$/, "").toLowerCase();
  return c === p || c.startsWith(`${p}\\`);
}

/** Same-volume folder rename is safe only when paths are not nested. */
export function canUseSameVolumeRename(sourceDir: string, destDir: string): boolean {
  if (!pathsOnSameVolume(sourceDir, destDir)) {
    return false;
  }
  if (isPathInside(sourceDir, destDir) || isPathInside(destDir, sourceDir)) {
    return false;
  }
  return true;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function estimateDirectoryBytes(root: string): Promise<number> {
  return estimateDirectoryBytesSafe(root, { maxEntries: MAX_SIZE_WALK_ENTRIES });
}

export class MoveInstallService extends EventEmitter {
  private cancelRequested = false;
  private activeServerId: string | null = null;
  private activeChild: ChildProcess | null = null;
  private lastProgress: MoveInstallProgress | null = null;
  private readonly registry: MoveInstallRegistry;
  private readonly cleanup: MoveInstallCleanup;

  constructor(
    private readonly repo: ServerRepository,
    private readonly instances: InstanceService,
    private readonly processes: ProcessManager,
    private readonly backups: BackupService,
    private readonly locks: InstanceLockManager,
    /**
     * Optional JSON registry of absolute staging dirs so startup sweep can find
     * leftovers under destination parents that are not profile install parents.
     */
    stagingRegistryPath: string | null = null,
    /**
     * Optional JSON registry of per-server prior install paths awaiting cleanup
     * after a successful move (#215). Cleanup IPC may only wipe a recorded path.
     */
    pendingCleanupRegistryPath: string | null = null,
  ) {
    super();
    this.registry = new MoveInstallRegistry(
      stagingRegistryPath,
      pendingCleanupRegistryPath,
    );
    this.cleanup = new MoveInstallCleanup({
      repo,
      processes,
      locks,
      registry: this.registry,
      emitProgress: (progress) => this.emitProgress(progress),
    });
  }

  getProgress(): MoveInstallProgress | null {
    return this.lastProgress;
  }

  isBusy(serverId?: string): boolean {
    if (this.activeServerId === null) return false;
    if (serverId === undefined) return true;
    return this.activeServerId === serverId;
  }

  cancel(): boolean {
    if (this.activeServerId === null) return false;
    this.cancelRequested = true;
    void killChildProcessTreeAsync(this.activeChild);
    return true;
  }

  /**
   * Deletes leftover YARK staging dirs near profile install parents and any
   * destination parents recorded in the staging registry (cross-volume orphans).
   * Never touches a path that is still a profile installDir.
   */
  async sweepStaleStaging(): Promise<number> {
    const profiles = this.repo.list();
    const protectedKeys = new Set(
      profiles.map((profile) => installDirKey(profile.installDir)),
    );
    const registered = await this.registry.readStagingRegistry();
    const parentDirs = new Set(
      profiles.map((profile) => dirname(resolve(profile.installDir))),
    );
    for (const stagingPath of registered) {
      parentDirs.add(dirname(resolve(stagingPath)));
    }

    const removedKeys = new Set<string>();
    let removed = 0;

    const tryRemoveStaging = async (candidate: string): Promise<boolean> => {
      const key = installDirKey(candidate);
      if (removedKeys.has(key) || protectedKeys.has(key)) {
        return false;
      }
      const marker = join(candidate, MOVE_STAGING_MARKER);
      if (!(await pathExists(marker))) {
        return false;
      }
      try {
        await rm(candidate, { recursive: true, force: true });
        removedKeys.add(key);
        return true;
      } catch {
        // Best effort — operator can retry later.
        return false;
      }
    };

    for (const parent of parentDirs) {
      if (!(await pathExists(parent))) continue;
      let entries: string[];
      try {
        entries = await readdir(parent);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (!isStagingDirName(name)) continue;
        if (await tryRemoveStaging(join(parent, name))) {
          removed += 1;
        }
      }
    }

    for (const stagingPath of registered) {
      const resolved = resolve(stagingPath);
      if (!(await pathExists(resolved))) {
        removedKeys.add(installDirKey(resolved));
        continue;
      }
      if (await tryRemoveStaging(resolved)) {
        removed += 1;
      }
    }

    const remaining = registered.filter(
      (entry) => !removedKeys.has(installDirKey(entry)),
    );
    await this.registry.writeStagingRegistry(remaining);
    return removed;
  }

  async moveInstall(
    serverId: string,
    destinationDirRaw: string,
  ): Promise<MoveInstallResult> {
    if (this.activeServerId !== null) {
      throw new Error("Another move installation is already running");
    }

    const profile = this.repo.get(serverId);
    if (profile === null) {
      throw new Error("Server does not exist");
    }
    if (this.processes.isActive(serverId)) {
      throw new Error("Stop the server before moving its installation");
    }
    if (this.instances.isStopInProgress(serverId)) {
      throw new Error("Cannot move installation while the server is stopping");
    }
    if (this.backups.hasServerWork(serverId)) {
      throw new Error("Cannot move installation while a backup job is running");
    }

    const destinationDir = normalizeWindowsPath(destinationDirRaw);
    const pathError = getWindowsPathError(destinationDir, "Destination");
    if (pathError !== null) {
      throw new Error(pathError);
    }
    if (!/^(?:[a-zA-Z]:[\\/]|\\\\)/.test(destinationDir)) {
      throw new Error("Destination must be an absolute Windows path");
    }

    const sourceDir = resolve(profile.installDir);
    const destResolved = resolve(destinationDir);
    if (installDirKey(sourceDir) === installDirKey(destResolved)) {
      throw new Error("Destination must differ from the current install path");
    }
    const selfNest = selfNestInstallWarning(sourceDir, destResolved);
    if (selfNest !== null) {
      throw new Error(selfNest);
    }
    if (isWindowsDriveRoot(destResolved)) {
      throw new Error(
        "Destination must be a folder on the drive (for example H:\\ARK\\MyServer), not the drive root itself.",
      );
    }

    this.cancelRequested = false;
    this.activeServerId = serverId;
    const stagingDir = stagingDirFor(serverId, destResolved);
    /**
     * Same-volume rename moves the only copy of the install. Track until commit so
     * cancel/fail can rename back; otherwise the profile still points at the empty
     * source while files sit orphaned at dest.
     */
    let renamedAwayFromSource = false;
    let profileCommittedToDest = false;

    try {
      return await this.locks.withLock(serverId, "move-install", async () => {
        await this.sweepStaleStaging();
        this.emitProgress({
          serverId,
          active: true,
          phase: "validating",
          label: "Checking current install and destination…",
          percent: 5,
          sourceDir,
          stagingDir,
          destinationDir: destResolved,
          oldSourceDir: null,
          error: null,
          awaitingCleanup: false,
        });
        this.throwIfCancelled();

        this.repo.addEvent(
          serverId,
          "install_move_started",
          "info",
          `Move installation started: ${sourceDir} → ${destResolved}`,
          {
            what: "Copy installation to a new folder, verify, then update the profile path.",
            location: `${sourceDir} → ${destResolved}`,
          },
        );

        const sourceInspect = await inspectServerInstallationAsync(
          serverId,
          sourceDir,
          { bypassCache: true },
        );
        if (!isInstallationReady(sourceInspect)) {
          throw new Error(
            `Source installation is not ready to move (health: ${sourceInspect.health}). ${sourceInspect.guidance}`,
          );
        }

        await this.instances.assertInstallDirAvailable(destResolved, serverId);

        const destBinary = serverBinaryPath(destResolved);
        const destHealth = await classifyInstallHealthAsync(
          destResolved,
          destBinary,
        );
        if (destHealth.health !== "missing" && destHealth.health !== "empty") {
          throw new Error(
            "Destination is not empty. It must have no files or subfolders.",
          );
        }

        const useRename = canUseSameVolumeRename(sourceDir, destResolved);
        const sourceBytes = await estimateDirectoryBytes(sourceDir);

        if (!useRename) {
          const needed = Math.ceil(sourceBytes * FREE_SPACE_MARGIN);
          const space = await readVolumeSpace(dirname(destResolved));
          if (space !== null && space.freeBytes < needed) {
            const freeGb = (space.freeBytes / (1024 ** 3)).toFixed(1);
            const needGb = (needed / (1024 ** 3)).toFixed(1);
            throw new Error(
              `Not enough free space on ${space.volumePath} (need ~${needGb} GB, have ${freeGb} GB).`,
            );
          }
        }

        this.throwIfCancelled();

        let verifyPath = destResolved;
        let oldSourceStillPresent = true;

        if (useRename) {
          this.emitProgress({
            serverId,
            active: true,
            phase: "copying",
            label: "Moving installation to the new location…",
            percent: 40,
            sourceDir,
            stagingDir: null,
            destinationDir: destResolved,
            oldSourceDir: null,
            error: null,
            awaitingCleanup: false,
          });

          await prepareDestinationForPromote(destResolved, destHealth.health);
          try {
            await rename(sourceDir, destResolved);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(
              `Could not move the installation on the same drive: ${message}`,
            );
          }
          oldSourceStillPresent = false;
          renamedAwayFromSource = true;

          try {
            this.throwIfCancelled();
          } catch (cancelError) {
            if (await rollbackSameVolumeRename(sourceDir, destResolved)) {
              oldSourceStillPresent = true;
              renamedAwayFromSource = false;
            }
            throw cancelError;
          }

          verifyPath = destResolved;
        } else {
          // Cross-volume (or nested): copy into YARK staging, verify, then promote.
          if (await pathExists(stagingDir)) {
            await rm(stagingDir, { recursive: true, force: true });
          }
          await mkdir(stagingDir, { recursive: true });
          await writeFile(
            join(stagingDir, MOVE_STAGING_MARKER),
            `serverId=${serverId}\nsource=${sourceDir}\ndest=${destResolved}\n`,
            "utf8",
          );
          await this.registry.registerStagingPath(stagingDir);

          this.emitProgress({
            serverId,
            active: true,
            phase: "copying",
            label: "Copying installation to the new location…",
            percent: COPY_PROGRESS_START,
            sourceDir,
            stagingDir,
            destinationDir: destResolved,
            oldSourceDir: null,
            error: null,
            awaitingCleanup: false,
          });

          await copyToStagingWithProgress(
            {
              isCancelRequested: () => this.cancelRequested,
              setActiveChild: (child) => {
                this.activeChild = child;
              },
              emitProgress: (progress) => this.emitProgress(progress),
            },
            {
              serverId,
              sourceDir,
              stagingDir,
              destResolved,
              sourceBytes,
            },
          );
          this.throwIfCancelled();

          verifyPath = stagingDir;
        }

        this.emitProgress({
          serverId,
          active: true,
          phase: "verifying",
          label: "Checking that the copy is complete…",
          percent: 80,
          sourceDir: oldSourceStillPresent ? sourceDir : null,
          stagingDir: useRename ? null : stagingDir,
          destinationDir: destResolved,
          oldSourceDir: null,
          error: null,
          awaitingCleanup: false,
        });

        const verified = await inspectServerInstallationAsync(
          serverId,
          verifyPath,
          { bypassCache: true },
        );
        if (!isInstallationReady(verified)) {
          if (useRename && !oldSourceStillPresent) {
            try {
              if (!(await rollbackSameVolumeRename(sourceDir, destResolved))) {
                throw new Error("rename rollback did not restore the original path");
              }
              oldSourceStillPresent = true;
              renamedAwayFromSource = false;
            } catch (rollbackError) {
              const rollbackMessage =
                rollbackError instanceof Error
                  ? rollbackError.message
                  : String(rollbackError);
              throw new Error(
                `Moved installation failed verification (health: ${verified.health}) and could not be moved back: ${rollbackMessage}. ${verified.guidance}`,
              );
            }
          }
          throw new Error(
            `Moved installation failed verification (health: ${verified.health}). ${verified.guidance} The profile still points at the original path.`,
          );
        }

        try {
          this.throwIfCancelled();
        } catch (cancelError) {
          // Post-verify cancel used to skip rename-back and orphan the tree at dest.
          if (useRename && renamedAwayFromSource) {
            if (await rollbackSameVolumeRename(sourceDir, destResolved)) {
              oldSourceStillPresent = true;
              renamedAwayFromSource = false;
            }
          }
          throw cancelError;
        }
        this.emitProgress({
          serverId,
          active: true,
          phase: "committing",
          label: "Switching the server to the new folder…",
          percent: 90,
          sourceDir: oldSourceStillPresent ? sourceDir : null,
          stagingDir: useRename ? null : stagingDir,
          destinationDir: destResolved,
          oldSourceDir: null,
          error: null,
          awaitingCleanup: false,
        });

        if (!useRename) {
          await rm(join(stagingDir, MOVE_STAGING_MARKER), { force: true });
          await promoteStaging(stagingDir, destResolved, destHealth.health);
          await this.registry.unregisterStagingPath(stagingDir);
        }

        const committed = this.instances.commitInstallDir(serverId, destResolved);
        if (installDirKey(committed.installDir) !== installDirKey(destResolved)) {
          throw new Error("Profile commit did not apply the new install path");
        }
        profileCommittedToDest = true;
        renamedAwayFromSource = false;

        let oldSourceRemoved = !oldSourceStillPresent;
        let cleanupError: string | null = null;

        if (oldSourceStillPresent) {
          this.emitProgress({
            serverId,
            active: true,
            phase: "cleanup",
            label: "Removing the previous installation folder…",
            percent: 95,
            sourceDir,
            stagingDir: null,
            destinationDir: destResolved,
            oldSourceDir: sourceDir,
            error: null,
            awaitingCleanup: false,
          });

          try {
            await this.cleanup.deleteOldSourceTree(serverId, sourceDir, {
              alreadyLocked: true,
            });
            oldSourceRemoved = true;
          } catch (cleanupErr) {
            cleanupError =
              cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
            this.repo.addEvent(
              serverId,
              "install_move_cleanup_failed",
              "error",
              `Move succeeded but failed to delete previous folder at ${sourceDir}: ${cleanupError}`,
              {
                what: "The profile uses the new path, but the previous folder could not be deleted.",
                cause: cleanupError,
                location: sourceDir,
                suggestion:
                  "Confirm nothing is using that folder, then retry cleanup from Move installation.",
              },
            );
          }
        }

        this.repo.addEvent(
          serverId,
          "install_move_completed",
          "info",
          oldSourceRemoved
            ? `Move installation completed to ${destResolved}. Previous folder removed.`
            : `Move installation completed to ${destResolved}. Previous folder still at ${sourceDir}.`,
          {
            what: useRename
              ? "Installation was moved on the same drive, verified, and the profile path was updated."
              : "Installation was copied, verified, and the profile path was updated.",
            location: destResolved,
            ...(oldSourceRemoved
              ? {}
              : {
                  suggestion:
                    "Retry deleting the previous installation folder when it is no longer in use.",
                }),
            context: {
              oldSourceDir: sourceDir,
              destinationDir: destResolved,
              oldSourceRemoved,
              sameVolumeRename: useRename,
            },
          },
        );

        const result: MoveInstallResult = {
          serverId,
          sourceDir,
          destinationDir: destResolved,
          oldSourceDir: sourceDir,
          oldSourceRemoved,
          cleanupError,
        };

        if (oldSourceRemoved) {
          // Only drop a pending leftover if we just removed that same path.
          // A later successful move must not erase an older unbound leftover (#215).
          const pending = await this.registry.getPendingCleanup(serverId);
          if (
            pending === null
            || installDirKey(pending) === installDirKey(sourceDir)
          ) {
            await this.registry.clearPendingCleanup(serverId);
          }
        } else {
          await this.registry.setPendingCleanup(serverId, sourceDir);
        }

        this.emitProgress({
          serverId,
          active: false,
          phase: null,
          label: oldSourceRemoved
            ? "Move completed."
            : "Move completed, but the previous folder could not be deleted.",
          percent: 100,
          sourceDir,
          stagingDir: null,
          destinationDir: destResolved,
          oldSourceDir: oldSourceRemoved ? null : sourceDir,
          error: cleanupError,
          awaitingCleanup: !oldSourceRemoved,
        });

        return result;
      });
    } catch (error) {
      const cancelled = isOperationCancelledError(error) || this.cancelRequested;
      const message =
        error instanceof Error ? error.message : String(error);

      // Same-volume rename left the only copy at dest; restore before we claim
      // the profile still uses sourceDir (cancel/fail between rename and commit).
      let renameRollbackFailed = false;
      if (renamedAwayFromSource && !profileCommittedToDest) {
        const current = this.repo.get(serverId);
        const stillOnSource =
          current !== null
          && installDirKey(current.installDir) === installDirKey(sourceDir);
        const alreadyOnDestination =
          current !== null
          && installDirKey(current.installDir) === installDirKey(destResolved);
        if (alreadyOnDestination) {
          // commitInstallDir updates the profile before recording its event. If
          // that event write throws, the move is already committed and dest is
          // authoritative; moving the files back would break the profile.
          profileCommittedToDest = true;
          renamedAwayFromSource = false;
        } else if (stillOnSource) {
          try {
            if (!(await rollbackSameVolumeRename(sourceDir, destResolved))) {
              renameRollbackFailed = true;
            } else {
              renamedAwayFromSource = false;
            }
          } catch {
            renameRollbackFailed = true;
          }
        }
      }

      // Best-effort staging cleanup; leftover dirs are swept on next start.
      try {
        if (await pathExists(stagingDir)) {
          const marker = join(stagingDir, MOVE_STAGING_MARKER);
          if (!(await pathExists(marker))) {
            await writeFile(marker, `serverId=${serverId}\nfailed=1\n`, "utf8");
          }
          await rm(stagingDir, { recursive: true, force: true });
          await this.registry.unregisterStagingPath(stagingDir);
        }
      } catch {
        // Leave for sweepStaleStaging (path stays in the registry).
      }

      const authoritativePath =
        profileCommittedToDest
          ? destResolved
          : renameRollbackFailed || renamedAwayFromSource
          ? destResolved
          : sourceDir;
      const destinationCommittedMessage = cancelled
        ? `Move cancellation arrived after profile commit. Profile uses ${destResolved}.`
        : `Move installation committed to ${destResolved}, but finalization failed: ${message}. Profile uses the destination.`;
      this.repo.addEvent(
        serverId,
        cancelled ? "install_move_cancelled" : "install_move_failed",
        cancelled ? "warning" : "error",
        profileCommittedToDest
          ? destinationCommittedMessage
          : cancelled
          ? renameRollbackFailed
            ? `Move installation cancelled after rename; files may remain at ${destResolved} while the profile still points at ${sourceDir}.`
            : `Move installation cancelled. Profile still uses ${sourceDir}.`
          : renameRollbackFailed
            ? `Move installation failed: ${message}. Files may remain at ${destResolved} while the profile still points at ${sourceDir}.`
            : `Move installation failed: ${message}. Profile still uses ${sourceDir}.`,
        {
          what: profileCommittedToDest
            ? "Move reached profile commit before finalization failed."
            : cancelled
            ? "Move installation was cancelled before profile commit."
            : "Move installation failed before profile commit.",
          cause: cancelled ? "Cancelled by the operator." : message,
          location: authoritativePath,
          suggestion: profileCommittedToDest
            ? "The destination is authoritative. Verify it before retrying Move installation."
            : renameRollbackFailed
            ? `Move the folder back from ${destResolved} to ${sourceDir} manually, or update the profile after confirming the destination tree is intact.`
            : "The original install path remains authoritative. Fix the issue and retry Move installation.",
        },
      );

      this.emitProgress({
        serverId,
        active: false,
        phase: null,
        label: cancelled ? "Move cancelled" : "Move failed",
        percent: null,
        sourceDir,
        stagingDir: null,
        destinationDir: destResolved,
        oldSourceDir: null,
        error: cancelled ? "Cancelled" : message,
        awaitingCleanup: false,
      });

      if (cancelled) {
        throw new OperationCancelledError(
          profileCommittedToDest
            ? "Move cancellation arrived after the profile switched to the destination path."
            : "Move installation cancelled. The profile still points at the original path.",
        );
      }
      throw error;
    } finally {
      this.activeChild = null;
      this.activeServerId = null;
      this.cancelRequested = false;
    }
  }

  async cleanupOldSource(
    serverId: string,
    oldSourceDirRaw: string,
  ): Promise<void> {
    return this.cleanup.cleanupOldSource(serverId, oldSourceDirRaw);
  }

  /** Dismiss the post-move cleanup prompt without deleting files. */
  async dismissCleanupPrompt(serverId: string): Promise<void> {
    return this.cleanup.dismissCleanupPrompt(serverId);
  }

  private throwIfCancelled(): void {
    if (this.cancelRequested) {
      throw new OperationCancelledError();
    }
  }

  private emitProgress(progress: MoveInstallProgress): void {
    this.lastProgress = progress;
    this.emit("progress", progress);
  }
}
