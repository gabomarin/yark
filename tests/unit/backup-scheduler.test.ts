import { afterEach, describe, expect, it, vi } from "vitest";
import { BackupScheduler } from "@backend/domains/backups/backup-scheduler";
import type { BackupService } from "@backend/domains/backups/backup-service";

describe("BackupScheduler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reports a rejected cycle and retries on the next tick", async () => {
    vi.useFakeTimers();
    const error = new Error("database unavailable");
    const runScheduledCycle = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const scheduler = new BackupScheduler(
      { runScheduledCycle } as unknown as BackupService,
      100,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(consoleError).toHaveBeenCalledWith(
      "Scheduled backup cycle failed",
      error,
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(runScheduledCycle).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
