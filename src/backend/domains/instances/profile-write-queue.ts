/**
 * Serialize profile mutations so overlapping IPC updates run one-at-a-time
 * per server id (avoids last-write-wins on concurrent panel persists).
 */
export class ProfileWriteQueue {
  private readonly chains = new Map<string, Promise<unknown>>();

  async withWrite<T>(id: string, work: () => Promise<T> | T): Promise<T> {
    const previous = this.chains.get(id) ?? Promise.resolve();
    const run = previous.then(
      () => work(),
      () => work(),
    );
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.chains.set(id, settled);
    void settled.finally(() => {
      if (this.chains.get(id) === settled) {
        this.chains.delete(id);
      }
    });
    return run;
  }
}
