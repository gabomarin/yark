import type { DatabaseSync } from "node:sqlite";
import {
  normalizeStructuredLaunchArgs,
  takeLegacyWinLiveMaxPlayers,
  type StructuredLaunchArgs,
} from "@shared/structured-launch-options";

/** Schema version that owns the one-time Launch → `max_players` backfill. */
export const MAX_PLAYERS_LAUNCH_BACKFILL_SCHEMA_VERSION = 16;

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((col) => col.name === column);
}

/**
 * Promote leftover 0.12 Launch/extra `-WinLiveMaxPlayers` into `max_players`
 * and strip those tokens so Start uses the Server field instead of defaulting to 70.
 *
 * Call once from schema version {@link MAX_PLAYERS_LAUNCH_BACKFILL_SCHEMA_VERSION},
 * not on every database open. Callers that already hold a transaction should not
 * wrap this again.
 */
export function backfillMaxPlayersFromLegacyLaunchArgs(db: DatabaseSync): void {
  if (
    !tableHasColumn(db, "servers", "max_players")
    || !tableHasColumn(db, "servers", "extra_args")
    || !tableHasColumn(db, "servers", "structured_launch_args")
  ) {
    return;
  }

  const rows = db
    .prepare(
      "SELECT id, max_players, extra_args, structured_launch_args FROM servers",
    )
    .all() as Array<{
    id: string;
    max_players: number;
    extra_args: string;
    structured_launch_args: string;
  }>;
  if (rows.length === 0) {
    return;
  }

  const update = db.prepare(
    "UPDATE servers SET max_players = ?, extra_args = ?, structured_launch_args = ? WHERE id = ?",
  );

  for (const row of rows) {
    const extraArgs = parseJson<string[]>(row.extra_args, []);
    const structured = parseJson<StructuredLaunchArgs>(row.structured_launch_args, {});
    const taken = takeLegacyWinLiveMaxPlayers({
      structuredLaunchArgs: structured,
      extraArgs,
    });
    const nextMax =
      taken.maxPlayers !== null ? taken.maxPlayers : row.max_players;
    const nextExtra = JSON.stringify(taken.extraArgs);
    const nextStructured = JSON.stringify(taken.structuredLaunchArgs);
    const prevStructured = JSON.stringify(normalizeStructuredLaunchArgs(structured));
    if (
      nextMax === row.max_players
      && nextExtra === JSON.stringify(extraArgs)
      && nextStructured === prevStructured
    ) {
      continue;
    }
    update.run(nextMax, nextExtra, nextStructured, row.id);
  }
}
