import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { DatabaseBootFailureKind } from "./database";
import {
  formatDatabaseQuarantineStamp,
  quarantineProfileDatabase,
} from "./database-recovery";

/** Subfolder under the profile DB directory for rotating snapshots (#252). */
export const PROFILE_DB_SNAPSHOT_DIR_NAME = "profile-db-snapshots";

/** Keep this many files per snapshot kind (pre-migrate / healthy-boot). */
export const PROFILE_DB_SNAPSHOT_RETAIN_PER_KIND = 3;

export type ProfileDatabaseSnapshotKind = "pre-migrate" | "healthy-boot";

export type ProfileDatabaseSnapshotInfo = {
  path: string;
  fileName: string;
  kind: ProfileDatabaseSnapshotKind;
};

const SNAPSHOT_KIND_VALUES: readonly ProfileDatabaseSnapshotKind[] = [
  "pre-migrate",
  "healthy-boot",
];

/**
 * Directory that holds profile-DB snapshots for `dbPath`
 * (`<userData>/profile-db-snapshots` when the DB is the usual file).
 */
export function resolveProfileDatabaseSnapshotDir(dbPath: string): string {
  return join(dirname(dbPath), PROFILE_DB_SNAPSHOT_DIR_NAME);
}

/** Whether `dbPath` is a real on-disk file (not `:memory:` / URI). */
export function isOnDiskProfileDatabasePath(dbPath: string): boolean {
  return dbPath !== ":memory:" && !dbPath.startsWith("file:");
}

/**
 * Snapshot filename: `yark-profile.<kind>.<stamp>.db`
 * Stamp matches quarantine formatting so names sort lexicographically by time.
 */
export function formatProfileDatabaseSnapshotFileName(
  kind: ProfileDatabaseSnapshotKind,
  now: Date = new Date(),
): string {
  return `yark-profile.${kind}.${formatDatabaseQuarantineStamp(now)}.db`;
}

export function isProfileDatabaseSnapshotFileName(name: string): boolean {
  return /^yark-profile\.(pre-migrate|healthy-boot)\..+\.db$/u.test(name);
}

function profileDatabaseSnapshotKindFromFileName(
  name: string,
): ProfileDatabaseSnapshotKind | null {
  const match = /^yark-profile\.(pre-migrate|healthy-boot)\./u.exec(name);
  if (!match) {
    return null;
  }
  return match[1] as ProfileDatabaseSnapshotKind;
}

/** Newest-first snapshot inventory for operator recovery (#252). */
function listProfileDatabaseSnapshots(dbPath: string): ProfileDatabaseSnapshotInfo[] {
  if (!isOnDiskProfileDatabasePath(dbPath)) {
    return [];
  }
  const snapshotDir = resolveProfileDatabaseSnapshotDir(dbPath);
  if (!existsSync(snapshotDir)) {
    return [];
  }
  return readdirSync(snapshotDir)
    .filter(isProfileDatabaseSnapshotFileName)
    .map((fileName) => {
      const kind = profileDatabaseSnapshotKindFromFileName(fileName);
      if (!kind) {
        return null;
      }
      return {
        path: join(snapshotDir, fileName),
        fileName,
        kind,
      } satisfies ProfileDatabaseSnapshotInfo;
    })
    .filter((entry): entry is ProfileDatabaseSnapshotInfo => entry != null)
    .sort((a, b) => b.fileName.localeCompare(a.fileName));
}

/**
 * Choose which snapshot YARK should offer first:
 * - migrate failure → newest `pre-migrate`, else newest anything
 * - open failure → newest `healthy-boot`, else newest anything
 */
export function pickPreferredProfileDatabaseSnapshot(
  dbPath: string,
  failureKind: DatabaseBootFailureKind,
): ProfileDatabaseSnapshotInfo | null {
  const snapshots = listProfileDatabaseSnapshots(dbPath);
  if (snapshots.length === 0) {
    return null;
  }
  const preferredKind: ProfileDatabaseSnapshotKind =
    failureKind === "migrate" ? "pre-migrate" : "healthy-boot";
  return snapshots.find((snapshot) => snapshot.kind === preferredKind) ?? snapshots[0]!;
}

