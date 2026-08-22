import type {
  BackupKind,
  ServerStopProgress,
  ServerStopProgressReason,
} from "@shared/types";
import type { ServerInstallationInfo } from "@shared/types";

/** Max concurrent async FS classify probes during a fleet scan. */
export const FLEET_INSPECT_CONCURRENCY = 3;

export type StopJobOutcome =
  | "stopped"
  | "already_exited"
  | "killed"
  | "absent"
  | "noop";

export async function mapPool<T, R>(
  items: ReadonlyArray<T>,
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function backupKindLabel(kind: BackupKind): string {
  if (kind === "world") return "world save";
  if (kind === "players") return "player profiles";
  return "INI files";
}

/** True when profile ids match the cached install snapshot set (order-independent). */
export function sameServerIds(
  profiles: ReadonlyArray<{ id: string }>,
  cached: ReadonlyArray<ServerInstallationInfo>,
): boolean {
  if (profiles.length !== cached.length) {
    return false;
  }
  const cachedIds = new Set(cached.map((info) => info.serverId));
  return profiles.every((profile) => cachedIds.has(profile.id));
}

export function backingUpPercent(index: number, total: number): number {
  if (total <= 1) return 85;
  return Math.round(40 + (index / (total - 1)) * 45);
}

export function buildServerStopProgress(
  serverId: string,
  reason: ServerStopProgressReason,
  partial: Omit<ServerStopProgress, "serverId" | "reason">,
): ServerStopProgress {
  return {
    serverId,
    reason,
    ...partial,
  };
}

export function buildServerStoppedEventMessage(input: {
  serverName: string;
  exitedExternally: boolean;
  didBackup: boolean;
}): string {
  if (input.exitedExternally) {
    return input.didBackup
      ? `Server "${input.serverName}" exited externally; stop backup completed`
      : `Server "${input.serverName}" exited externally during safe stop`;
  }
  return input.didBackup
    ? `Server "${input.serverName}" stopped (save + pre-stop backup)`
    : `Server "${input.serverName}" stopped (with prior save)`;
}
