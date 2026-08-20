import { DatabaseSync } from "node:sqlite";
import { existsSync, statSync } from "node:fs";
import { backfillMaxPlayersFromLegacyLaunchArgs, MAX_PLAYERS_LAUNCH_BACKFILL_SCHEMA_VERSION } from "./backfill-max-players";
import {
  isOnDiskProfileDatabasePath,
  writeProfileDatabaseSnapshot,
} from "./database-snapshots";
import schemaMigrations from "./schema-migrations.json";

interface Migration {
  version: number;
  sql: string;
}

/** SQL versions live in schema-migrations.json (bundled into main; E2E require()s the file). */
const MIGRATIONS: Migration[] = schemaMigrations;

/** Default SQLite lock wait before open/migrate fails (see #218). */
export const DATABASE_BUSY_TIMEOUT_MS = 5_000;

/**
 * SQLite database header length. An on-disk file shorter than this is not a
 * usable DB — but a 0-byte file is treated as a brand-new empty database by
 * SQLite, which would silently re-migrate and skip recovery UX.
 */
const MIN_SQLITE_DATABASE_FILE_BYTES = 100;

export type DatabaseBootFailureKind = "open" | "migrate";

/**
 * Thrown when the profile database cannot be opened or migrated during boot.
 * Distinct from unrelated main-process failures so recovery UX can branch on `kind`.
 */
export class DatabaseBootError extends Error {
  readonly kind: DatabaseBootFailureKind;
  readonly dbPath: string;
  override readonly cause?: unknown;

  constructor(kind: DatabaseBootFailureKind, dbPath: string, cause?: unknown) {
    const detail =
      cause instanceof Error ? cause.message : cause != null ? String(cause) : "unknown error";
    super(
      kind === "migrate"
        ? `Failed to migrate profile database at ${dbPath}: ${detail}`
        : `Failed to open profile database at ${dbPath}: ${detail}`,
    );
    this.name = "DatabaseBootError";
    this.kind = kind;
    this.dbPath = dbPath;
    this.cause = cause;
  }
}

export type OpenDatabaseOptions = {
  /** Overrides {@link DATABASE_BUSY_TIMEOUT_MS}. */
  busyTimeoutMs?: number;
  /**
   * When false, skip #252 profile-DB snapshots (tests that only care about open/migrate).
   * Default true for on-disk databases.
   */
  takeSnapshots?: boolean;
};

/** Finite non-negative integer ms for `PRAGMA busy_timeout`; non-finite → default. */
function resolveBusyTimeoutMs(value: number | undefined): number {
  const raw = value ?? DATABASE_BUSY_TIMEOUT_MS;
  if (!Number.isFinite(raw)) {
    return DATABASE_BUSY_TIMEOUT_MS;
  }
  return Math.max(0, Math.trunc(raw));
}

/**
 * Opens (or creates) the database and applies pending migrations
 * transactionally using PRAGMA user_version.
 */
export function openDatabase(path: string, options?: OpenDatabaseOptions): DatabaseSync {
  return openDatabaseApplyingMigrations(path, MIGRATIONS, options);
}

/**
 * Same as {@link openDatabase} with an injectable migration list (unit tests).
 */
