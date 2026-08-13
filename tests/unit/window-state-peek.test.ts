import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { peekStoredWindowState } from "../../src/main/window-state-peek";
import { WINDOW_STATE_SETTING_KEY, serializeWindowState } from "../../src/main/window-state";

describe("peekStoredWindowState", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null when the database file is missing", () => {
    expect(peekStoredWindowState(join(tmpdir(), "yark-missing-window-state.db"))).toBeNull();
  });

  it("reads persisted bounds without opening the full app DB", () => {
    const dir = mkdtempSync(join(tmpdir(), "yark-window-peek-"));
    dirs.push(dir);
    const dbPath = join(dir, "yark.db");
    const db = new DatabaseSync(dbPath);
    db.exec(
      `CREATE TABLE app_settings (
         key TEXT PRIMARY KEY NOT NULL,
         value TEXT,
         updated_at TEXT NOT NULL
       )`,
    );
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(
      WINDOW_STATE_SETTING_KEY,
      serializeWindowState({
        x: 2000,
        y: 40,
        width: 1400,
        height: 900,
        isMaximized: true,
      }),
      new Date().toISOString(),
    );
    db.close();

    expect(peekStoredWindowState(dbPath)).toEqual({
      x: 2000,
      y: 40,
      width: 1400,
      height: 900,
      isMaximized: true,
    });
  });
});
