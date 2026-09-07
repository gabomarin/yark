/**
 * Overview “Loading Ark Server API…” ends when the console window appears
 * or ShooterGame.log starts writing (#243).
 */

type AsaApiLoadingManaged = {
  asaApiLoading?: boolean;
  child: { pid?: number | null };
};

export type AsaApiWindowPollHost = {
  processes: Map<string, AsaApiLoadingManaged>;
  hasMainWindow: (pid: number) => Promise<boolean>;
  clearAsaApiLoading: (serverId: string, message: string) => void;
};

/** Shared timer that probes main windows while any managed process is loading AsaApi. */
export class AsaApiWindowPoller {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(
    private readonly pollMs: number,
    private readonly host: AsaApiWindowPollHost,
  ) {}

  ensure(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollMs);
    this.timer.unref();
    void this.poll();
  }

  stopIfIdle(): void {
    const anyLoading = [...this.host.processes.values()].some(
      (managed) => managed.asaApiLoading === true,
    );
    if (anyLoading || this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      for (const [serverId, managed] of this.host.processes) {
        if (managed.asaApiLoading !== true) continue;
        const pid = managed.child.pid;
        if (pid == null || pid <= 0) continue;
        if (await this.host.hasMainWindow(pid)) {
          this.host.clearAsaApiLoading(
            serverId,
            "Ark Server API finished loading; server console is up.",
          );
        }
      }
    } finally {
      this.polling = false;
      this.stopIfIdle();
    }
  }
}
