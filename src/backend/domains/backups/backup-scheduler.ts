import type { BackupService } from "./backup-service";

/**
 * Simple in-memory scheduler to trigger periodic backup cycles.
 * Walks policies on short intervals and decides by "last backup + interval".
 * Overlapping ticks are coalesced so a slow cycle cannot stack another run.
 */
export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private cyclePromise: Promise<void> | null = null;

  constructor(
    private readonly service: BackupService,
    private readonly tickMs = 60_000,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (this.cyclePromise !== null) return;
      this.cyclePromise = this.service
        .runScheduledCycle()
        .catch((error: unknown) => {
          console.error("Scheduled backup cycle failed", error);
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
