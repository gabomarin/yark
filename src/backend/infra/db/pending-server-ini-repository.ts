import type { DatabaseSync } from "node:sqlite";
import type { ServerIniPayload } from "@shared/types";

export interface PendingServerIni {
  serverId: string;
  payload: ServerIniPayload;
  updatedAt: string;
}

interface PendingServerIniRow {
  server_id: string;
  game_user_settings_ini: string;
  game_ini: string;
  updated_at: string;
}

function rowToPending(row: PendingServerIniRow): PendingServerIni {
  return {
    serverId: row.server_id,
    payload: {
      gameUserSettings: row.game_user_settings_ini,
      game: row.game_ini,
    },
    updatedAt: row.updated_at,
  };
}

/**
 * Durable pending GUS/Game.ini drafts while the dedicated process is live (#530).
 * Last save wins; flushed to the install after stop / before start.
 */
export class PendingServerIniRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(serverId: string): PendingServerIni | null {
    const id = serverId.trim();
    if (id.length === 0) {
      return null;
    }
    const row = this.db
      .prepare(
        `SELECT server_id, game_user_settings_ini, game_ini, updated_at
         FROM pending_server_ini WHERE server_id = ?`,
      )
      .get(id) as unknown as PendingServerIniRow | undefined;
    return row === undefined ? null : rowToPending(row);
  }

  upsert(serverId: string, payload: ServerIniPayload): PendingServerIni {
    const id = serverId.trim();
    if (id.length === 0) {
      throw new Error("Server ID is required");
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO pending_server_ini (
           server_id, game_user_settings_ini, game_ini, updated_at
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET
           game_user_settings_ini = excluded.game_user_settings_ini,
           game_ini = excluded.game_ini,
           updated_at = excluded.updated_at`,
      )
      .run(id, payload.gameUserSettings, payload.game, now);
    const saved = this.get(id);
    if (saved === null) {
      throw new Error("Failed to persist pending server INI");
    }
    return saved;
  }

  delete(serverId: string): boolean {
    const id = serverId.trim();
    if (id.length === 0) {
      return false;
    }
    const result = this.db
      .prepare(`DELETE FROM pending_server_ini WHERE server_id = ?`)
      .run(id);
    return Number(result.changes) > 0;
  }
}
