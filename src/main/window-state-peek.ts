import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  WINDOW_STATE_SETTING_KEY,
  parseWindowState,
  type PersistedWindowState,
} from "./window-state";

/**
 * Best-effort read of persisted window bounds before the full DB boot.
 * Returns null when the file is missing, locked, corrupt, or the key is absent.
 */
export function peekStoredWindowState(dbPath: string): PersistedWindowState | null {
  if (!existsSync(dbPath)) {
    return null;
  }
  try {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db
        .prepare("SELECT value FROM app_settings WHERE key = ?")
        .get(WINDOW_STATE_SETTING_KEY) as { value?: unknown } | undefined;
      return parseWindowState(typeof row?.value === "string" ? row.value : null);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