export function openDatabaseApplyingMigrations(
  path: string,
  migrations: readonly Migration[],
  options?: OpenDatabaseOptions,
): DatabaseSync {
  const busyTimeoutMs = resolveBusyTimeoutMs(options?.busyTimeoutMs);
  const takeSnapshots = options?.takeSnapshots !== false;
  const hadExistingOnDiskDb =
    takeSnapshots && isOnDiskProfileDatabasePath(path) && existsSync(path);
  assertOnDiskDatabaseFilePlausible(path);

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path);
  } catch (error) {
    throw new DatabaseBootError("open", path, error);
  }

  let migrating = false;
  try {
    db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");

    const currentRow = db.prepare("PRAGMA user_version").get() as { user_version: number };
    const current = currentRow.user_version;
    const pendingMigrations = migrations.filter((migration) => migration.version > current);

    if (hadExistingOnDiskDb && pendingMigrations.length > 0) {
      // Do not preserve or migrate a database that already fails its integrity checks.
      assertProfileDatabaseUsable(db, path);
      try {
        writeProfileDatabaseSnapshot(db, path, "pre-migrate");
      } catch (error) {
        throw new DatabaseBootError("migrate", path, error);
      }
    }

    for (const migration of pendingMigrations) {
      migrating = true;
      db.exec("BEGIN;");
      try {
        db.exec(migration.sql);
        if (migration.version === MAX_PLAYERS_LAUNCH_BACKFILL_SCHEMA_VERSION) {
          backfillMaxPlayersFromLegacyLaunchArgs(db);
        }
        // Same transaction as E2E `initProfileDatabase`. WAL header writes
        // (`user_version`) are not rolled back; do not move this after COMMIT
        // unless both paths change together.
        db.exec(`PRAGMA user_version = ${migration.version};`);
        db.exec("COMMIT;");
      } catch (error) {
        try {
          db.exec("ROLLBACK;");
        } catch {
          // Ignore rollback failures; the original error is what matters for recovery.
        }
        throw error;
      }
    }

    assertProfileDatabaseUsable(db, path);

    if (hadExistingOnDiskDb) {
      try {
        writeProfileDatabaseSnapshot(db, path, "healthy-boot");
      } catch (error) {
        // The live database is already known-good. Snapshot failure must not send
        // the operator into recovery (where Start empty would quarantine valid data).
        console.warn("[yark] Failed to write healthy profile database snapshot:", error);
      }
    }

    return db;
  } catch (error) {
    try {
      db.close();
    } catch {
      // Ignore close failures after a boot error.
    }
    if (error instanceof DatabaseBootError) {
      throw error;
    }
    throw new DatabaseBootError(migrating ? "migrate" : "open", path, error);
  }
}

/**
 * Reject empty/truncated files that already exist on disk. SQLite happily opens a
 * 0-byte path as a new DB (quick_check=ok), which hides corruption-by-wipe.
 */
function assertOnDiskDatabaseFilePlausible(path: string): void {
  if (path === ":memory:" || path.startsWith("file:")) {
    return;
  }
  if (!existsSync(path)) {
    return;
  }
  let size = 0;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }
  if (size === 0) {
    throw new DatabaseBootError("open", path, new Error("The database file is empty."));
  }
  if (size < MIN_SQLITE_DATABASE_FILE_BYTES) {
    throw new DatabaseBootError(
      "open",
      path,
      new Error("The database file is truncated or incomplete."),
    );
  }
}

/**
 * Catch page-level corruption that still allows `DatabaseSync` construction
 * (SQLite often fails only on the first real read — see #218).
 */
function assertProfileDatabaseUsable(db: DatabaseSync, path: string): void {
  try {
    const rows = db.prepare("PRAGMA quick_check").all() as Array<Record<string, unknown>>;
    const messages = rows
      .map((row) => {
        const value = row["quick_check"] ?? Object.values(row)[0];
        return typeof value === "string" ? value : value != null ? String(value) : "";
      })
      .filter((message) => message.length > 0);
    if (messages.length !== 1 || messages[0] !== "ok") {
      // Full btree dumps are huge; keep them in the log, not the operator dialog.
      console.error("[yark] SQLite quick_check failed:\n" + messages.join("\n"));
      throw new Error(summarizeQuickCheckFailure(messages));
    }

    // Smoke-read a core table when present so boot fails before services start.
    const hasAppSettings = db
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'app_settings' LIMIT 1",
      )
      .get() as { present: number } | undefined;
    if (hasAppSettings) {
      db.prepare("SELECT COUNT(*) AS n FROM app_settings").get();
    }
  } catch (error) {
    if (error instanceof DatabaseBootError) {
      throw error;
    }
    throw new DatabaseBootError("open", path, error);
  }
}

function summarizeQuickCheckFailure(messages: string[]): string {
  const issues = messages.filter((message) => message !== "ok");
  if (issues.length <= 1) {
    return "The database file is damaged.";
  }
  return `The database file is damaged (${issues.length} integrity problems).`;
}
