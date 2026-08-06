import type { DatabaseSync } from "node:sqlite";
import type { ClusterIniTemplate, ServerIniPayload } from "@shared/types";

interface ClusterIniTemplateRow {
  cluster_id: string;
  game_user_settings_ini: string;
  game_ini: string;
  updated_at: string;
}

function rowToTemplate(row: ClusterIniTemplateRow): ClusterIniTemplate {
  return {
    clusterId: row.cluster_id,
    payload: {
      gameUserSettings: row.game_user_settings_ini,
      game: row.game_ini,
    },
    updatedAt: row.updated_at,
  };
}

/**
 * SQLite persistence for optional cluster-scoped INI templates (#88).
 * Does not touch member install directories.
 */
export class ClusterIniTemplateRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(clusterId: string): ClusterIniTemplate | null {
    const id = clusterId.trim();
    if (id.length === 0) {
      return null;
    }
    const row = this.db
      .prepare(
        `SELECT cluster_id, game_user_settings_ini, game_ini, updated_at
         FROM cluster_ini_templates WHERE cluster_id = ?`,
      )
      .get(id) as unknown as ClusterIniTemplateRow | undefined;
    return row === undefined ? null : rowToTemplate(row);
  }

  upsert(clusterId: string, payload: ServerIniPayload): ClusterIniTemplate {
    const id = clusterId.trim();
    if (id.length === 0) {
      throw new Error("Cluster ID is required");
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO cluster_ini_templates (
           cluster_id, game_user_settings_ini, game_ini, updated_at
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(cluster_id) DO UPDATE SET
           game_user_settings_ini = excluded.game_user_settings_ini,
           game_ini = excluded.game_ini,
           updated_at = excluded.updated_at`,
      )
      .run(id, payload.gameUserSettings, payload.game, now);
    const saved = this.get(id);
    if (saved === null) {
      throw new Error("Failed to persist cluster INI template");
    }
    return saved;
  }

  delete(clusterId: string): boolean {
    const id = clusterId.trim();
    if (id.length === 0) {
      return false;
    }
    const result = this.db
      .prepare(`DELETE FROM cluster_ini_templates WHERE cluster_id = ?`)
      .run(id);
    return Number(result.changes) > 0;
  }
}
