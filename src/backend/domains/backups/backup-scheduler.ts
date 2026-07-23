import type { BackupService } from "./backup-service";

/**
 * Scheduler simple en memoria para disparar ciclo de backups periódicos.
 * Recorre políticas en intervalos cortos y decide por "último backup + interval".
 */
export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly service: BackupService,
    private readonly tickMs = 60_000,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.service.runScheduledCycle();
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
