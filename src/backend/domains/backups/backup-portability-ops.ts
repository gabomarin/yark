/**
 * Export / import orchestration for portable backup ZIPs.
 * Pure naming helpers remain in backup-portability.ts.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { formatBackupFileStamp } from "@shared/backup-file-stamp";
import type { BackupKind, BackupRecord, ServerProfile } from "@shared/types";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import {
  backupKindSubdir,
  isZipBackupPath,
  parseBackupManifest,
  readZipTextEntry,
  validatePortableZip,
  zipDirectory,
} from "./backup-archive";
import {
  buildImportedZipFileName,
  portableImportNotes,
  resolveExportZipDestination,
  resolveImportedBackupId,
} from "./backup-portability";
import {
  ensureParentDir,
  sameFsPath,
} from "./backup-disk";
import {
  allocateUniqueZipPath,
  resolveServerBackupRoot,
} from "./backup-create-pipeline";

export interface BackupPortabilityOpsHost {
  servers: ServerRepository;
  backups: BackupRepository;
  mustServer: (serverId: string) => ServerProfile;
  emitChanged: (serverId: string) => void;
}

export class BackupPortabilityOps {
  constructor(private readonly host: BackupPortabilityOpsHost) {}

  /**
   * Copy a completed managed archive to `destinationPath`.
   * ZIP archives are copied as-is; legacy folders are zipped into the destination.
   * Does not mutate the managed archive or live server files.
   */
  async exportBackup(
    serverId: string,
    backupId: string,
    destinationPath: string,
  ): Promise<string> {
    this.host.mustServer(serverId);
    const backup = this.host.backups.getBackup(backupId);
    if (backup === null || backup.serverId !== serverId) {
      throw new Error("Backup not found");
    }
    if (backup.status !== "completed") {
      throw new Error("Only completed backups can be exported");
    }
    const dest = destinationPath.trim();
    if (dest.length === 0) {
      throw new Error("Export destination is required");
    }
    const destZip = resolveExportZipDestination(dest);
    if (!existsSync(backup.path)) {
      throw new Error("Backup archive is missing on disk");
    }

    await ensureParentDir(destZip);
    try {
      if (isZipBackupPath(backup.path)) {
        await copyFile(backup.path, destZip);
      } else {
        await zipDirectory(backup.path, destZip);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not write export destination: ${message}`);
    }

    return destZip;
  }

  /**
   * Validate a portable YARK ZIP and copy it into the managed catalog.
   * Never restores live server files.
   */
  async importBackup(
    serverId: string,
    kind: BackupKind,
    sourcePath: string,
  ): Promise<BackupRecord> {
    const server = this.host.mustServer(serverId);
    const source = sourcePath.trim();
    if (source.length === 0) {
      throw new Error("Import source path is required");
    }
    if (!existsSync(source)) {
      throw new Error("Import archive not found");
    }

    await validatePortableZip(source, kind);

    const sourceResolved = resolve(source);
    const alreadyCataloged = this.host.backups
      .listBackupPaths(serverId)
      .some((catalogPath) => sameFsPath(catalogPath, sourceResolved));
    if (alreadyCataloged) {
      throw new Error("Archive is already in this server's backup catalog");
    }

    const policy = this.host.backups.getPolicy(serverId);
    const rootDir = resolveServerBackupRoot(server.installDir, policy.backupDir);
    const kindDir = join(rootDir, backupKindSubdir(kind));
    await mkdir(kindDir, { recursive: true });

    const stamp = formatBackupFileStamp();
    const preferredName = buildImportedZipFileName({
      serverName: server.name,
      kind,
      stamp,
    });
    const destPath = allocateUniqueZipPath(kindDir, preferredName);

    try {
      await copyFile(sourceResolved, destPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not copy import into backup destination: ${message}`);
    }

    let record: BackupRecord;
    try {
      const info = await stat(destPath);
      const manifestRaw = await readZipTextEntry(destPath, "manifest.json");
      const parsed = parseBackupManifest(manifestRaw);
      const createdAt = parsed?.createdAt ?? info.mtime.toISOString();
      const type = parsed?.type ?? "manual";
      const id = resolveImportedBackupId(
        parsed?.id,
        parsed?.id !== undefined && this.host.backups.getBackup(parsed.id) !== null,
      );
      record = this.host.backups.insertCompletedBackup({
        id,
        serverId,
        type,
        kind: parsed?.kind ?? kind,
        path: destPath,
        sizeBytes: info.size,
        createdAt,
        completedAt: createdAt,
        notes: parsed?.notes ?? portableImportNotes(basename(sourceResolved)),
        mapToken: parsed?.mapToken ?? null,
      });
    } catch (err) {
      await rm(destPath, { force: true }).catch(() => undefined);
      throw err instanceof Error ? err : new Error(String(err));
    }

    this.host.servers.addEvent(
      serverId,
      "backup_created",
      "info",
      `Imported ${kind} backup: ${basename(destPath)}`,
    );
    this.host.emitChanged(serverId);
    return record;
  }
}
