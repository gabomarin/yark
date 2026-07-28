import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  AppEvent,
  AppEventDetails,
  ModMetadata,
  ServerProfile,
  ServerProfileInput,
} from "@shared/types";

interface ServerRow {
  id: string;
  name: string;
  map: string;
  install_dir: string;
  session_name: string;
  game_port: number;
  query_port: number;
  rcon_port: number;
  server_password: string | null;
  admin_password: string;
  cluster_id: string | null;
  cluster_dir: string | null;
  extra_args: string;
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

function rowToProfile(row: ServerRow): ServerProfile {
  return {
    id: row.id,
    name: row.name,
    map: row.map,
    installDir: row.install_dir,
    sessionName: row.session_name,
    gamePort: row.game_port,
    queryPort: row.query_port,
    rconPort: row.rcon_port,
    serverPassword: row.server_password,
    adminPassword: row.admin_password,
    clusterId: row.cluster_id,
    clusterDir: row.cluster_dir,
    extraArgs: JSON.parse(row.extra_args) as string[],
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
      .prepare("SELECT * FROM servers ORDER BY name")
      .all() as unknown as ServerRow[];
    return rows.map(rowToProfile);
  }

  get(id: string): ServerProfile | null {
    const row = this.db
      .prepare("SELECT * FROM servers WHERE id = ?")
      .get(id) as ServerRow | undefined;
    return row ? rowToProfile(row) : null;
  }

  create(input: ServerProfileInput): ServerProfile {
    const now = new Date().toISOString();
    const profile: ServerProfile = {
      ...input,
      disabledMods: input.disabledMods ?? [],
      modMetadataCache: input.modMetadataCache ?? {},
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO servers (
          id, name, map, install_dir, session_name,
          game_port, query_port, rcon_port,
          server_password, admin_password,
          cluster_id, cluster_dir, extra_args, mods,
          disabled_mods, mod_metadata_cache, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        profile.id,
        profile.name,
        profile.map,
        profile.installDir,
        profile.sessionName,
        profile.gamePort,
        profile.queryPort,
        profile.rconPort,
        profile.serverPassword,
        profile.adminPassword,
        profile.clusterId,
        profile.clusterDir,
        JSON.stringify(profile.extraArgs),
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
    this.db
      .prepare(
        `UPDATE servers SET
          name = ?, map = ?, install_dir = ?, session_name = ?,
          game_port = ?, query_port = ?, rcon_port = ?,
          server_password = ?, admin_password = ?,
          cluster_id = ?, cluster_dir = ?, extra_args = ?, mods = ?,
          disabled_mods = ?, mod_metadata_cache = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .run(
        input.name,
        input.map,
        input.installDir,
        input.sessionName,
        input.gamePort,
        input.queryPort,
        input.rconPort,
        input.serverPassword,
        input.adminPassword,
        input.clusterId,
        input.clusterDir,
        JSON.stringify(input.extraArgs),
        JSON.stringify(input.mods),
        JSON.stringify(input.disabledMods ?? existing.disabledMods ?? []),
        JSON.stringify(input.modMetadataCache ?? existing.modMetadataCache ?? {}),
        updatedAt,
        id,
      );
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
  ): void {
    const detailsJson =
      details !== undefined && details !== null ? JSON.stringify(details) : null;
    this.db
      .prepare(
        "INSERT INTO events (server_id, type, severity, message, created_at, details) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        serverId,
        type,
        severity,
        message,
        new Date().toISOString(),
        detailsJson,
      );
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

  deleteEventsForServer(serverId: string): number {
    const result = this.db
      .prepare("DELETE FROM events WHERE server_id = ?")
      .run(serverId);
    return Number(result.changes);
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
