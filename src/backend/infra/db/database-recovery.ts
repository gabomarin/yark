import { existsSync, renameSync } from "node:fs";

/**
 * Filesystem-safe stamp for quarantined profile DB files
 * (e.g. `2026-08-10T19-30-00-000Z`).
 */
export function formatDatabaseQuarantineStamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/** Main DB file plus WAL/SHM sidecars that must move together on reset. */
export function listProfileDatabaseSidecars(dbPath: string): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

/**
 * Renames an unopenable profile database (and sidecars) aside so boot can
 * create a fresh DB. Does not delete files.
 */
export function quarantineProfileDatabase(
  dbPath: string,
  options?: { now?: Date },
): { quarantinedPaths: string[]; stamp: string } {
  const stamp = formatDatabaseQuarantineStamp(options?.now ?? new Date());
  const quarantinedPaths: string[] = [];
  for (const source of listProfileDatabaseSidecars(dbPath)) {
    if (!existsSync(source)) continue;
    const dest = `${source}.corrupt.${stamp}`;
    renameSync(source, dest);
    quarantinedPaths.push(dest);
  }
  return { quarantinedPaths, stamp };
}
