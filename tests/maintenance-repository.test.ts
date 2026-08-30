import { describe, expect, it } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { MaintenanceRepository } from "@backend/infra/db/maintenance-repository";

describe("MaintenanceRepository", () => {
  it("returns default-off policy and persists toggles", () => {
    const db = openDatabase(":memory:");
    try {
      const repo = new MaintenanceRepository(db);

      const initial = repo.getPolicy("srv-1");
      expect(initial.restartEnabled).toBe(false);
      expect(initial.wipeEnabled).toBe(false);
      expect(initial.updateEnabled).toBe(false);
      expect(initial.restartWarnings.preset).toBe("standard");

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
});
