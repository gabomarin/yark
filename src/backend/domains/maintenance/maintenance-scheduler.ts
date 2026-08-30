import type { MaintenanceService } from "./maintenance-service";

/**
 * Polls maintenance policies on a short interval (same class as BackupScheduler).
 * Overlapping ticks coalesce. Jobs do not run when YARK is quit (#315).
 */
export class MaintenanceScheduler {
  private timer: NodeJS.Timeout | null = null;
  private cyclePromise: Promise<void> | null = null;

  constructor(
    private readonly service: MaintenanceService,
    private readonly tickMs = 60_000,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (this.cyclePromise !== null) return;
      this.cyclePromise = this.service
        .runScheduledCycle()
        .catch((error: unknown) => {
          console.error("Scheduled maintenance cycle failed", error);
        })
        .finally(() => {
          this.cyclePromise = null;
        });
    }, this.tickMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
