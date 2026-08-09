import type { OnlinePlayerInfo } from "@shared/ipc";
import type {
  AppEvent,
  ServerInstallationInfo,
  ServerRuntimeInfo,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "@shared/types";

export interface PlayerListSnapshot {
  players: OnlinePlayerInfo[];
  error: string | null;
  loading: boolean;
}

function samePlayers(
  left: OnlinePlayerInfo[],
  right: OnlinePlayerInfo[],
): boolean {
  return (
    left.length === right.length
    && left.every(
      (player, index) =>
        player.key === right[index]?.key && player.name === right[index]?.name,
    )
  );
}

function samePlayerList(
  left: PlayerListSnapshot,
  right: PlayerListSnapshot,
): boolean {
  return (
    left.loading === right.loading
    && left.error === right.error
    && samePlayers(left.players, right.players)
  );
}

/** Patch one player-list row without churning the Map when content is unchanged. */
export function upsertPlayerListState(
  previous: Map<string, PlayerListSnapshot>,
  serverId: string,
  nextState: PlayerListSnapshot,
): Map<string, PlayerListSnapshot> {
  const prior = previous.get(serverId);
  if (prior !== undefined && samePlayerList(prior, nextState)) {
    return previous;
  }
  const next = new Map(previous);
  next.set(serverId, nextState);
  return next;
}

function sameRuntime(
  left: ServerRuntimeInfo,
  right: ServerRuntimeInfo,
): boolean {
  return (
    left.serverId === right.serverId
    && left.status === right.status
    && left.pid === right.pid
    && left.startedAt === right.startedAt
    && left.lastError === right.lastError
  );
}

/** Keep prior Map / entry identities when runtime rows are unchanged. */
export function reconcileStatusMap(
  previous: Map<string, ServerRuntimeInfo>,
  nextList: ServerRuntimeInfo[],
): Map<string, ServerRuntimeInfo> {
  if (
    previous.size === nextList.length
    && nextList.every((status) => {
      const prior = previous.get(status.serverId);
      return prior !== undefined && sameRuntime(prior, status);
    })
  ) {
    return previous;
  }

  const next = new Map<string, ServerRuntimeInfo>();
  for (const status of nextList) {
    const prior = previous.get(status.serverId);
    next.set(
      status.serverId,
      prior !== undefined && sameRuntime(prior, status) ? prior : status,
    );
  }
  return next;
}

/** Patch one runtime row from a status push without churning the Map. */
export function upsertRuntimeStatus(
  previous: Map<string, ServerRuntimeInfo>,
  info: ServerRuntimeInfo,
): Map<string, ServerRuntimeInfo> {
  const prior = previous.get(info.serverId);
  if (prior !== undefined && sameRuntime(prior, info)) return previous;
  const next = new Map(previous);
  next.set(info.serverId, info);
  return next;
}

function sameInstall(
  left: ServerInstallationInfo,
  right: ServerInstallationInfo,
): boolean {
  return (
    left.serverId === right.serverId
    && left.health === right.health
    && left.installed === right.installed
    && left.build === right.build
    && left.steamBuild === right.steamBuild
    && left.arkVersion === right.arkVersion
    && left.version === right.version
    && left.guidance === right.guidance
    && left.checkedAt === right.checkedAt
  );
}

export function reconcileInstallationMap(
  previous: Map<string, ServerInstallationInfo>,
  nextList: ServerInstallationInfo[],
): Map<string, ServerInstallationInfo> {
  if (
    previous.size === nextList.length
    && nextList.every((row) => {
      const prior = previous.get(row.serverId);
      return prior !== undefined && sameInstall(prior, row);
    })
  ) {
    return previous;
  }

  const next = new Map<string, ServerInstallationInfo>();
  for (const row of nextList) {
    const prior = previous.get(row.serverId);
    next.set(
      row.serverId,
      prior !== undefined && sameInstall(prior, row) ? prior : row,
    );
  }
  return next;
}

export function reconcileSteamCmdStatus(
  previous: SteamCmdStatus | null,
  next: SteamCmdStatus,
): SteamCmdStatus {
  if (previous === null) return next;
  const previousJobs = previous.criticalJobs ?? [];
  const nextJobs = next.criticalJobs ?? [];
  if (
    previous.detected === next.detected
    && previous.executablePath === next.executablePath
    && previous.depotCacheDir === next.depotCacheDir
    && previous.contentCacheDir === next.contentCacheDir
    && previous.busy === next.busy
    && previous.running === next.running
    && previous.operation === next.operation
    && previous.serverId === next.serverId
    && previous.startedAt === next.startedAt
    && previous.pid === next.pid
    && previous.progressPercent === next.progressPercent
    && previous.progressLabel === next.progressLabel
    && previous.progressBytesDownloaded === next.progressBytesDownloaded
    && previous.progressBytesTotal === next.progressBytesTotal
    && previous.lastLine === next.lastLine
    && previous.queuedCount === next.queuedCount
    // Ignore checkedAt — getSteamCmdStatus() stamps a fresh ISO on every call.
    && previousJobs.length === nextJobs.length
    && previousJobs.every(
      (job, index) =>
        job.id === nextJobs[index]?.id
        && job.updatedAt === nextJobs[index]?.updatedAt
        && job.status === nextJobs[index]?.status,
    )
  ) {
    return previous;
  }
  return next;
}

export function reconcileSteamCmdConsole(
  previous: SteamCmdConsoleSnapshot | null,
  next: SteamCmdConsoleSnapshot,
): SteamCmdConsoleSnapshot {
  if (previous === null) return next;
  if (
    previous.updatedAt === next.updatedAt
    && previous.lines.length === next.lines.length
    && previous.lines.every((line, index) => line === next.lines[index])
  ) {
    return previous;
  }
  return next;
}

export function reconcileEvents(
  previous: AppEvent[],
  next: AppEvent[],
): AppEvent[] {
  if (
    previous.length === next.length
    && previous.every((event, index) => event.id === next[index]?.id)
  ) {
    return previous;
  }
  return next;
}

export function reconcileClusterReports<T extends { clusterId: string; checkedAt: string }>(
  previous: T[],
  next: T[],
): T[] {
  if (
    previous.length === next.length
    && previous.every(
      (report, index) =>
        report.clusterId === next[index]?.clusterId
        && report.checkedAt === next[index]?.checkedAt,
    )
  ) {
    return previous;
  }
  return next;
}
