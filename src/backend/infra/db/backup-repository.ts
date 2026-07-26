import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  BackupKind,
  BackupPolicy,
  BackupRecord,
  BackupStatus,
  BackupType,
} from "@shared/types";

export const DEFAULT_INTERVAL_MINUTES = 60;
export const DEFAULT_RETAIN_COUNT_WORLD = 20;
export const DEFAULT_RETAIN_COUNT_PLAYERS = 20;
export const DEFAULT_RETAIN_COUNT_INI = 10;
export const MIN_INTERVAL_MINUTES = 5;

interface BackupRow {
  id: string;
  server_id: string;
  type: BackupType;
  kind: BackupKind;
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
  retain_count_players: number | null;
  retain_count_ini: number | null;
  retain_days: number;
  backup_dir: string | null;
  updated_at: string;
}

function normalizeKind(value: string | null | undefined): BackupKind {
  if (value === "players" || value === "ini" || value === "world") {
    return value;
  }
  return "world";
}

function rowToBackup(row: BackupRow): BackupRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    type: row.type,
    kind: normalizeKind(row.kind),
    path: row.path,
    sizeBytes: row.size_bytes,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    notes: row.notes,
  };
}

function clampRetain(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function rowToPolicy(row: PolicyRow): BackupPolicy {
  const backupDir =
    typeof row.backup_dir === "string" && row.backup_dir.trim().length > 0
      ? row.backup_dir.trim()
      : null;
  return {
    serverId: row.server_id,
    enabled: row.enabled === 1,
    intervalMinutes: row.interval_minutes,
    retainCountWorld: clampRetain(row.retain_count, DEFAULT_RETAIN_COUNT_WORLD),
    retainCountPlayers: clampRetain(
      row.retain_count_players,
      DEFAULT_RETAIN_COUNT_PLAYERS,
    ),
    retainCountIni: clampRetain(row.retain_count_ini, DEFAULT_RETAIN_COUNT_INI),
    backupDir,
    updatedAt: row.updated_at,
  };
}

export class BackupRepository {
  constructor(private readonly db: DatabaseSync) {}

  createBackupStart(input: {
    serverId: string;
    type: BackupType;
    kind: BackupKind;
    path: string;
    notes: string | null;
  }): BackupRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO backups (
          id, server_id, type, kind, path, size_bytes, status, created_at, completed_at, notes
        ) VALUES (?, ?, ?, ?, ?, 0, 'running', ?, NULL, ?)`,
      )
      .run(
        id,
        input.serverId,
        input.type,
        input.kind,
        input.path,
        createdAt,
        input.notes,
      );

    return {
      id,
      serverId: input.serverId,
      type: input.type,
      kind: input.kind,
      path: input.path,
      sizeBytes: 0,
      status: "running",
      createdAt,
      completedAt: null,
      notes: input.notes,
    };
  }

  completeBackup(
    id: string,
    sizeBytes: number,
    /** When omitted, uses now (live create). Pass archive mtime for crash recovery. */
    completedAt?: string,
  ): BackupRecord | null {
    const finishedAt = completedAt ?? new Date().toISOString();
    this.db
      .prepare(
        "UPDATE backups SET status = 'completed', size_bytes = ?, completed_at = ? WHERE id = ?",
      )
      .run(sizeBytes, finishedAt, id);
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
        // Match retention/schedule: prefer finish time; running rows use created_at.
        `SELECT * FROM backups WHERE server_id = ?
         ORDER BY COALESCE(completed_at, created_at) DESC, created_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(serverId, limit) as unknown as BackupRow[];
    return rows.map(rowToBackup);
  }

  latestCompleted(serverId: string, kind?: BackupKind): BackupRecord | null {
    if (kind !== undefined) {
      const row = this.db
        .prepare(
          "SELECT * FROM backups WHERE server_id = ? AND kind = ? AND status = 'completed' ORDER BY completed_at DESC, created_at DESC, rowid DESC LIMIT 1",
        )
        .get(serverId, kind) as unknown as BackupRow | undefined;
      return row ? rowToBackup(row) : null;
    }
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
          server_id, enabled, interval_minutes, retain_count,
          retain_count_players, retain_count_ini, retain_days, backup_dir, updated_at
        ) VALUES (?, 0, ?, ?, ?, ?, 14, NULL, ?)`,
      )
      .run(
        serverId,
        DEFAULT_INTERVAL_MINUTES,
        DEFAULT_RETAIN_COUNT_WORLD,
        DEFAULT_RETAIN_COUNT_PLAYERS,
        DEFAULT_RETAIN_COUNT_INI,
        now,
      );

    return {
      serverId,
      enabled: false,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      retainCountWorld: DEFAULT_RETAIN_COUNT_WORLD,
      retainCountPlayers: DEFAULT_RETAIN_COUNT_PLAYERS,
      retainCountIni: DEFAULT_RETAIN_COUNT_INI,
      backupDir: null,
      updatedAt: now,
    };
  }

  setPolicy(input: {
    serverId: string;
    enabled: boolean;
    intervalMinutes: number;
    retainCountWorld: number;
    retainCountPlayers: number;
    retainCountIni: number;
    backupDir: string | null;
  }): BackupPolicy {
    const now = new Date().toISOString();
    const backupDir =
      input.backupDir !== null && input.backupDir.trim().length > 0
        ? input.backupDir.trim()
        : null;
    // retain_days kept in schema as unused legacy; write a fixed placeholder.
    // retain_count stores world retention (legacy column name).
    this.db
      .prepare(
        `INSERT INTO backup_policies (
          server_id, enabled, interval_minutes, retain_count,
          retain_count_players, retain_count_ini, retain_days, backup_dir, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 14, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          enabled = excluded.enabled,
          interval_minutes = excluded.interval_minutes,
          retain_count = excluded.retain_count,
          retain_count_players = excluded.retain_count_players,
          retain_count_ini = excluded.retain_count_ini,
          backup_dir = excluded.backup_dir,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.serverId,
        input.enabled ? 1 : 0,
        input.intervalMinutes,
        input.retainCountWorld,
        input.retainCountPlayers,
        input.retainCountIni,
        backupDir,
        now,
      );
    return this.getPolicy(input.serverId);
  }

  deleteBackupRecord(id: string): void {
    this.db.prepare("DELETE FROM backups WHERE id = ?").run(id);
  }

  getBackupByPath(serverId: string, path: string): BackupRecord | null {
    const row = this.db
      .prepare("SELECT * FROM backups WHERE server_id = ? AND path = ?")
      .get(serverId, path) as unknown as BackupRow | undefined;
    return row ? rowToBackup(row) : null;
  }

  listBackupPaths(serverId: string): string[] {
    const rows = this.db
      .prepare("SELECT path FROM backups WHERE server_id = ?")
      .all(serverId) as Array<{ path: string }>;
    return rows.map((row) => row.path);
  }

  /** Insert an already-completed backup (e.g. imported from disk). */
  insertCompletedBackup(input: {
    id?: string;
    serverId: string;
    type: BackupType;
    kind: BackupKind;
    path: string;
    sizeBytes: number;
    createdAt: string;
    completedAt: string;
    notes: string | null;
  }): BackupRecord {
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO backups (
          id, server_id, type, kind, path, size_bytes, status, created_at, completed_at, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
      )
      .run(
        id,
        input.serverId,
        input.type,
        input.kind,
        input.path,
        input.sizeBytes,
        input.createdAt,
        input.completedAt,
        input.notes,
      );
    const record = this.getBackup(id);
    if (record === null) {
      throw new Error("Could not insert completed backup");
    }
    return record;
  }

  listCompleted(serverId: string, kind?: BackupKind): BackupRecord[] {
    if (kind !== undefined) {
      const rows = this.db
        .prepare(
          "SELECT * FROM backups WHERE server_id = ? AND kind = ? AND status = 'completed' ORDER BY completed_at DESC, created_at DESC, rowid DESC",
        )
        .all(serverId, kind) as unknown as BackupRow[];
      return rows.map(rowToBackup);
    }
    const rows = this.db
      .prepare(
        "SELECT * FROM backups WHERE server_id = ? AND status = 'completed' ORDER BY completed_at DESC, created_at DESC, rowid DESC",
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
