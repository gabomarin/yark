import { MAINTENANCE_SCHEDULER_TICK_MS } from "@shared/maintenance-schedule";
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
    private readonly tickMs = MAINTENANCE_SCHEDULER_TICK_MS,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    // Fire once immediately so a window already inside the warning lead
    // (e.g. Daily 13:20 with 5m warnings at 13:16) arms without waiting
    // for the first interval tick.
    this.scheduleCycle();
    this.timer = setInterval(() => {
      this.scheduleCycle();
    }, this.tickMs);
    this.timer.unref();
  }

  private scheduleCycle(): void {
    if (this.cyclePromise !== null) return;
    this.cyclePromise = this.service
      .runScheduledCycle()
      .catch((error: unknown) => {
        console.error("Scheduled maintenance cycle failed", error);
      })
      .finally(() => {
        this.cyclePromise = null;
      });
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
