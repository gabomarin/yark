/**
 * Backup create pipeline: flush, job coalescing, and ZIP packaging.
 * BackupService keeps thin public facades and owns policy / critical-queue state.
 */

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { formatBackupFileStamp } from "@shared/backup-file-stamp";
import type {
  BackupKind,
  BackupPolicy,
  BackupRecord,
  BackupType,
  ServerProfile,
} from "@shared/types";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import { rconExec } from "../../infra/rcon/rcon-client";
import { backupKindSubdir, zipDirectory } from "./backup-archive";
import { slugBackupFilePart } from "./backup-portability";
import { packageKind, packageSinglePlayer } from "./backup-package";

const RCON_HOST = "127.0.0.1";

/** Keep map tokens readable in filenames (`TheIsland_WP` → `TheIsland_WP`). */
function mapTokenFileSlug(mapToken: string): string {
  const trimmed = mapToken.trim();
  if (trimmed.length === 0) return "map";
  return trimmed.replace(/[^A-Za-z0-9_]+/g, "-").replace(/^-+|-+$/g, "") || "map";
}

export function allocateUniqueZipPath(
  kindDir: string,
  preferredName: string,
): string {
  const safeName = basename(preferredName);
  const candidate = join(kindDir, safeName);
  if (!existsSync(candidate)) {
    return candidate;
  }
  const stem = safeName.replace(/\.zip$/i, "");
  for (let i = 2; i < 1000; i += 1) {
    const next = join(kindDir, `${stem}-${i}.zip`);
    if (!existsSync(next)) {
      return next;
    }
  }
  throw new Error("Could not allocate a unique import archive name");
}

function humanBackupSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function resolveServerBackupRoot(
  installDir: string,
  backupDir: string | null | undefined,
): string {
  if (typeof backupDir === "string" && backupDir.trim().length > 0) {
    return backupDir.trim();
  }
  return join(installDir, "Backups");
}

export interface BackupCreateHost {
  servers: ServerRepository;
  backups: BackupRepository;
  processes: ProcessManager;
  creatingBackupIds: Set<string>;
  backupJobs: Map<string, Promise<void>>;
  preStopBackupServers: Set<string>;
  mustServer: (serverId: string) => ServerProfile;
  assertInstallReadyForLiveOps: (server: ServerProfile) => Promise<void>;
  throwIfCancelled: () => void;
  applyRetention: (serverId: string, policy: BackupPolicy) => Promise<void>;
  emitChanged: (serverId: string) => void;
}

export class BackupCreatePipeline {
  constructor(private readonly host: BackupCreateHost) {}

  async flushWorldIfActive(serverId: string): Promise<void> {
    if (!this.host.processes.isActive(serverId)) return;
    const server = this.host.processes.applyRuntimePorts(
      this.host.mustServer(serverId),
    );
    try {
      await rconExec(RCON_HOST, server.rconPort, server.adminPassword, "SaveWorld");
    } catch {
      // Hot backup can continue even if SaveWorld fails.
    }
  }

  async createBackups(
    serverId: string,
    type: BackupType,
    notes: string | null,
    kinds: BackupKind[],
    options?: {
      skipFlush?: boolean;
      onKindProgress?: (kind: BackupKind, index: number, total: number) => void;
      onProgressMessage?: (message: string) => void;
      respectCancel?: boolean;
    },
  ): Promise<BackupRecord[]> {
    return this.withServerBackupJob(serverId, async () => {
      if (options?.skipFlush !== true) {
        await this.flushWorldIfActive(serverId);
      }

      const created: BackupRecord[] = [];
      const total = kinds.length;
      for (let index = 0; index < kinds.length; index += 1) {
        if (options?.respectCancel === true) {
          this.host.throwIfCancelled();
        }
        const kind = kinds[index]!;
        options?.onKindProgress?.(kind, index, total);
        const record = await this.createBackup(serverId, type, kind, notes, {
          onProgressMessage: options?.onProgressMessage,
          respectCancel: options?.respectCancel === true,
        });
        if (record !== null) {
          created.push(record);
        }
      }
      return created;
    });
  }

  createSingleBackup(
    serverId: string,
    type: BackupType,
    kind: BackupKind,
    notes: string | null,
    options?: { playerKey?: string; waitForProfile?: boolean },
  ): Promise<BackupRecord | null> {
    // The full stop batch already includes world; do not queue
    // automatic single-kind work behind it while the app may be waiting to quit.
    if (this.host.preStopBackupServers.has(serverId)) return Promise.resolve(null);
    return this.withServerBackupJob(serverId, () =>
      this.createBackup(serverId, type, kind, notes, options),
    );
  }

