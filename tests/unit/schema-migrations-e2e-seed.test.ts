import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_PLAYERS_LAUNCH_BACKFILL_SCHEMA_VERSION } from "@backend/infra/db/backfill-max-players";
import { openDatabase } from "@backend/infra/db/database";

const require = createRequire(import.meta.url);
const { initProfileDatabase } = require("../../scripts/e2e-init-profile-db.cjs") as {
  initProfileDatabase: (dbPath: string) => void;
};

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

    initProfileDatabase(dbPath);

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
