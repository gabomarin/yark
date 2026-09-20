import { describe, expect, it } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { CrashRecoveryRepository } from "@backend/infra/db/crash-recovery-repository";
import { DEFAULT_CRASH_RECOVERY } from "@shared/crash-recovery/crash-recovery-policy";

describe("CrashRecoveryRepository", () => {
  it("returns default-off policy without inserting a row", () => {
    const db = openDatabase(":memory:");
    try {
      const repo = new CrashRecoveryRepository(db);
      const policy = repo.getPolicy("srv-1");
      expect(policy.enabled).toBe(false);
      expect(policy.maxAttempts).toBe(DEFAULT_CRASH_RECOVERY.maxAttempts);
      expect(policy.attempts).toBe(0);
      expect(policy.exhausted).toBe(false);
    } finally {
      db.close();
    }
  });

  it("persists policy, attempt budget, pause, and reset", () => {
    const db = openDatabase(":memory:");
    try {
      const repo = new CrashRecoveryRepository(db);
      repo.ensurePolicy("srv-1");
      const saved = repo.setPolicy("srv-1", {
        enabled: true,
        maxAttempts: 3,
        backoffSeconds: 30,
        stabilitySeconds: 600,
        paused: false,
      });
      expect(saved.enabled).toBe(true);

      repo.recordAttempt("srv-1", 2, "boom");
      const afterAttempts = repo.getPolicy("srv-1");
      expect(afterAttempts.attempts).toBe(2);
      expect(afterAttempts.lastFailureReason).toBe("boom");
      expect(afterAttempts.exhausted).toBe(false);

      // Editing policy knobs must not wipe the persisted budget.
      repo.setPolicy("srv-1", {
        enabled: true,
        maxAttempts: 2,
        backoffSeconds: 60,
        stabilitySeconds: 600,
        paused: true,
      });
      const edited = repo.getPolicy("srv-1");
      expect(edited.attempts).toBe(2);
      expect(edited.paused).toBe(true);
      expect(edited.exhausted).toBe(true);

      repo.reset("srv-1");
      const reset = repo.getPolicy("srv-1");
      expect(reset.attempts).toBe(0);
      expect(reset.exhausted).toBe(false);
      expect(reset.lastFailureReason).toBeNull();
    } finally {
      db.close();
    }
  });

  it("clamps out-of-range values read from the row", () => {
    const db = openDatabase(":memory:");
    try {
      const repo = new CrashRecoveryRepository(db);
      repo.setPolicy("srv-x", {
        enabled: true,
        maxAttempts: 10,
        backoffSeconds: 3600,
        stabilitySeconds: 86_400,
        paused: false,
      });
      const policy = repo.getPolicy("srv-x");
      expect(policy.maxAttempts).toBe(10);
      expect(policy.backoffSeconds).toBe(3600);
      expect(policy.stabilitySeconds).toBe(86_400);
    } finally {
      db.close();
    }
  });
});
