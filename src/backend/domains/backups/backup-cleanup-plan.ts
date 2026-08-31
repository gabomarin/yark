import { backupFinishedAt, playersRetentionKey } from "@shared/backup-player-meta";
import type {
  BackupCleanupOptions,
  BackupCleanupPreview,
  BackupKind,
  BackupPolicy,
  BackupRecord,
} from "@shared/types";
import { ALL_BACKUP_KINDS, retainCountForKind, worldRetentionKey } from "./backup-policy-helpers";

export interface BackupCleanupPlanItem {
  backup: BackupRecord;
  serverName: string;
  reason: string;
}

interface BackupCleanupPlannerServer {
  id: string;
  name: string;
}

/** Read-only backup catalog access for pure cleanup planning (#146). */
export interface BackupCleanupPlannerCatalog {
  getPolicy(serverId: string): BackupPolicy;
  listBackups(serverId: string, limit: number): BackupRecord[];
  listCompleted(serverId: string, kind: BackupKind): BackupRecord[];
  latestCompleted(serverId: string, kind: BackupKind): BackupRecord | null;
}

export interface PlanBackupCleanupInput {
  options: BackupCleanupOptions;
  servers: BackupCleanupPlannerServer[];
  catalog: BackupCleanupPlannerCatalog;
  /** Test hook for age cutoffs. Defaults to `Date.now()`. */
  nowMs?: number;
}

export function planBackupCleanup(input: PlanBackupCleanupInput): BackupCleanupPlanItem[] {
  const { options, servers, catalog } = input;
  const includeFailed = options.includeFailed === true;
  const enforceRetention = options.enforceRetention === true;
  const protectNewestWorld = options.protectNewestWorld !== false;
  const olderThanDays =
    typeof options.olderThanDays === "number" && options.olderThanDays > 0
      ? Math.floor(options.olderThanDays)
      : null;
  const keepLastPerKind =
    typeof options.keepLastPerKind === "number" && options.keepLastPerKind > 0
      ? Math.floor(options.keepLastPerKind)
      : null;

  if (
    !includeFailed &&
    !enforceRetention &&
    olderThanDays === null &&
    keepLastPerKind === null
  ) {
    throw new Error("Select at least one cleanup rule");
  }

  const nowMs = input.nowMs ?? Date.now();
  const cutoffIso =
    olderThanDays !== null
      ? new Date(nowMs - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const selected = new Map<string, BackupCleanupPlanItem>();

  const mark = (
    backup: BackupRecord,
    serverName: string,
    reason: string,
  ): void => {
    if (backup.status === "running") return;
    const existing = selected.get(backup.id);
    if (existing === undefined) {
      selected.set(backup.id, { backup, serverName, reason });
      return;
    }
    if (!existing.reason.includes(reason)) {
      existing.reason = `${existing.reason}; ${reason}`;
    }
  };

  for (const server of servers) {
    const policy = catalog.getPolicy(server.id);
    const records = catalog.listBackups(server.id, 10_000);
    const newestWorld = catalog.latestCompleted(server.id, "world");

    if (includeFailed) {
      for (const backup of records) {
        if (backup.status === "failed") {
          mark(backup, server.name, "failed");
        }
      }
    }

    if (enforceRetention) {
      for (const kind of ALL_BACKUP_KINDS) {
        const retain = retainCountForKind(policy, kind);
        const completed = catalog.listCompleted(server.id, kind);
        if (kind === "players") {
          const byPlayer = new Map<string, BackupRecord[]>();
          for (const backup of completed) {
            const key = playersRetentionKey(backup);
            const list = byPlayer.get(key) ?? [];
            list.push(backup);
            byPlayer.set(key, list);
          }
          for (const [, list] of byPlayer) {
            for (const backup of list.slice(retain)) {
              mark(backup, server.name, "over retain policy");
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
            for (const backup of list.slice(retain)) {
              mark(backup, server.name, "over retain policy");
            }
          }
          continue;
        }
        for (const backup of completed.slice(retain)) {
          mark(backup, server.name, "over retain policy");
        }
      }
    }

    if (cutoffIso !== null) {
      for (const backup of records) {
        if (backup.status !== "completed") continue;
        if (backupFinishedAt(backup) < cutoffIso) {
          mark(backup, server.name, `older than ${olderThanDays}d`);
        }
      }
    }

    if (keepLastPerKind !== null) {
      for (const kind of ALL_BACKUP_KINDS) {
        const completed = catalog.listCompleted(server.id, kind);
        if (kind === "players") {
          const byPlayer = new Map<string, BackupRecord[]>();
          for (const backup of completed) {
            const key = playersRetentionKey(backup);
            const list = byPlayer.get(key) ?? [];
            list.push(backup);
            byPlayer.set(key, list);
          }
          for (const [, list] of byPlayer) {
            for (const backup of list.slice(keepLastPerKind)) {
              mark(
                backup,
                server.name,
                `keep last ${keepLastPerKind}/players`,
              );
            }
          }
          continue;
        }
        // Same per-map pools as enforceRetention / scheduled world retention (#492 residual).
        if (kind === "world") {
          const byMap = new Map<string, BackupRecord[]>();
          for (const backup of completed) {
            const key = worldRetentionKey(backup);
            const list = byMap.get(key) ?? [];
            list.push(backup);
            byMap.set(key, list);
          }
          for (const [, list] of byMap) {
            for (const backup of list.slice(keepLastPerKind)) {
              mark(
                backup,
                server.name,
                `keep last ${keepLastPerKind}/world`,
              );
            }
          }
          continue;
        }
        for (const backup of completed.slice(keepLastPerKind)) {
          mark(backup, server.name, `keep last ${keepLastPerKind}/${kind}`);
        }
      }
    }

    if (protectNewestWorld && newestWorld !== null) {
      selected.delete(newestWorld.id);
    }
  }

  return [...selected.values()].sort((a, b) =>
    backupFinishedAt(b.backup).localeCompare(backupFinishedAt(a.backup)),
  );
}

export function summarizeCleanupPlan(
  plan: BackupCleanupPlanItem[],
): Pick<BackupCleanupPreview, "items" | "totalBytes" | "byServer"> {
  const byServerMap = new Map<
    string,
    { serverId: string; serverName: string; count: number; bytes: number }
  >();
  let totalBytes = 0;
  for (const item of plan) {
    const serverId = item.backup.serverId;
    const sizeBytes = Math.max(0, item.backup.sizeBytes);
    totalBytes += sizeBytes;
    const current = byServerMap.get(serverId) ?? {
      serverId,
      serverName: item.serverName,
      count: 0,
      bytes: 0,
    };
    current.count += 1;
    current.bytes += sizeBytes;
    byServerMap.set(serverId, current);
  }
  return {
    items: plan,
    totalBytes,
    byServer: [...byServerMap.values()],
  };
}
