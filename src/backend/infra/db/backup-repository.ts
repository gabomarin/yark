import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  BackupPolicy,
  BackupRecord,
  BackupStatus,
  BackupType,
} from "@shared/types";

interface BackupRow {
  id: string;
  server_id: string;
  type: BackupType;
  path: string;
  size_bytes: number;
  status: BackupStatus;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
}

interface PolicyRow {
  server_id: string;
  enabled: number;
  interval_minutes: number;
  retain_count: number;
  retain_days: number;
  updated_at: string;
}

function rowToBackup(row: BackupRow): BackupRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    type: row.type,
    path: row.path,
    sizeBytes: row.size_bytes,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    notes: row.notes,
  };
}

function rowToPolicy(row: PolicyRow): BackupPolicy {
  return {
    serverId: row.server_id,
    enabled: row.enabled === 1,
    intervalMinutes: row.interval_minutes,
    retainCount: row.retain_count,
    retainDays: row.retain_days,
    updatedAt: row.updated_at,
  };
}

export class BackupRepository {
  constructor(private readonly db: DatabaseSync) {}

  createBackupStart(input: {
    serverId: string;
    type: BackupType;
    path: string;
    notes: string | null;
  }): BackupRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO backups (
          id, server_id, type, path, size_bytes, status, created_at, completed_at, notes
        ) VALUES (?, ?, ?, ?, 0, 'running', ?, NULL, ?)`,
      )
      .run(id, input.serverId, input.type, input.path, createdAt, input.notes);

    return {
      id,
      serverId: input.serverId,
      type: input.type,
      path: input.path,
      sizeBytes: 0,
      status: "running",
      createdAt,
      completedAt: null,
      notes: input.notes,
    };
  }

  completeBackup(id: string, sizeBytes: number): BackupRecord | null {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE backups SET status = 'completed', size_bytes = ?, completed_at = ? WHERE id = ?",
      )
      .run(sizeBytes, now, id);
    return this.getBackup(id);
  }

  failBackup(id: string, notes: string): BackupRecord | null {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE backups SET status = 'failed', completed_at = ?, notes = ? WHERE id = ?",
      )
      .run(now, notes, id);
    return this.getBackup(id);
  }

  getBackup(id: string): BackupRecord | null {
    const row = this.db
      .prepare("SELECT * FROM backups WHERE id = ?")
      .get(id) as unknown as BackupRow | undefined;
    return row ? rowToBackup(row) : null;
  }

  listBackups(serverId: string, limit: number): BackupRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(serverId, limit) as unknown as BackupRow[];
    return rows.map(rowToBackup);
  }

  latestCompleted(serverId: string): BackupRecord | null {
    const row = this.db
      .prepare(
        "SELECT * FROM backups WHERE server_id = ? AND status = 'completed' ORDER BY completed_at DESC, created_at DESC, rowid DESC LIMIT 1",
      )
      .get(serverId) as unknown as BackupRow | undefined;
    return row ? rowToBackup(row) : null;
  }

  getPolicy(serverId: string): BackupPolicy {
    const row = this.db
      .prepare("SELECT * FROM backup_policies WHERE server_id = ?")
      .get(serverId) as unknown as PolicyRow | undefined;
    if (row !== undefined) return rowToPolicy(row);

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO backup_policies (
          server_id, enabled, interval_minutes, retain_count, retain_days, updated_at
        ) VALUES (?, 0, 360, 20, 14, ?)`,
      )
      .run(serverId, now);

    return {
      serverId,
      enabled: false,
      intervalMinutes: 360,
      retainCount: 20,
      retainDays: 14,
      updatedAt: now,
    };
  }

  setPolicy(input: {
    serverId: string;
    enabled: boolean;
    intervalMinutes: number;
    retainCount: number;
    retainDays: number;
  }): BackupPolicy {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO backup_policies (
          server_id, enabled, interval_minutes, retain_count, retain_days, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          enabled = excluded.enabled,
          interval_minutes = excluded.interval_minutes,
          retain_count = excluded.retain_count,
          retain_days = excluded.retain_days,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.serverId,
        input.enabled ? 1 : 0,
        input.intervalMinutes,
        input.retainCount,
        input.retainDays,
        now,
      );
    return this.getPolicy(input.serverId);
  }

  deleteBackupRecord(id: string): void {
    this.db.prepare("DELETE FROM backups WHERE id = ?").run(id);
  }

  listCompleted(serverId: string): BackupRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM backups WHERE server_id = ? AND status = 'completed' ORDER BY created_at DESC",
      )
      .all(serverId) as unknown as BackupRow[];
    return rows.map(rowToBackup);
  }

  insertRestoreHistory(input: {
    serverId: string;
    backupId: string;
    status: "started" | "completed" | "failed";
    notes: string | null;
  }): number {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO restore_history (
          server_id, backup_id, started_at, completed_at, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.serverId,
        input.backupId,
        now,
        input.status === "started" ? null : now,
        input.status,
        input.notes,
      ) as unknown as { lastInsertRowid: number | bigint };

    return Number(result.lastInsertRowid);
  }

  completeRestoreHistory(id: number, status: "completed" | "failed", notes: string | null): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE restore_history SET completed_at = ?, status = ?, notes = ? WHERE id = ?",
      )
      .run(now, status, notes, id);
  }
}