/** Short operator-facing label for dialogs (kind + stamp fragment). */
export function describeProfileDatabaseSnapshot(snapshot: ProfileDatabaseSnapshotInfo): string {
  const stampMatch = /\.(\d{4}-\d{2}-\d{2}T[\d-]+Z)\.db$/u.exec(snapshot.fileName);
  const stamp = stampMatch?.[1] ?? snapshot.fileName;
  if (snapshot.kind === "pre-migrate") {
    return `pre-migration save (${stamp})`;
  }
  return `healthy boot save (${stamp})`;
}

/**
 * Quarantine the live DB (and sidecars), then copy `snapshotPath` onto `dbPath`.
 * Does not open/migrate — caller re-runs boot open afterward.
 */
export function restoreProfileDatabaseFromSnapshot(
  dbPath: string,
  snapshotPath: string,
  options?: {
    now?: Date;
    quarantine?: typeof quarantineProfileDatabase;
  },
): { quarantinedPaths: string[]; restoredFrom: string } {
  if (!existsSync(snapshotPath)) {
    throw new Error(`Snapshot file is missing: ${snapshotPath}`);
  }
  if (statSync(snapshotPath).size < 100) {
    throw new Error("Snapshot file is empty or truncated.");
  }
  const quarantine = options?.quarantine ?? quarantineProfileDatabase;
  const { quarantinedPaths } = quarantine(dbPath, { now: options?.now });
  copyFileSync(snapshotPath, dbPath);
  return { quarantinedPaths, restoredFrom: snapshotPath };
}

/**
 * Writes a consistent on-disk SQLite copy via `VACUUM INTO` (includes committed
 * WAL state; avoids a naive mid-write copy of `.db` alone) then rotates older
 * files of the same kind.
 */
export function writeProfileDatabaseSnapshot(
  db: DatabaseSync,
  dbPath: string,
  kind: ProfileDatabaseSnapshotKind,
  options?: {
    now?: Date;
    retainPerKind?: number;
    snapshotDir?: string;
  },
): { snapshotPath: string; deletedPaths: string[] } {
  if (!isOnDiskProfileDatabasePath(dbPath)) {
    throw new Error("Profile database snapshots require an on-disk database path.");
  }

  const snapshotDir = options?.snapshotDir ?? resolveProfileDatabaseSnapshotDir(dbPath);
  mkdirSync(snapshotDir, { recursive: true });

  const fileName = formatProfileDatabaseSnapshotFileName(kind, options?.now ?? new Date());
  const snapshotPath = join(snapshotDir, fileName);
  const tempPath = `${snapshotPath}.tmp`;

  try {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
    // VACUUM INTO refuses an existing destination; write to .tmp then rename.
    db.exec(`VACUUM INTO '${escapeSqliteStringLiteral(tempPath)}'`);
    if (!existsSync(tempPath) || statSync(tempPath).size < 100) {
      throw new Error("VACUUM INTO produced an empty or truncated snapshot file.");
    }
    renameSync(tempPath, snapshotPath);
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup failures; surface the original write/rename error.
    }
    throw error;
  }

  const deletedPaths = rotateProfileDatabaseSnapshots(snapshotDir, {
    retainPerKind: options?.retainPerKind ?? PROFILE_DB_SNAPSHOT_RETAIN_PER_KIND,
  });
  return { snapshotPath, deletedPaths };
}

/** Escape a filesystem path for use inside a single-quoted SQLite string literal. */
function escapeSqliteStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

/**
 * Deletes oldest snapshot files per kind until each kind has at most `retainPerKind`.
 * Newest-first ordering uses the lexicographic ISO stamp in each filename.
 */
export function rotateProfileDatabaseSnapshots(
  snapshotDir: string,
  options?: { retainPerKind?: number },
): string[] {
  const retainPerKind = Math.max(
    0,
    Math.trunc(options?.retainPerKind ?? PROFILE_DB_SNAPSHOT_RETAIN_PER_KIND),
  );
  if (!existsSync(snapshotDir)) {
    return [];
  }

  const deletedPaths: string[] = [];
  const names = readdirSync(snapshotDir).filter(isProfileDatabaseSnapshotFileName);

  for (const kind of SNAPSHOT_KIND_VALUES) {
    const ofKind = names
      .filter((name) => profileDatabaseSnapshotKindFromFileName(name) === kind)
      .sort((a, b) => b.localeCompare(a));
    for (const stale of ofKind.slice(retainPerKind)) {
      const fullPath = join(snapshotDir, stale);
      try {
        unlinkSync(fullPath);
        deletedPaths.push(fullPath);
      } catch {
        // Best-effort rotation; a locked file should not fail boot.
      }
    }
  }

  return deletedPaths;
}
