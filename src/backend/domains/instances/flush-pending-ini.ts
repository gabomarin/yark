import type { ServerRepository } from "../../infra/db/server-repository";

/**
 * Best-effort pending INI flush after the process has exited (#530).
 * Failures are logged as server events; stop/kill/start must not abort on flush errors.
 */
export async function flushPendingIniBestEffort(
  flush: ((serverId: string) => Promise<boolean>) | undefined,
  repo: ServerRepository,
  serverId: string,
  serverName: string,
): Promise<void> {
  if (flush === undefined) {
    return;
  }
  try {
    await flush(serverId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    repo.addEvent(
      serverId,
      "error",
      "warning",
      `Pending INI flush failed for "${serverName}": ${message}`,
    );
  }
}
