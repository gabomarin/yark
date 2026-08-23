import { type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type {
  CloneInstallProgress,
  ServerProfile,
  ServerProfileInput,
} from "@shared/types";
import { offsetPort } from "@shared/types";
import {
  normalizeWindowsPath,
  suggestCloneInstallDir,
} from "@shared/server-install-path";
import { findPortConflicts } from "./validation";
import type { BackupService } from "../backups/backup-service";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import { seedCloneIniFiles } from "./clone-ini-seed";
import {
  assertEnoughFreeSpaceForCopy,
  copyInstallTreeWithProgress,
  estimateDirectoryBytes,
} from "./clone-install-copy";
import { killChildProcessTreeAsync } from "../../infra/process/kill-win-process-tree";
import {
  isOperationCancelledError,
  OperationCancelledError,
} from "../updates/robocopy-tree";
import { inspectServerInstallationAsync } from "./server-installation";
import { syncProfileSettingsToIni } from "./sync-profile-ini";
import { installDirKey } from "./install-dir-safety";

export interface CloneParams {
  name: string;
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  installDir: string;
  copyInstallFolder?: boolean;
}

interface InstanceCloneDependencies {
  repo: ServerRepository;
  processes: ProcessManager;
  backups: BackupService;
  locks: InstanceLockManager;
  withFleetCreateLock: <T>(work: () => Promise<T> | T) => Promise<T>;
  assertValidInput: (input: ServerProfileInput) => void;
  assertCreateInstallTarget: (installDir: string) => Promise<void>;
  assertNoPortConflicts: (input: ServerProfileInput) => void;
  assertUniqueName: (name: string) => void;
  deleteProfile: (
    id: string,
    options: { deleteInstallFiles: boolean },
  ) => Promise<void>;
  isStopInProgress: (id: string) => boolean;
  emitProgress: (payload: CloneInstallProgress) => void;
}

export class InstanceClone {
  private copyBusy = false;
  private cancelRequested = false;
  private activeChild: ChildProcess | null = null;

  constructor(private readonly deps: InstanceCloneDependencies) {}

  async clone(id: string): Promise<ServerProfile> {
    return this.deps.withFleetCreateLock(async () => {
      const source = this.requireSource(id);
      const existing = this.deps.repo.list();
      const names = new Set(existing.map((profile) => profile.name.trim().toLowerCase()));
      const installDirs = new Set(
        existing.map((profile) => installDirKey(profile.installDir)),
      );
      let copyNumber = 1;
      let name: string;
      let installDir: string;
      for (;;) {
        name =
          copyNumber === 1
            ? `${source.name} (copy)`
            : `${source.name} (copy ${copyNumber})`;
        installDir = suggestCloneInstallDir(source.installDir, name);
        if (
          !names.has(name.trim().toLowerCase())
          && !installDirs.has(installDirKey(installDir))
          && !existsSync(installDir)
        ) {
          break;
        }
        copyNumber++;
      }

      let offset = 10;
      let input: ServerProfileInput;
      for (;;) {
        input = this.buildCloneInput(source, {
          name,
          sessionName: `${source.sessionName} (copy)`,
          gamePort: offsetPort(source.gamePort, offset),
          queryPort: offsetPort(source.queryPort, offset),
          rconPort: offsetPort(source.rconPort, offset),
          installDir,
        });
        if (findPortConflicts(existing, { ...input, id: undefined }).length === 0) {
          break;
        }
        offset += 10;
        if (offset > 1000) {
          throw new Error("No free ports found for the clone");
        }
      }

      this.deps.assertValidInput(input);
      await this.deps.assertCreateInstallTarget(input.installDir);
      const profile = this.deps.repo.create(input, source.enabled);
      try {
        await seedCloneIniFiles(source.installDir, profile);
      } catch (error) {
        await this.deps
          .deleteProfile(profile.id, { deleteInstallFiles: true })
          .catch(() => undefined);
        throw error;
      }
      this.recordCreated(profile, false);
      return profile;
    });
  }

  async cloneWithParams(id: string, params: CloneParams): Promise<ServerProfile> {
    if (params.copyInstallFolder === true) {
      return this.cloneWithFolderCopy(id, params);
    }
    return this.deps.withFleetCreateLock(async () => {
      const source = this.requireSource(id);
      const profile = await this.createCloneProfile(source, params);
      try {
        await seedCloneIniFiles(source.installDir, profile);
      } catch (error) {
        await this.deps
          .deleteProfile(profile.id, { deleteInstallFiles: true })
          .catch(() => undefined);
        throw error;
      }
      this.recordCreated(profile, false);
      return profile;
    });
  }

  cancelCopy(): boolean {
    if (!this.copyBusy) {
      return false;
    }
    this.cancelRequested = true;
    void killChildProcessTreeAsync(this.activeChild);
    return true;
  }

  isCopyBusy(): boolean {
    return this.copyBusy;
  }

  private async createCloneProfile(
    source: ServerProfile,
    params: CloneParams,
  ): Promise<ServerProfile> {
    const input = this.buildCloneInput(source, {
      ...params,
      installDir: normalizeWindowsPath(params.installDir),
    });
    this.deps.assertValidInput(input);
    this.deps.assertUniqueName(input.name);
    await this.deps.assertCreateInstallTarget(input.installDir);
    this.deps.assertNoPortConflicts(input);
    return this.deps.repo.create(input, source.enabled);
  }

  private buildCloneInput(
    source: ServerProfile,
    params: Omit<CloneParams, "copyInstallFolder">,
  ): ServerProfileInput {
    return {
      name: params.name,
      map: source.map,
      mapModId: source.mapModId ?? null,
      mapSaveFolder: source.mapSaveFolder ?? null,
      installDir: params.installDir,
      sessionName: params.sessionName,
      maxPlayers: source.maxPlayers,
      gamePort: params.gamePort,
      queryPort: params.queryPort,
      rconPort: params.rconPort,
      serverPassword: source.serverPassword,
      adminPassword: source.adminPassword,
      clusterId: source.clusterId,
      clusterDir: source.clusterDir,
      extraArgs: [...source.extraArgs],
      structuredLaunchArgs: { ...(source.structuredLaunchArgs ?? {}) },
      mods: [...source.mods],
      disabledMods: [...(source.disabledMods ?? [])],
      modMetadataCache: { ...(source.modMetadataCache ?? {}) },
      autoStart: source.autoStart,
    };
  }

  private async cloneWithFolderCopy(
    id: string,
    params: CloneParams,
  ): Promise<ServerProfile> {
    if (this.copyBusy) {
      throw new Error("Another clone folder copy is already running");
    }
    this.copyBusy = true;
    this.cancelRequested = false;
    this.activeChild = null;

    let source: ServerProfile | null = null;
    let created: ServerProfile | null = null;
    try {
      source = this.requireSource(id);
      this.assertSourceIdle(source.id);
      await this.assertSourceHasFiles(source);
      this.throwIfCancelled();
      this.emitProgress(source, params.installDir, "validating",
        "Checking disk space for the folder copy…", 4);

      const sourceBytes = await estimateDirectoryBytes(source.installDir);
      this.throwIfCancelled();
      await assertEnoughFreeSpaceForCopy(
        normalizeWindowsPath(params.installDir),
        sourceBytes,
      );
      this.throwIfCancelled();

      created = await this.deps.withFleetCreateLock(async () => {
        const latest = this.requireSource(id);
        this.assertSourceIdle(latest.id);
        return this.createCloneProfile(latest, params);
      });

      await this.deps.locks.withLock(source.id, "clone-copy", async () => {
        await this.deps.locks.withLock(created!.id, "clone-copy", async () => {
          this.assertSourceIdle(source!.id, { ignoreHeldLock: true });
          this.throwIfCancelled();
          this.emitProgress(source!, created!.installDir, "copying",
            "Copying server folder…", 10);
          await copyInstallTreeWithProgress({
            sourceDir: source!.installDir,
            destDir: created!.installDir,
            sourceBytes,
            isCancelled: () => this.cancelRequested,
            onSpawn: (child) => {
              this.activeChild = child;
            },
            onProgress: (percent, label) => {
              this.emitProgress(source!, created!.installDir, "copying", label, percent);
            },
          });
        });
      });

      this.emitProgress(source, created.installDir, "applying",
        "Applying the new ports and session name…", 94);
      await syncProfileSettingsToIni(created);
      this.recordCreated(created, true);
      return created;
    } catch (error) {
      if (created !== null) {
        try {
          await this.rollback(created, source?.id ?? created.id);
        } catch (cleanupError) {
          const copyMessage = error instanceof Error ? error.message : String(error);
          const cleanupMessage =
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          throw new Error(
            `Could not copy the server folder (${copyMessage}). The new profile "${created.name}" may still exist and files may remain at ${created.installDir}. Remove that incomplete server in YARK if it is still listed. Cleanup: ${cleanupMessage}`,
          );
        }
        throw this.copyFailure(error, true);
      }
      if (isOperationCancelledError(error)) {
        throw new Error("Folder copy cancelled.");
      }
      throw error;
    } finally {
      this.copyBusy = false;
      this.cancelRequested = false;
      this.activeChild = null;
      if (source !== null) {
        this.deps.emitProgress({
          serverId: source.id,
          active: false,
          phase: null,
          label: "",
          percent: null,
          sourceDir: source.installDir,
          destinationDir:
            created?.installDir ?? normalizeWindowsPath(params.installDir),
          error: null,
        });
      }
    }
  }

  private requireSource(id: string): ServerProfile {
    const source = this.deps.repo.get(id);
    if (source === null) {
      throw new Error("Server to clone does not exist");
    }
    return source;
  }

  private assertSourceIdle(
    sourceId: string,
    options?: { ignoreHeldLock?: boolean },
  ): void {
    if (this.deps.processes.isActive(sourceId)) {
      throw new Error("Stop the server before copying its install folder");
    }
    if (this.deps.isStopInProgress(sourceId)) {
      throw new Error("Cannot copy the install folder while the server is stopping");
    }
    if (this.deps.backups.hasServerWork(sourceId)) {
      throw new Error("Cannot copy the install folder while a backup job is running");
    }
    if (
      options?.ignoreHeldLock !== true
      && this.deps.locks.isLocked(sourceId)
    ) {
      throw new Error(
        "Cannot copy the install folder while another job is running on this server",
      );
    }
  }

  private async assertSourceHasFiles(source: ServerProfile): Promise<void> {
    const installation = await inspectServerInstallationAsync(
      source.id,
      source.installDir,
      { bypassCache: true },
    );
    if (
      installation.health === "missing"
      || installation.health === "empty"
      || installation.health === "inaccessible"
      || installation.health === "unknown"
    ) {
      throw new Error(
        `The source install folder has no server files to copy (${installation.health}). Uncheck Copy entire server folder to clone the profile only.`,
      );
    }
  }

  private throwIfCancelled(): void {
    if (this.cancelRequested) {
      throw new OperationCancelledError("Folder copy cancelled");
    }
  }

  private emitProgress(
    source: ServerProfile,
    destinationDir: string,
    phase: "validating" | "copying" | "applying",
    label: string,
    percent: number,
  ): void {
    this.deps.emitProgress({
      serverId: source.id,
      active: true,
      phase,
      label,
      percent,
      sourceDir: source.installDir,
      destinationDir: normalizeWindowsPath(destinationDir),
      error: null,
    });
  }

  private async rollback(
    profile: ServerProfile,
    sourceServerId: string,
  ): Promise<void> {
    this.deps.emitProgress({
      serverId: sourceServerId,
      active: true,
      phase: "cleanup",
      label: "Removing the incomplete clone…",
      percent: 96,
      sourceDir: null,
      destinationDir: profile.installDir,
      error: null,
    });
    await this.deps.deleteProfile(profile.id, { deleteInstallFiles: true });
  }

  private copyFailure(error: unknown, removedClone: boolean): Error {
    if (isOperationCancelledError(error)) {
      return new Error(
        removedClone
          ? "Folder copy cancelled. The clone was not kept."
          : "Folder copy cancelled.",
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return removedClone
      ? new Error(
          `Could not copy the server folder (${message}). The incomplete clone was removed.`,
        )
      : error instanceof Error
        ? error
        : new Error(message);
  }

  private recordCreated(profile: ServerProfile, copiedFolder: boolean): void {
    const copiedNote = copiedFolder ? ", install folder copied" : "";
    this.deps.repo.addEvent(
      profile.id,
      "server_created",
      "info",
      `Server "${profile.name}" created at ${profile.installDir} (map ${profile.map}${copiedNote})`,
    );
  }
}
