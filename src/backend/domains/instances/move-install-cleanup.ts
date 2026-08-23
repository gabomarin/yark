/**
 * Post-move old-source cleanup for MoveInstallService (#215).
 */

import { access, rm } from "node:fs/promises";
import { normalizeWindowsPath } from "@shared/server-install-path";
import type { MoveInstallProgress } from "@shared/types";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import {
  assertSafeInstallDirForWipe,
  installDirKey,
} from "./install-dir-safety";
import type { MoveInstallRegistry } from "./move-install-registry";

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export interface MoveInstallCleanupHost {
  repo: ServerRepository;
  processes: ProcessManager;
  locks: InstanceLockManager;
  registry: MoveInstallRegistry;
  emitProgress: (progress: MoveInstallProgress) => void;
}

/**
 * Safety-checked recursive delete of a previous install folder and cleanup prompts.
 */
export class MoveInstallCleanup {
  constructor(private readonly host: MoveInstallCleanupHost) {}

  /**
   * Deletes the old source tree after a successful move.
   * Requires a main-process-recorded prior path for this server (#215) and that
   * the profile no longer reference that path.
   */
  async cleanupOldSource(
    serverId: string,
    oldSourceDirRaw: string,
  ): Promise<void> {
    const profile = this.host.repo.get(serverId);
    if (profile === null) {
      throw new Error("Server does not exist");
    }
    if (this.host.processes.isActive(serverId)) {
      throw new Error("Stop the server before cleaning up the old installation");
    }

    const requestedDir = assertSafeInstallDirForWipe(
      normalizeWindowsPath(oldSourceDirRaw),
    );
    const recordedDir = await this.host.registry.getPendingCleanup(serverId);
    if (recordedDir === null) {
      throw new Error(
        "No pending install cleanup for this server. The previous folder may already have been removed or dismissed.",
      );
    }
    if (installDirKey(recordedDir) !== installDirKey(requestedDir)) {
      throw new Error(
        "Cleanup path does not match the previous installation recorded for this server.",
      );
    }
    // Wipe only the main-recorded path (renderer value is for equality only).
    const oldSourceDir = recordedDir;

    this.host.emitProgress({
      serverId,
      active: true,
      phase: "cleanup",
      label: "Removing the previous installation folder…",
      percent: 50,
      sourceDir: null,
      stagingDir: null,
      destinationDir: profile.installDir,
      oldSourceDir,
      error: null,
      awaitingCleanup: true,
    });

    try {
      await this.host.locks.withLock(serverId, "move-install-cleanup", async () => {
        await this.deleteOldSourceTree(serverId, oldSourceDir, {
          alreadyLocked: true,
        });
      });
      await this.host.registry.clearPendingCleanup(serverId);
      this.clearAwaitingCleanup(serverId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.host.repo.addEvent(
        serverId,
        "install_move_cleanup_failed",
        "error",
        `Failed to delete old installation at ${oldSourceDir}: ${message}`,
        {
          what: "Cleanup of the previous install folder failed.",
          cause: message,
          location: oldSourceDir,
          suggestion:
            "Confirm no other process is using the folder, then retry cleanup.",
        },
      );
      this.host.emitProgress({
        serverId,
        active: false,
        phase: null,
        label: "Cleanup failed",
        percent: null,
        sourceDir: null,
        stagingDir: null,
        destinationDir: profile.installDir,
        oldSourceDir,
        error: message,
        awaitingCleanup: true,
      });
      throw error;
    }
  }

  /** Dismiss the post-move cleanup prompt without deleting files. */
  async dismissCleanupPrompt(serverId: string): Promise<void> {
    await this.host.registry.clearPendingCleanup(serverId);
    this.clearAwaitingCleanup(serverId);
  }

  /**
   * Safety-checked recursive delete of a previous install folder.
   * Caller must ensure the profile no longer points at this path (or be about to).
   */
  async deleteOldSourceTree(
    serverId: string,
    oldSourceDirRaw: string,
    options: { alreadyLocked: boolean },
  ): Promise<void> {
    void options; // lock ownership is the caller's responsibility
    const profile = this.host.repo.get(serverId);
    if (profile === null) {
      throw new Error("Server does not exist");
    }

    const oldSourceDir = assertSafeInstallDirForWipe(
      normalizeWindowsPath(oldSourceDirRaw),
    );
    if (installDirKey(profile.installDir) === installDirKey(oldSourceDir)) {
      throw new Error(
        "Cannot delete the old path: the profile still points at it. Finish Move installation first.",
      );
    }

    const shared = this.host.repo
      .list()
      .filter(
        (item) =>
          item.id !== serverId
          && installDirKey(item.installDir) === installDirKey(oldSourceDir),
      );
    if (shared.length > 0) {
      throw new Error(
        `Cannot delete "${oldSourceDir}": still used by ${shared.map((s) => s.name).join(", ")}.`,
      );
    }

    if (!(await pathExists(oldSourceDir))) {
      this.host.repo.addEvent(
        serverId,
        "install_move_cleanup_completed",
        "info",
        `Old install path already absent: ${oldSourceDir}`,
      );
      return;
    }

    await rm(oldSourceDir, { recursive: true, force: true });
    this.host.repo.addEvent(
      serverId,
      "install_move_cleanup_completed",
      "info",
      `Deleted old installation at ${oldSourceDir}`,
      {
        what: "Previous install files were removed after a successful move.",
        location: oldSourceDir,
      },
    );
  }

  clearAwaitingCleanup(serverId: string): void {
    this.host.emitProgress({
      serverId,
      active: false,
      phase: null,
      label: "",
      percent: null,
      sourceDir: null,
      stagingDir: null,
      destinationDir: null,
      oldSourceDir: null,
      error: null,
      awaitingCleanup: false,
    });
  }
}
