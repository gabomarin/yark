import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_PLAYERS_LAUNCH_BACKFILL_SCHEMA_VERSION } from "@backend/infra/db/backfill-max-players";
import { openDatabase } from "@backend/infra/db/database";
import schemaMigrations from "@backend/infra/db/schema-migrations.json";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("schema-migrations.json E2E seed path", () => {
  it("reaches the current user_version so openDatabase is a no-op migrate", () => {
    const dir = mkdtempSync(join(tmpdir(), "yark-e2e-schema-"));
    tempRoots.push(dir);
    const dbPath = join(dir, "yark-server-manager.db");

    const seeded = new DatabaseSync(dbPath);
    try {
      seeded.exec("PRAGMA journal_mode = WAL;");
      seeded.exec("PRAGMA foreign_keys = ON;");
      for (const migration of schemaMigrations) {
        seeded.exec("BEGIN;");
        seeded.exec(migration.sql);
        seeded.exec(`PRAGMA user_version = ${migration.version};`);
        seeded.exec("COMMIT;");
      }
    } finally {
      seeded.close();
    }

    const db = openDatabase(dbPath, { takeSnapshots: false });
    try {
      const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
      expect(row.user_version).toBe(MAX_PLAYERS_LAUNCH_BACKFILL_SCHEMA_VERSION);
      expect(
        db
          .prepare(
            "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'servers'",
          )
          .get(),
      ).toEqual({ present: 1 });
    } finally {
      db.close();
    }
  });
});
