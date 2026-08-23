import { existsSync } from "node:fs";
import type { BackupKind, BackupRecord, BackupType, ServerProfile } from "@shared/types";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import { isReadableZipArchive, zipHasBackupLayout } from "./backup-archive";
import type { BackupCriticalJob } from "./backup-critical-jobs";
import { isRestoreHistoryOwnedByJob as restoreHistoryOwnedByJob } from "./backup-restore";

export const CRITICAL_BACKUP_KINDS: readonly BackupKind[] = ["world", "ini"];

export interface BackupCriticalJobProgressHandlers {
  onKindProgress?: (kind: BackupKind, index: number, total: number) => void;
  onProgressMessage?: (message: string) => void;
}

export interface BackupCriticalJobExecutionControl {
  checkpoint: (phase: string) => void;
  progress?: BackupCriticalJobProgressHandlers;
  throwIfCancelled: () => void;
}

export interface BackupCriticalJobExecutor {
  resumePreUpdateBackupJob: (
    job: BackupCriticalJob,
    control: BackupCriticalJobExecutionControl,
  ) => Promise<BackupRecord[]>;
  resumeRestoreJob: (
    job: BackupCriticalJob,
    control: BackupCriticalJobExecutionControl,
  ) => Promise<void>;
}

interface CriticalBackupCreateOptions {
  respectCancel?: boolean;
  onProgressMessage?: (message: string) => void;
}

export interface DefaultBackupCriticalJobExecutorDependencies {
  servers: Pick<ServerRepository, "addEvent">;
  backups: Pick<
    BackupRepository,
    | "completeRestoreHistory"
    | "getBackup"
    | "getRestoreHistory"
    | "insertRestoreHistory"
    | "listBackups"
  >;
  processes: Pick<ProcessManager, "isActive">;
  createBackups: (
    serverId: string,
    type: BackupType,
    notes: string | null,
    kinds: BackupKind[],
    options?: CriticalBackupCreateOptions,
  ) => Promise<BackupRecord[]>;
  reconcileDiskBackups: (serverId: string) => Promise<number>;
  mustServer: (serverId: string) => ServerProfile;
  applyRestore: (server: ServerProfile, backup: BackupRecord) => Promise<void>;
  emitChanged: (serverId: string) => void;
}

export class DefaultBackupCriticalJobExecutor implements BackupCriticalJobExecutor {
  constructor(private readonly deps: DefaultBackupCriticalJobExecutorDependencies) {}

  async resumePreUpdateBackupJob(
    job: BackupCriticalJob,
    control: BackupCriticalJobExecutionControl,
  ): Promise<BackupRecord[]> {
    control.throwIfCancelled();
    control.progress?.onProgressMessage?.(
      "Creating pre-update backups (world, INI) before SteamCMD…",
    );
    control.checkpoint("reconciling-backups");
    await this.deps.reconcileDiskBackups(job.serverId);
    control.throwIfCancelled();
    const marker = `[critical-job:${job.id}]`;
    const candidates = this.deps.backups
      .listBackups(job.serverId, 10_000)
      .filter(
        (backup) =>
          backup.type === "pre_update"
          && backup.status === "completed"
          && existsSync(backup.path)
          && backup.notes?.includes(marker) === true,
      );
    const existing: BackupRecord[] = [];
    for (const backup of candidates) {
      try {
        const readable = await isReadableZipArchive(backup.path);
        if (readable && (await zipHasBackupLayout(backup.path))) {
          existing.push(backup);
        }
      } catch {
        // Unreadable or corrupt archive — do not count as completion evidence.
      }
    }
    const completedByKind = new Map<BackupKind, BackupRecord>();
    for (const backup of existing) {
      if (!completedByKind.has(backup.kind)) {
        completedByKind.set(backup.kind, backup);
      }
    }

    let nextKindIndex = 0;
    const total = CRITICAL_BACKUP_KINDS.length;
    while (nextKindIndex < CRITICAL_BACKUP_KINDS.length) {
      control.throwIfCancelled();
      const kind = CRITICAL_BACKUP_KINDS[nextKindIndex]!;
      if (!completedByKind.has(kind)) {
        control.checkpoint(`creating-backup:${kind}`);
        control.progress?.onKindProgress?.(kind, nextKindIndex, total);
        const created = await this.deps.createBackups(
          job.serverId,
          "pre_update",
          `Pre-update backup ${marker}`,
          [kind],
          {
            respectCancel: true,
            onProgressMessage: control.progress?.onProgressMessage,
          },
        );
        const completed = created.find(
          (backup) =>
            backup.serverId === job.serverId
            && backup.type === "pre_update"
            && backup.kind === kind
            && backup.status === "completed"
            && existsSync(backup.path)
            && backup.notes?.includes(marker) === true,
        );
        if (completed === undefined) {
          throw new Error(
            `Pre-update backup did not produce durable ${kind} evidence (server: ${job.serverId}, job: ${job.id})`,
          );
        }
        completedByKind.set(kind, completed);
      }
      nextKindIndex += 1;
      job.context.completedBackupIds = CRITICAL_BACKUP_KINDS
        .map((completedKind) => completedByKind.get(completedKind)?.id)
        .filter((backupId): backupId is string => backupId !== undefined);
      job.context.nextKindIndex = nextKindIndex;
      control.checkpoint(`backup-complete:${kind}`);
    }

    control.progress?.onProgressMessage?.("Pre-update backups completed.");
    return CRITICAL_BACKUP_KINDS.map((kind) => completedByKind.get(kind)!);
  }