  async withServerBackupJob<T>(
    serverId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const previous = this.host.backupJobs.get(serverId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.host.backupJobs.set(serverId, tail);
    try {
      return await result;
    } finally {
      if (this.host.backupJobs.get(serverId) === tail) {
        this.host.backupJobs.delete(serverId);
      }
    }
  }

  async createBackup(
    serverId: string,
    type: BackupType,
    kind: BackupKind,
    notes: string | null,
    options?: {
      playerKey?: string;
      waitForProfile?: boolean;
      onProgressMessage?: (message: string) => void;
      respectCancel?: boolean;
    },
  ): Promise<BackupRecord | null> {
    const server = this.host.mustServer(serverId);
    await this.host.assertInstallReadyForLiveOps(server);
    if (options?.respectCancel === true) {
      this.host.throwIfCancelled();
    }
    const policy = this.host.backups.getPolicy(serverId);
    const rootDir = resolveServerBackupRoot(server.installDir, policy.backupDir);
    const kindDir = join(rootDir, backupKindSubdir(kind));

    const stamp = formatBackupFileStamp();
    const playerSlug =
      options?.playerKey !== undefined && options.playerKey.length > 0
        ? `-${slugBackupFilePart(options.playerKey).slice(0, 24)}`
        : "";
    const mapSlug =
      kind === "world" && server.map.trim().length > 0
        ? `-${mapTokenFileSlug(server.map)}`
        : "";
    const preferredName =
      `${slugBackupFilePart(server.name)}-${kind}-${type}${mapSlug}${playerSlug}-${stamp}.zip`;
    await mkdir(kindDir, { recursive: true });
    const zipPath = allocateUniqueZipPath(kindDir, preferredName);
    const stagingDir = join(tmpdir(), `yark-backup-${randomUUID()}`);

    await mkdir(stagingDir, { recursive: true });

    const mapToken = kind === "world" ? server.map.trim() || null : null;
    const record = this.host.backups.createBackupStart({
      serverId,
      type,
      kind,
      path: zipPath,
      notes,
      mapToken,
    });
    this.host.creatingBackupIds.add(record.id);

    try {
      options?.onProgressMessage?.(`Packaging ${kind} files for backup…`);
      if (options?.respectCancel === true) {
        this.host.throwIfCancelled();
      }
      const packaged =
        options?.playerKey !== undefined && kind === "players"
          ? await packageSinglePlayer(server, stagingDir, options.playerKey, {
              waitForProfile: options.waitForProfile === true,
            })
          : await packageKind(server, kind, stagingDir);

      // Per-player session archives with no matching profile are not recoverable —
      // drop them so they do not consume retention slots.
      if (
        options?.playerKey !== undefined
        && kind === "players"
        && packaged.meta.empty === true
      ) {
        await rm(stagingDir, { recursive: true, force: true });
        await rm(zipPath, { force: true }).catch(() => undefined);
        this.host.backups.deleteBackupRecord(record.id);
        this.host.creatingBackupIds.delete(record.id);
        return null;
      }

      if (kind === "world" && packaged.meta.empty === true) {
        // Disaster recovery: live map folder may already be gone. Skip the
        // empty pre_restore safeguard so restore can recreate it.
        if (type === "pre_restore") {
          await rm(stagingDir, { recursive: true, force: true });
          await rm(zipPath, { force: true }).catch(() => undefined);
          this.host.backups.deleteBackupRecord(record.id);
          this.host.creatingBackupIds.delete(record.id);
          return null;
        }
        throw new Error("No world save data found to back up");
      }

      if (options?.respectCancel === true) {
        this.host.throwIfCancelled();
      }

      await writeFile(
        join(stagingDir, "manifest.json"),
        JSON.stringify(
          {
            server: {
              id: server.id,
              name: server.name,
              map: server.map,
              installDir: server.installDir,
              clusterId: server.clusterId,
            },
            backup: {
              id: record.id,
              type,
              kind,
              createdAt: record.createdAt,
              ...packaged.meta,
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const lightCompressBinarySaves = kind === "world" || kind === "players";
      options?.onProgressMessage?.(
        lightCompressBinarySaves
          ? `Writing ${kind} backup archive…`
          : `Compressing ${kind} backup archive…`,
      );
      const sizeBytes = await zipDirectory(stagingDir, zipPath, {
        lightCompressBinarySaves,
      });
      if (options?.respectCancel === true) {
        this.host.throwIfCancelled();
      }
      await rm(stagingDir, { recursive: true, force: true });

      const completed = this.host.backups.completeBackup(record.id, sizeBytes);
      if (completed === null) {
        throw new Error("Could not mark backup as completed");
      }

      const missingHint = packaged.meta.empty ? ` (no ${kind} data present yet)` : "";
      this.host.servers.addEvent(
        serverId,
        "backup_created",
        "info",
        `Backup ${type}/${kind} completed for \"${server.name}\" (${humanBackupSize(sizeBytes)})${missingHint}`,
      );

      // Retention runs after success. Failures here must not delete the new zip
      // or mark this backup failed — the archive is already durable.
      try {
        await this.host.applyRetention(serverId, policy);
      } catch (retentionErr) {
        const retentionMessage =
          retentionErr instanceof Error ? retentionErr.message : String(retentionErr);
        this.host.servers.addEvent(
          serverId,
          "error",
          "warning",
          `Backup retention failed after successful ${type}/${kind} backup for \"${server.name}\": ${retentionMessage}`,
          {
            what: "The new backup was saved, but pruning older archives failed.",
            cause: retentionMessage,
            location: zipPath,
            suggestion:
              "Check destination permissions and free disk space, then run cleanup or create another backup to retry retention.",
            context: {
              type,
              kind,
              backupId: record.id,
            },
          },
        );
      }
      this.host.emitChanged(serverId);
      return completed;
    } catch (err) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      await rm(zipPath, { force: true }).catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      this.host.backups.failBackup(record.id, message);
      this.host.servers.addEvent(
        serverId,
        "error",
        "error",
        `Backup ${type}/${kind} failed for \"${server.name}\": ${message}`,
        {
          what: `A ${kind} backup (${type}) failed before the archive was completed.`,
          cause: message,
          location: zipPath,
          suggestion:
            "Check destination permissions and free disk space, then create the backup again from the server Backups tab.",
          context: {
            type,
            kind,
            backupId: record.id,
          },
        },
      );
      this.host.emitChanged(serverId);
      throw err;
    } finally {
      this.host.creatingBackupIds.delete(record.id);
    }
  }
}
