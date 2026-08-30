import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  collectKnownSecrets,
  sanitizeAppEvent,
  sanitizeDiagnosticText,
  sanitizeDiagnosticValue,
} from "@shared/credential-redaction";
import type {
  AppEvent,
  AppEventDetails,
  ModMetadata,
  ServerProfile,
  ServerProfileInput,
} from "@shared/types";
import {
  persistableMapModId,
  persistableMapSaveFolder,
} from "@shared/map-identity";
import {
  emptyStructuredLaunchArgs,
  normalizeStructuredLaunchArgs,
  type StructuredLaunchArgs,
} from "@shared/structured-launch-options";

interface ServerRow {
  id: string;
  name: string;
  map: string;
  /** SQLite may return number affinity for digit-only TEXT values. */
  map_mod_id: string | number | null;
  map_save_folder: string | null;
  install_dir: string;
  enabled: number;
  auto_start: number;
  session_name: string;
  max_players: number;
  game_port: number;
  query_port: number;
  rcon_port: number;
  server_password: string | null;
  admin_password: string;
  cluster_id: string | null;
  cluster_dir: string | null;
  extra_args: string;
  structured_launch_args: string;
  mods: string;
  disabled_mods: string;
  mod_metadata_cache: string;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw.trim().length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Coerce SQLite `map_mod_id` to string | null at the DB boundary (#190). */
export function coerceMapModId(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function rowToProfile(row: ServerRow): ServerProfile {
  return {
    id: row.id,
    name: row.name,
    map: row.map,
    mapModId: coerceMapModId(row.map_mod_id),
    mapSaveFolder: row.map_save_folder?.trim()
      ? row.map_save_folder.trim()
      : null,
    installDir: row.install_dir,
    enabled: row.enabled === 1,
    autoStart: row.auto_start === 1,
    sessionName: row.session_name,
    maxPlayers: row.max_players,
    gamePort: row.game_port,
    queryPort: row.query_port,
    rconPort: row.rcon_port,
    serverPassword: row.server_password,
    adminPassword: row.admin_password,
    clusterId: row.cluster_id,
    clusterDir: row.cluster_dir,
    extraArgs: JSON.parse(row.extra_args) as string[],
    structuredLaunchArgs: normalizeStructuredLaunchArgs(
      parseJson<StructuredLaunchArgs>(row.structured_launch_args, {}),
    ),
    mods: JSON.parse(row.mods) as string[],
    disabledMods: parseJson(row.disabled_mods, []),
    modMetadataCache: parseJson<Record<string, ModMetadata>>(row.mod_metadata_cache, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ServerRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(): ServerProfile[] {
    const rows = this.db
      .prepare("SELECT * FROM servers ORDER BY created_at ASC, id ASC")
      .all() as unknown as ServerRow[];
    return rows.map(rowToProfile);
  }

  get(id: string): ServerProfile | null {
    const row = this.db
      .prepare("SELECT * FROM servers WHERE id = ?")
      .get(id) as ServerRow | undefined;
    return row ? rowToProfile(row) : null;
  }

  create(input: ServerProfileInput, enabled = true): ServerProfile {
    const now = new Date().toISOString();
    const mapModId = persistableMapModId({
      map: input.map,
      mapModId: input.mapModId,
    });
    const mapSaveFolder = persistableMapSaveFolder({
      map: input.map,
      mapModId: input.mapModId,
      mapSaveFolder: input.mapSaveFolder,
    });
    const profile: ServerProfile = {
      ...input,
      mapModId,
      mapSaveFolder,
      enabled,
      autoStart: input.autoStart === true,
      disabledMods: input.disabledMods ?? [],
      modMetadataCache: input.modMetadataCache ?? {},
      structuredLaunchArgs: normalizeStructuredLaunchArgs(
        input.structuredLaunchArgs ?? emptyStructuredLaunchArgs(),
      ),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO servers (
          id, name, map, map_mod_id, map_save_folder, install_dir, enabled, auto_start, session_name,
          max_players, game_port, query_port, rcon_port,
          server_password, admin_password,
          cluster_id, cluster_dir, extra_args, structured_launch_args, mods,
          disabled_mods, mod_metadata_cache, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        profile.id,
        profile.name,
        profile.map,
        profile.mapModId ?? null,
        profile.mapSaveFolder ?? null,
        profile.installDir,
        profile.enabled ? 1 : 0,
        profile.autoStart ? 1 : 0,
        profile.sessionName,
        profile.maxPlayers,
        profile.gamePort,
        profile.queryPort,
        profile.rconPort,
        profile.serverPassword,
        profile.adminPassword,
        profile.clusterId,
        profile.clusterDir,
        JSON.stringify(profile.extraArgs),
        JSON.stringify(profile.structuredLaunchArgs ?? {}),
        JSON.stringify(profile.mods),
        JSON.stringify(profile.disabledMods),
        JSON.stringify(profile.modMetadataCache),
        profile.createdAt,
        profile.updatedAt,
      );
    return profile;
  }

  update(id: string, input: ServerProfileInput): ServerProfile | null {
    const existing = this.get(id);
    if (existing === null) return null;
    const updatedAt = new Date().toISOString();
    const mapModId = persistableMapModId({
      map: input.map,
      mapModId: input.mapModId !== undefined ? input.mapModId : existing.mapModId,
    });
    const mapSaveFolder = persistableMapSaveFolder({
      map: input.map,
      mapModId: mapModId,
      mapSaveFolder:
        input.mapSaveFolder !== undefined
          ? input.mapSaveFolder
          : existing.mapSaveFolder,
    });
    this.db
      .prepare(
        `UPDATE servers SET
          name = ?, map = ?, map_mod_id = ?, map_save_folder = ?, install_dir = ?, session_name = ?,
          max_players = ?, game_port = ?, query_port = ?, rcon_port = ?,
          server_password = ?, admin_password = ?,
          cluster_id = ?, cluster_dir = ?, extra_args = ?, structured_launch_args = ?, mods = ?,
          disabled_mods = ?, mod_metadata_cache = ?,
          auto_start = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        input.name,
        input.map,
        mapModId,
        mapSaveFolder,
        input.installDir,
        input.sessionName,
        input.maxPlayers,
        input.gamePort,
        input.queryPort,
        input.rconPort,
        input.serverPassword,
        input.adminPassword,
        input.clusterId,
        input.clusterDir,
        JSON.stringify(input.extraArgs),
        JSON.stringify(
          normalizeStructuredLaunchArgs(
            input.structuredLaunchArgs ?? existing.structuredLaunchArgs ?? {},
          ),
        ),
        JSON.stringify(input.mods),
        JSON.stringify(input.disabledMods ?? existing.disabledMods ?? []),
        JSON.stringify(input.modMetadataCache ?? existing.modMetadataCache ?? {}),
        input.autoStart === true ? 1 : 0,
        updatedAt,
        id,
      );
    return this.get(id);
  }

  /** Narrow path update used by Move installation after verified copy. */
  updateInstallDir(id: string, installDir: string): ServerProfile | null {
    const existing = this.get(id);
    if (existing === null) return null;
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE servers SET install_dir = ?, updated_at = ? WHERE id = ?`,
      )
      .run(installDir, updatedAt, id);
    return this.get(id);
  }

  setEnabled(id: string, enabled: boolean): ServerProfile | null {
    const existing = this.get(id);
    if (existing === null || existing.enabled === enabled) {
      return existing;
    }
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE servers SET enabled = ?, updated_at = ? WHERE id = ?`,
      )
      .run(enabled ? 1 : 0, updatedAt, id);
    return this.get(id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM servers WHERE id = ?").run(id);
    return result.changes > 0;
  }

  addEvent(
    serverId: string | null,
    type: AppEvent["type"],
    severity: AppEvent["severity"],
    message: string,
    details?: AppEventDetails | null,
  ): number {
    const secrets = collectKnownSecrets(this.list());
    const safeMessage = sanitizeDiagnosticText(message, secrets);
    const safeDetails =
      details !== undefined && details !== null
        ? (sanitizeDiagnosticValue(details, secrets) as AppEventDetails)
        : details;
    const detailsJson =
      safeDetails !== undefined && safeDetails !== null
        ? JSON.stringify(safeDetails)
        : null;
    const result = this.db
      .prepare(
        "INSERT INTO events (server_id, type, severity, message, created_at, details) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        serverId,
        type,
        severity,
        safeMessage,
        new Date().toISOString(),
        detailsJson,
      );
    return Number(result.lastInsertRowid);
  }

  recentEvents(limit: number): AppEvent[] {
    const rows = this.db
      .prepare(
        "SELECT id, server_id, type, severity, message, created_at, details FROM events ORDER BY id DESC LIMIT ?",
      )
      .all(limit) as Array<{
      id: number;
      server_id: string | null;
      type: AppEvent["type"];
      severity: AppEvent["severity"];
      message: string;
      created_at: string;
      details: string | null;
    }>;
    const secrets = collectKnownSecrets(this.list());
    return rows.map((r) =>
      sanitizeAppEvent(
        {
          id: r.id,
          serverId: r.server_id,
          type: r.type,
          severity: r.severity,
          message: r.message,
          createdAt: r.created_at,
          details: parseEventDetails(r.details),
        },
        secrets,
      ),
    );
  }

  deleteEventsForServer(serverId: string): number {
    const result = this.db
      .prepare("DELETE FROM events WHERE server_id = ?")
      .run(serverId);
    return Number(result.changes);
  }

  /** All events (oldest first) for retention planning. */
  listAllEvents(): AppEvent[] {
    const rows = this.db
      .prepare(
        "SELECT id, server_id, type, severity, message, created_at, details FROM events ORDER BY id ASC",
      )
      .all() as Array<{
      id: number;
      server_id: string | null;
      type: AppEvent["type"];
      severity: AppEvent["severity"];
      message: string;
      created_at: string;
      details: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      serverId: r.server_id,
      type: r.type,
      severity: r.severity,
      message: r.message,
      createdAt: r.created_at,
      details: parseEventDetails(r.details),
    }));
  }

  deleteEventsByIds(ids: number[]): number {
    if (ids.length === 0) return 0;
    let deleted = 0;
    const stmt = this.db.prepare("DELETE FROM events WHERE id = ?");
    for (const id of ids) {
      const result = stmt.run(id);
      deleted += Number(result.changes);
    }
    return deleted;
  }
}

function parseEventDetails(raw: string | null | undefined): AppEventDetails | null {
  if (raw == null || raw.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as AppEventDetails;
    if (parsed === null || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
