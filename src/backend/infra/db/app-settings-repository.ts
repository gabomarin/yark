import type { DatabaseSync } from "node:sqlite";

interface SettingRow {
  key: string;
  value: string | null;
  updated_at: string;
}

/**
 * Simple KV store for global app settings.
 */
export class AppSettingsRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(key: string): string | null {
    const row = this.db
      .prepare("SELECT key, value, updated_at FROM app_settings WHERE key = ?")
      .get(key) as unknown as SettingRow | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string | null): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .run(key, value, now);
  }
}
