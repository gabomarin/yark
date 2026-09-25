import type { DatabaseSync } from "node:sqlite";
import {
  normalizeStructuredLaunchArgs,
  takeLegacyPassiveMods,
  type StructuredLaunchArgs,
} from "@shared/asa/structured-launch-options";
import { normalizeDisabledMods } from "@shared/server/server-profile";

/** Schema version that owns the one-time Launch -> `passive_mods` backfill (#509). */
export const PASSIVE_MODS_BACKFILL_SCHEMA_VERSION = 29;

function parseJsonColumn<T>(raw: string | null | undefined, fallback: T, label: string): T {
  if (raw == null || raw.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Passive-mods backfill: invalid JSON in ${label}: ${detail}`);
  }
}

function parseStringArrayColumn(raw: string | null | undefined, label: string): string[] | null {
  const parsed = parseJsonColumn<unknown>(raw, [], label);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null;
}

function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((col) => col.name === column);
}

/**
 * Promote the retired Launch `-passivemods=` option into `passive_mods` so no
 * server loses its passive mods when the option leaves the Launch tab (#509).
 *
 * Hand-typed `-passivemods=` extra args are intentionally left alone: they keep
 * working while the profile owns no passive mods, and YARK has few enough
 * operators that migrating them is not worth losing the raw-config escape hatch.
 *
 * Call once from schema version {@link PASSIVE_MODS_BACKFILL_SCHEMA_VERSION},
 * not on every database open. Callers that already hold a transaction should not
 * wrap this again.
 */
export function backfillPassiveModsFromStructuredLaunchArgs(db: DatabaseSync): string[] {
  if (
    !tableHasColumn(db, "servers", "passive_mods") ||
    !tableHasColumn(db, "servers", "structured_launch_args") ||
    !tableHasColumn(db, "servers", "mods") ||
    !tableHasColumn(db, "servers", "disabled_mods")
  ) {
    return [];
  }

  const rows = db
    .prepare(
      `SELECT id, structured_launch_args, mods, disabled_mods, passive_mods
       FROM servers
       WHERE LOWER(structured_launch_args) LIKE '%passivemods%'`,
    )
    .all() as Array<{
    id: string;
    structured_launch_args: string;
    mods: string;
    disabled_mods: string;
    passive_mods: string;
  }>;
  if (rows.length === 0) {
    return [];
  }

  const update = db.prepare("UPDATE servers SET structured_launch_args = ?, passive_mods = ? WHERE id = ?");
  const skipped: string[] = [];

  for (const row of rows) {
    const parsedStructured = parseJsonColumn<unknown>(
      row.structured_launch_args,
      {},
      `servers.structured_launch_args id=${row.id}`,
    );
    const mods = parseStringArrayColumn(row.mods, `servers.mods id=${row.id}`);
    const disabledValues = parseStringArrayColumn(row.disabled_mods, `servers.disabled_mods id=${row.id}`);
    const passiveValues = parseStringArrayColumn(row.passive_mods, `servers.passive_mods id=${row.id}`);
    if (
      parsedStructured === null ||
      typeof parsedStructured !== "object" ||
      Array.isArray(parsedStructured) ||
      mods === null ||
      disabledValues === null ||
      passiveValues === null
    ) {
      skipped.push(row.id);
      continue;
    }
    const structured = parsedStructured as StructuredLaunchArgs;
    const disabledMods = normalizeDisabledMods(mods, disabledValues);
    const passiveMods = passiveValues;
    const taken = takeLegacyPassiveMods({
      structuredLaunchArgs: structured,
      mods,
      disabledMods,
      passiveMods,
    });
    const nextStructured = JSON.stringify(taken.structuredLaunchArgs);
    const nextPassive = JSON.stringify(taken.passiveMods);
    if (
      nextStructured === JSON.stringify(normalizeStructuredLaunchArgs(structured)) &&
      nextPassive === row.passive_mods
    ) {
      continue;
    }
    update.run(nextStructured, nextPassive, row.id);
  }
  return skipped;
}
