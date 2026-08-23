import { existsSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { BackupKind } from "@shared/types";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import { directorySizeSafe } from "../../infra/fs/reparse-points";
import {
  backupKindSubdir,
  isReadableZipArchive,
  isZipBackupPath,
  parseBackupManifest,
  readZipTextEntry,
  zipHasBackupLayout,
} from "./backup-archive";
import { ALL_BACKUP_KINDS } from "./backup-policy-helpers";
import {
  diskImportNotes,
  folderLooksLikeBackupArchive,
  guessBackupTypeFromName,
  resolveImportEntryKind,
  resolveImportedBackupId,
  shouldSkipKindSubdirOnRootScan,
} from "./backup-portability";

interface BackupReconcilerDeps {
  servers: ServerRepository;
  backups: BackupRepository;
  creatingBackupIds: Set<string>;
  emitChanged: (serverId: string) => void;
}

function resolveServerBackupRoot(
  installDir: string,
  backupDir: string | null | undefined,
): string {
  if (typeof backupDir === "string" && backupDir.trim().length > 0) {
    return backupDir.trim();
  }
  return join(installDir, "Backups");
}

async function directorySize(path: string): Promise<number> {
  if (!existsSync(path)) return 0;
  return directorySizeSafe(path);
}

export class BackupReconciler {
  private readonly reconcileInFlight = new Map<string, Promise<number>>();
  private readonly interruptedReconcileInFlight = new Map<string, Promise<number>>();

  constructor(private readonly deps: BackupReconcilerDeps) {}

  hasWork(serverId: string): boolean {
    return (
      this.reconcileInFlight.has(serverId)
      || this.interruptedReconcileInFlight.has(serverId)
    );
  }

  /**
   * Keep SQLite aligned with disk:
   * - drop DB rows whose archive path no longer exists (Explorer deletes)
   * - import ZIP/folder archives present on disk but missing from SQLite
   *
   * Not `async`: returning an in-flight Promise must hand back the same
   * Promise instance (an async function would wrap it in a new outer Promise).
   */
  reconcileDiskBackups(serverId: string): Promise<number> {
    const existing = this.reconcileInFlight.get(serverId);
    if (existing !== undefined) {
      return existing;
    }
    const run = this.reconcileDiskBackupsUnlocked(serverId).finally(() => {
      if (this.reconcileInFlight.get(serverId) === run) {
        this.reconcileInFlight.delete(serverId);
      }
    });
    this.reconcileInFlight.set(serverId, run);
    return run;
  }

  private async reconcileDiskBackupsUnlocked(serverId: string): Promise<number> {
    const server = this.deps.servers.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }
    const policy = this.deps.backups.getPolicy(serverId);
    const rootDir = resolveServerBackupRoot(server.installDir, policy.backupDir);

    // Resolve interrupted creates (zip on disk, row still "running") before
    // path-known checks would block re-import of those archives.
    let changed = await this.reconcileInterruptedRunningBackups(serverId);
    changed += this.pruneMissingDiskBackups(serverId);

    if (existsSync(rootDir)) {
      const known = new Set(
        this.deps.backups
          .listBackupPaths(serverId)
          .map((path) => resolve(path).toLowerCase()),
      );

      for (const kind of ALL_BACKUP_KINDS) {
        const kindDir = join(rootDir, backupKindSubdir(kind));
        changed += await this.importArchivesFromDir(serverId, kindDir, kind, known);
      }

      // Legacy flat layout: archives directly under the root.
      changed += await this.importArchivesFromDir(serverId, rootDir, null, known);
    }

    if (changed > 0) {
      this.deps.emitChanged(serverId);
    }
    return changed;
  }

  /**
   * After a crash/kill, running rows may be stuck:
   * - finished readable backup-layout zip → promote to completed (restorable)
   * - missing / empty / unreadable / non-backup zip → fail so the UI can clear them
   * Live creates (creatingBackupIds) are left alone.
   */
  reconcileInterruptedRunningBackups(serverId: string): Promise<number> {
    const existing = this.interruptedReconcileInFlight.get(serverId);
    if (existing !== undefined) {
      return existing;
    }
    const run = this.reconcileInterruptedRunningBackupsUnlocked(serverId).finally(
      () => {
        if (this.interruptedReconcileInFlight.get(serverId) === run) {
          this.interruptedReconcileInFlight.delete(serverId);
        }
      },
    );
    this.interruptedReconcileInFlight.set(serverId, run);
    return run;
  }

  private async reconcileInterruptedRunningBackupsUnlocked(
    serverId: string,
  ): Promise<number> {
    const records = this.deps.backups.listBackups(serverId, 10_000);
    let changed = 0;
    for (const backup of records) {
      if (backup.status !== "running") continue;
      if (this.deps.creatingBackupIds.has(backup.id)) continue;

      if (isZipBackupPath(backup.path) && existsSync(backup.path)) {
        let readable = false;
        let hasLayout = false;
        try {
          readable = await isReadableZipArchive(backup.path);
          if (readable) {
            try {
              hasLayout = await zipHasBackupLayout(backup.path);
            } catch {
              // Corrupt central directory / I/O mid-scan — treat as unreadable.
              readable = false;
              hasLayout = false;
            }
          }
        } catch {
          readable = false;
          hasLayout = false;
        }
        if (readable && hasLayout) {
          try {
            const info = await stat(backup.path);
            // Use zip mtime — not wall clock — so recovery does not reorder
            // ahead of newer completed archives and break keep-last retention.
            const completed = this.deps.backups.completeBackup(
              backup.id,
              info.size,
              info.mtime.toISOString(),
            );
            if (completed === null) continue;
            changed += 1;
            this.deps.servers.addEvent(
              serverId,
              "backup_created",
              "info",
              `Recovered interrupted ${backup.kind} backup: ${basename(backup.path)}`,
            );
          } catch {
            // Leave running; a later reconcile can retry.
          }
          continue;
        }

        // Partial/corrupt/non-backup zip — not restorable.
        await rm(backup.path, { force: true }).catch(() => undefined);
        const reason = readable
          ? "Interrupted backup path held a non-backup zip"
          : "Interrupted while writing archive (incomplete or unreadable zip)";
        this.deps.backups.failBackup(backup.id, reason);
        changed += 1;
        this.deps.servers.addEvent(
          serverId,
          "error",
          "warning",
          `Interrupted ${backup.kind} backup marked failed (${
            readable ? "non-backup zip" : "incomplete zip"
          }): ${basename(backup.path)}`,
          {
            what: "A backup was interrupted and the archive on disk is not a restorable backup.",
            cause: reason,
            location: backup.path,
            suggestion: "Create the backup again from the server Backups tab.",
            context: { kind: backup.kind, backupId: backup.id },
          },
        );
        continue;
      }

      // Crash during staging — no zip yet. Fail so the row is not stuck forever.
      this.deps.backups.failBackup(backup.id, "Interrupted before archive was written");
      changed += 1;
      this.deps.servers.addEvent(
        serverId,
        "error",
        "warning",
        `Interrupted ${backup.kind} backup marked failed (no archive on disk)`,
        {
          what: "A backup was interrupted before the zip archive was created.",
          cause: "App stopped or crashed during staging.",
          location: backup.path,
          suggestion: "Create the backup again from the server Backups tab.",
          context: { kind: backup.kind, backupId: backup.id },
        },
      );
    }
    return changed;
  }

  /** Remove DB rows for archives deleted outside the app (e.g. Explorer). */
  private pruneMissingDiskBackups(serverId: string): number {
    const records = this.deps.backups.listBackups(serverId, 10_000);
    let removed = 0;
    for (const backup of records) {
      // In-progress creates may not have written the zip yet.
      if (backup.status === "running") continue;
      // Failed creates delete the partial zip on purpose — keep the row for history.
      if (backup.status === "failed") continue;
      if (existsSync(backup.path)) continue;
      this.deps.backups.deleteBackupRecord(backup.id);
      removed += 1;
    }
    return removed;
  }

  private async importArchivesFromDir(
    serverId: string,
    dir: string,
    defaultKind: BackupKind | null,
    known: Set<string>,
  ): Promise<number> {
    if (!existsSync(dir)) return 0;
    const entries = await readdir(dir, { withFileTypes: true });
    let imported = 0;

    for (const entry of entries) {
      const full = join(dir, entry.name);
      const key = resolve(full).toLowerCase();
      if (known.has(key)) continue;

      // Skip kind subdirs when scanning the root (handled separately).
      if (shouldSkipKindSubdirOnRootScan(entry.isDirectory(), defaultKind, entry.name)) {
        continue;
      }

      if (entry.isFile() && isZipBackupPath(entry.name)) {
        const kind = resolveImportEntryKind(defaultKind, entry.name);
        const ok = await this.importZipArchive(serverId, full, kind, known);
        if (ok) imported += 1;
        continue;
      }

      if (entry.isDirectory()) {
        const kind = resolveImportEntryKind(defaultKind, entry.name);
        const looksLikeArchive = folderLooksLikeBackupArchive({
          hasManifest: existsSync(join(full, "manifest.json")),
          hasSavedArks: existsSync(join(full, "SavedArks")),
          hasPlayerProfiles: existsSync(join(full, "PlayerProfiles")),
          hasConfigWindowsServer: existsSync(join(full, "ConfigWindowsServer")),
        });
        if (!looksLikeArchive) {
          continue;
        }
        const ok = await this.importFolderArchive(serverId, full, kind, known);
        if (ok) imported += 1;
      }
    }

    return imported;
  }

  private async importZipArchive(
    serverId: string,
    zipPath: string,
    kind: BackupKind,
    known: Set<string>,
  ): Promise<boolean> {
    try {
      const info = await stat(zipPath);
      // Match folder import gating: require manifest or known layout roots.
      if (!(await zipHasBackupLayout(zipPath))) {
        return false;
      }
      const manifestRaw = await readZipTextEntry(zipPath, "manifest.json");
      const parsed = parseBackupManifest(manifestRaw);
      const createdAt = parsed?.createdAt ?? info.mtime.toISOString();
      const type = parsed?.type ?? guessBackupTypeFromName(basename(zipPath));
      const notes = parsed?.notes ?? diskImportNotes(basename(zipPath));
      // Copies keep the original manifest id; mint a new one when that id is taken.
      const id = resolveImportedBackupId(
        parsed?.id,
        parsed?.id !== undefined && this.deps.backups.getBackup(parsed.id) !== null,
      );
      if (this.deps.backups.getBackupByPath(serverId, zipPath) !== null) {
        known.add(resolve(zipPath).toLowerCase());
        return false;
      }
      this.deps.backups.insertCompletedBackup({
        id,
        serverId,
        type,
        kind: parsed?.kind ?? kind,
        path: zipPath,
        sizeBytes: info.size,
        createdAt,
        completedAt: createdAt,
        notes,
        mapToken: parsed?.mapToken ?? null,
      });
      known.add(resolve(zipPath).toLowerCase());
      return true;
    } catch {
      return false;
    }
  }

  private async importFolderArchive(
    serverId: string,
    folderPath: string,
    kind: BackupKind,
    known: Set<string>,
  ): Promise<boolean> {
    try {
      const info = await stat(folderPath);
      let manifestRaw: string | null = null;
      const manifestPath = join(folderPath, "manifest.json");
      if (existsSync(manifestPath)) {
        manifestRaw = await readFile(manifestPath, "utf8");
      }
      const parsed = parseBackupManifest(manifestRaw);
      const createdAt = parsed?.createdAt ?? info.mtime.toISOString();
      const type = parsed?.type ?? guessBackupTypeFromName(basename(folderPath));
      const notes = parsed?.notes ?? diskImportNotes(basename(folderPath));
      const sizeBytes = await directorySize(folderPath);
      // Copies keep the original manifest id; mint a new one when that id is taken.
      const id = resolveImportedBackupId(
        parsed?.id,
        parsed?.id !== undefined && this.deps.backups.getBackup(parsed.id) !== null,
      );
      if (this.deps.backups.getBackupByPath(serverId, folderPath) !== null) {
        known.add(resolve(folderPath).toLowerCase());
        return false;
      }
      this.deps.backups.insertCompletedBackup({
        id,
        serverId,
        type,
        kind: parsed?.kind ?? kind,
        path: folderPath,
        sizeBytes,
        createdAt,
        completedAt: createdAt,
        notes,
        mapToken: parsed?.mapToken ?? null,
      });
      known.add(resolve(folderPath).toLowerCase());
      return true;
    } catch {
      return false;
    }
  }
}
