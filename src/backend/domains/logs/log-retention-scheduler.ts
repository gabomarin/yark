import type { LogsService } from "./logs-service";

/**
 * Periodic enforcement of YARK-owned log retention (#84).
 * Runs once after a short idle delay, then on a daily interval.
 */
export class LogRetentionScheduler {
  private intervalTimer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private cyclePromise: Promise<void> | null = null;

  constructor(
    private readonly logs: LogsService,
    private readonly intervalMs = 24 * 60 * 60 * 1000,
    private readonly startupDelayMs = 60_000,
  ) {}

  start(): void {
    if (this.startupTimer !== null || this.intervalTimer !== null) return;

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      this.kick();
      this.intervalTimer = setInterval(() => this.kick(), this.intervalMs);
      this.intervalTimer.unref();
    }, this.startupDelayMs);
    this.startupTimer.unref();
  }

  stop(): void {
    if (this.startupTimer !== null) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.intervalTimer !== null) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private kick(): void {
    if (this.cyclePromise !== null) return;
    this.cyclePromise = this.logs
      .enforceRetention()
      .catch((error: unknown) => {
        console.error("Log retention cycle failed", error);
      })
      .then(() => undefined)
      .finally(() => {
        this.cyclePromise = null;
      });
  }
}
