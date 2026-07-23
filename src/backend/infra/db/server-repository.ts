import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  AppEvent,
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
  created_at: string;
  updated_at: string;
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
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  ): void {
    this.db
      .prepare(
        "INSERT INTO events (server_id, type, severity, message, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(serverId, type, severity, message, new Date().toISOString());
  }

  recentEvents(limit: number): AppEvent[] {
    const rows = this.db
      .prepare(
        "SELECT id, server_id, type, severity, message, created_at FROM events ORDER BY id DESC LIMIT ?",
      )
      .all(limit) as Array<{
      id: number;
      server_id: string | null;
      type: AppEvent["type"];
      severity: AppEvent["severity"];
      message: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      serverId: r.server_id,
      type: r.type,
      severity: r.severity,
      message: r.message,
      createdAt: r.created_at,
    }));
  }
}
