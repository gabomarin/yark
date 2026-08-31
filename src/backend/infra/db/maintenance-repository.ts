import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_RESTART_WARNINGS,
  DEFAULT_UPDATE_WARNINGS,
  defaultMaintenancePolicy,
} from "@shared/maintenance-policy";
import { normalizeRestartDaysOfWeek } from "@shared/maintenance-restart-days";
import type {
  MaintenanceBroadcastPreset,
  MaintenanceJobWarnings,
  MaintenancePolicy,
} from "@shared/types";

interface PolicyRow {
  server_id: string;
  restart_enabled: number;
  wipe_enabled: number;
  update_enabled: number;
  restart_cadence: string;
  restart_day_of_week: number;
  restart_time_local: string;
  restart_days_of_week_json: string | null;
  wipe_save_world_first: number;
  restart_warnings_json: string;
  update_warnings_json: string;
  updated_at: string;
}

function parseWarnings(
  raw: string,
  fallback: MaintenanceJobWarnings,
): MaintenanceJobWarnings {
  try {
    const parsed = JSON.parse(raw) as Partial<MaintenanceJobWarnings>;
    const preset = parsed.preset;
    const validPreset: MaintenanceBroadcastPreset =
      preset === "none" ||
      preset === "quiet" ||
      preset === "standard" ||
      preset === "strict" ||
      preset === "custom"
        ? preset
        : fallback.preset;
    const customOffsets = Array.isArray(parsed.customOffsets)
      ? parsed.customOffsets.filter((x): x is string => typeof x === "string")
      : [...fallback.customOffsets];
    const template =
      typeof parsed.template === "string" && parsed.template.trim().length > 0
        ? parsed.template
        : fallback.template;
    const lastMinuteChat = parsed.lastMinuteChat !== false;
    return { preset: validPreset, customOffsets, template, lastMinuteChat };
  } catch {
    return {
      preset: fallback.preset,
      customOffsets: [...fallback.customOffsets],
      template: fallback.template,
      lastMinuteChat: fallback.lastMinuteChat,
    };
  }
}

function parseRestartDaysOfWeek(row: PolicyRow): number[] {
  if (typeof row.restart_days_of_week_json === "string") {
    try {
      const parsed = JSON.parse(row.restart_days_of_week_json) as number[];
      if (Array.isArray(parsed)) {
        return normalizeRestartDaysOfWeek(parsed);
      }
    } catch {
      /* fall through to legacy columns */
    }
  }
  if (row.restart_cadence === "daily") {
    return normalizeRestartDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
  }
  return normalizeRestartDaysOfWeek([row.restart_day_of_week]);
}

function rowToPolicy(row: PolicyRow): MaintenancePolicy {
  return {
    serverId: row.server_id,
    restartEnabled: row.restart_enabled === 1,
    wipeEnabled: row.wipe_enabled === 1,
    updateEnabled: row.update_enabled === 1,
    restartDaysOfWeek: parseRestartDaysOfWeek(row),
    restartTimeLocal:
      /^\d{2}:\d{2}$/.test(row.restart_time_local) ? row.restart_time_local : "04:00",
    wipeSaveWorldFirst: row.wipe_save_world_first === 1,
    restartWarnings: parseWarnings(row.restart_warnings_json, DEFAULT_RESTART_WARNINGS),
    updateWarnings: parseWarnings(row.update_warnings_json, DEFAULT_UPDATE_WARNINGS),
    updatedAt: row.updated_at,
  };
}

export class MaintenanceRepository {
  constructor(private readonly db: DatabaseSync) {}

  getPolicy(serverId: string): MaintenancePolicy {
    const row = this.db
      .prepare("SELECT * FROM maintenance_policies WHERE server_id = ?")
      .get(serverId) as unknown as PolicyRow | undefined;
    if (row !== undefined) return rowToPolicy(row);

    const now = new Date().toISOString();
    const defaults = defaultMaintenancePolicy(serverId, now);
    const daysJson = JSON.stringify(defaults.restartDaysOfWeek);
    this.db
      .prepare(
        `INSERT INTO maintenance_policies (
          server_id, restart_enabled, wipe_enabled, update_enabled,
          restart_cadence, restart_day_of_week, restart_time_local,
          restart_days_of_week_json,
          wipe_save_world_first, restart_warnings_json, update_warnings_json, updated_at
        ) VALUES (?, 0, 0, 0, 'weekly', 0, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        serverId,
        defaults.restartTimeLocal,
        daysJson,
        JSON.stringify(defaults.restartWarnings),
        JSON.stringify(defaults.updateWarnings),
        now,
      );
    return defaults;
  }

  setPolicy(
    input: Omit<MaintenancePolicy, "updatedAt">,
  ): MaintenancePolicy {
    const now = new Date().toISOString();
    const days = normalizeRestartDaysOfWeek(input.restartDaysOfWeek);
    const time = /^\d{2}:\d{2}$/.test(input.restartTimeLocal)
      ? input.restartTimeLocal
      : "04:00";
    const daysJson = JSON.stringify(days);
    const legacyCadence = days.length === 7 ? "daily" : "weekly";
    const legacyDay = days[0] ?? 0;

    this.db
      .prepare(
        `INSERT INTO maintenance_policies (
          server_id, restart_enabled, wipe_enabled, update_enabled,
          restart_cadence, restart_day_of_week, restart_time_local,
          restart_days_of_week_json,
          wipe_save_world_first, restart_warnings_json, update_warnings_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(server_id) DO UPDATE SET
          restart_enabled = excluded.restart_enabled,
          wipe_enabled = excluded.wipe_enabled,
          update_enabled = excluded.update_enabled,
          restart_cadence = excluded.restart_cadence,
          restart_day_of_week = excluded.restart_day_of_week,
          restart_time_local = excluded.restart_time_local,
          restart_days_of_week_json = excluded.restart_days_of_week_json,
          wipe_save_world_first = excluded.wipe_save_world_first,
          restart_warnings_json = excluded.restart_warnings_json,
          update_warnings_json = excluded.update_warnings_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.serverId,
        input.restartEnabled ? 1 : 0,
        input.wipeEnabled ? 1 : 0,
        input.updateEnabled ? 1 : 0,
        legacyCadence,
        legacyDay,
        time,
        daysJson,
        input.wipeSaveWorldFirst ? 1 : 0,
        JSON.stringify(input.restartWarnings),
        JSON.stringify(input.updateWarnings),
        now,
      );
    return this.getPolicy(input.serverId);
  }

  listPolicies(): MaintenancePolicy[] {
    const rows = this.db
      .prepare("SELECT * FROM maintenance_policies")
      .all() as unknown as PolicyRow[];
    return rows.map(rowToPolicy);
  }
}