  async resumeRestoreJob(
    job: BackupCriticalJob,
    control: BackupCriticalJobExecutionControl,
  ): Promise<void> {
    const server = this.deps.mustServer(job.serverId);
    if (this.deps.processes.isActive(job.serverId)) {
      throw new Error("Stop the server before restoring a backup");
    }
    if (job.backupId === null) throw new Error("backupId required for restore job");
    const backup = this.deps.backups.getBackup(job.backupId);
    if (
      backup === null
      || backup.serverId !== job.serverId
      || backup.status !== "completed"
    ) {
      throw new Error("Invalid backup for restore");
    }

    const marker = `[critical-job:${job.id}]`;
    let restoreHistoryId = job.context.restoreHistoryId;
    const existingHistory =
      typeof restoreHistoryId === "number"
        ? this.deps.backups.getRestoreHistory(restoreHistoryId)
        : null;
    if (existingHistory?.status === "completed") {
      if (!restoreHistoryOwnedByJob(job.id, job.serverId, backup.id, existingHistory)) {
        throw new Error("Restore history evidence does not belong to this recovery job");
      }
      control.checkpoint("restore-complete");
      return;
    }
    if (
      existingHistory !== null
      && !restoreHistoryOwnedByJob(job.id, job.serverId, backup.id, existingHistory)
    ) {
      throw new Error("Restore history evidence does not belong to this recovery job");
    }
    if (existingHistory === null || existingHistory.status === "failed") {
      restoreHistoryId = this.deps.backups.insertRestoreHistory({
        serverId: job.serverId,
        backupId: backup.id,
        status: "started",
        notes: marker,
      });
      job.context.restoreHistoryId = restoreHistoryId;
      control.checkpoint("restore-history-started");
    }

    control.throwIfCancelled();
    control.checkpoint("creating-restore-safeguard");
    if (restoreHistoryId === undefined) {
      throw new Error("Restore history checkpoint was not created");
    }
    control.progress?.onProgressMessage?.(
      `Creating pre-restore safeguard (${backup.kind}) before applying the archive…`,
    );
    const safeguards = this.deps.backups
      .listBackups(job.serverId, 10_000)
      .filter(
        (candidate) =>
          candidate.type === "pre_restore"
          && candidate.kind === backup.kind
          && candidate.status === "completed"
          && candidate.notes?.includes(marker) === true,
      );
    if (safeguards.length === 0) {
      control.progress?.onKindProgress?.(backup.kind, 0, 1);
      const created = await this.deps.createBackups(
        job.serverId,
        "pre_restore",
        `Safeguard before restore ${marker}`,
        [backup.kind],
        {
          respectCancel: true,
          onProgressMessage: control.progress?.onProgressMessage,
        },
      );
      job.context.safeguardBackupIds = created.map((candidate) => candidate.id);
    } else {
      job.context.safeguardBackupIds = safeguards.map((candidate) => candidate.id);
    }
    control.throwIfCancelled();
    control.checkpoint("restore-safeguard-complete");

    control.checkpoint("applying-restore");
    control.progress?.onProgressMessage?.(`Applying ${backup.kind} restore…`);
    await this.deps.applyRestore(server, backup);
    this.deps.backups.completeRestoreHistory(restoreHistoryId, "completed", marker);
    control.checkpoint("restore-complete");
    this.deps.servers.addEvent(
      job.serverId,
      "backup_restored",
      "info",
      `Restore applied on "${server.name}" from ${backup.kind} backup ${backup.id}`,
    );
    this.deps.emitChanged(job.serverId);
  }
}
