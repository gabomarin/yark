/**
 * Per-kind / per-map / per-player retention pruning for BackupService.
 */

import { basename } from "node:path";
import { rm } from "node:fs/promises";
import { playersRetentionKey } from "@shared/backup-player-meta";
import type { BackupPolicy, BackupRecord } from "@shared/types";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import { ALL_BACKUP_KINDS, retainCountForKind } from "./backup-policy-helpers";

function worldRetentionKey(backup: BackupRecord): string {
  return backup.mapToken?.trim().toLowerCase() || "__unscoped__";
}

export interface BackupRetentionHost {
  servers: ServerRepository;
  backups: BackupRepository;
  emitChanged: (serverId: string) => void;
}

export class BackupRetention {
  constructor(private readonly host: BackupRetentionHost) {}

  /** Retain last N completed backups; world uses per-map pools; players use per-player pools. */
  async applyRetention(serverId: string, policy: BackupPolicy): Promise<void> {
    for (const kind of ALL_BACKUP_KINDS) {
      const retain = retainCountForKind(policy, kind);
      const completed = this.host.backups.listCompleted(serverId, kind);

      if (kind === "players") {
        const byPlayer = new Map<string, BackupRecord[]>();
        for (const backup of completed) {
          const key = playersRetentionKey(backup);
          const list = byPlayer.get(key) ?? [];
          list.push(backup);
          byPlayer.set(key, list);
        }
        for (const [, list] of byPlayer) {
          if (list.length <= retain) continue;
          for (const backup of list.slice(retain)) {
            await this.removeRetainedBackup(serverId, backup);
          }
        }
        continue;
      }

      if (kind === "world") {
        const byMap = new Map<string, BackupRecord[]>();
        for (const backup of completed) {
          const key = worldRetentionKey(backup);
          const list = byMap.get(key) ?? [];
          list.push(backup);
          byMap.set(key, list);
        }
        for (const [, list] of byMap) {
          if (list.length <= retain) continue;
          for (const backup of list.slice(retain)) {
            await this.removeRetainedBackup(serverId, backup);
          }
        }
        continue;
      }

      if (completed.length <= retain) continue;
      for (const backup of completed.slice(retain)) {
        await this.removeRetainedBackup(serverId, backup);
      }
    }
  }

  async removeRetainedBackup(serverId: string, backup: BackupRecord): Promise<void> {
    await rm(backup.path, { recursive: true, force: true });
    this.host.backups.deleteBackupRecord(backup.id);
    this.host.servers.addEvent(
      serverId,
      "backup_deleted",
      "info",
      `Old ${backup.kind} backup removed by retention: ${basename(backup.path)}`,
    );
    this.host.emitChanged(serverId);
  }
}
