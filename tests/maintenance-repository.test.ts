import { describe, expect, it } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { MaintenanceRepository } from "@backend/infra/db/maintenance-repository";

describe("MaintenanceRepository", () => {
  it("returns default-off policy without inserting until ensurePolicy", () => {
    const db = openDatabase(":memory:");
    try {
      const repo = new MaintenanceRepository(db);

      const initial = repo.getPolicy("srv-1");
      expect(initial.restartEnabled).toBe(false);
      expect(initial.wipeEnabled).toBe(false);
      expect(initial.updateEnabled).toBe(false);
      expect(initial.restartWarnings.preset).toBe("standard");
      expect(repo.listPolicies()).toHaveLength(0);

      repo.ensurePolicy("srv-1");
      expect(repo.listPolicies()).toHaveLength(1);
      expect(repo.getPolicy("srv-1").restartEnabled).toBe(false);

      const saved = repo.setPolicy({
        ...initial,
        restartEnabled: true,
        wipeEnabled: true,
        restartTimeLocal: "04:00",
      });
      expect(saved.restartEnabled).toBe(true);
      expect(saved.wipeEnabled).toBe(true);
      expect(repo.listPolicies()).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("ensurePolicy is idempotent under repeat calls", () => {
    const db = openDatabase(":memory:");
    try {
      const repo = new MaintenanceRepository(db);
      repo.ensurePolicy("srv-1");
      repo.ensurePolicy("srv-1");
      expect(repo.listPolicies()).toHaveLength(1);
    } finally {
      db.close();
    }
  });
});
