import {
  canPauseSteamCmdJob,
  formatSteamCmdByteProgress,
  hasMeaningfulSteamCmdByteProgress,
  steamCmdByteProgressNoun,
} from "@shared/steamcmd-progress";
import type {
  CriticalJobSummary,
  ServerProfile,
  SteamCmdStatus,
} from "@shared/types";
import { formatDownloadPhase } from "./downloadsCopy";
import {
  FILES_QUEUE_OPERATIONS,
  isOperatorVisibleCriticalJob,
  operationTitle,
} from "./downloadsOperationCopy";

export { buildDownloadsTeaser } from "./downloadsTeaserModel";
export type { ServerFilesQueueState } from "./downloadsFilesQueueModel";
export { filesQueueStateByServerId } from "./downloadsFilesQueueModel";

export type DownloadRowKind = "active" | "interrupted" | "queued" | "paused" | "cancelled" | "attention";

export type DownloadRow = {
  id: string;
  kind: DownloadRowKind;
  serverId: string | null;
  eventId: number | null;
  title: string;
  subtitle: string;
  serverName: string;
  mapId: string | null;
  mapModId: string | null;
  modThumbnailUrl: string | null;
  statusLabel: string;
  phase: string;
  percent: number | null;
  byteProgress: string | null;
  byteProgressNoun: string | null;
  job: CriticalJobSummary | null;
  usesLiveCancel: boolean;
  canPause: boolean;
  reorderable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

function statusLabelForJob(job: CriticalJobSummary): string {
  if (job.status === "pending" || job.status === "retrying") return "queued";
  return job.status;
}

function isRestartInterruptedJob(job: CriticalJobSummary): boolean {
  return job.status === "failed"
    && job.nextActions.includes("retry")
    && (job.recoveryReason?.startsWith("YARK closed during phase") ?? false);
}

function classifyJobKind(job: CriticalJobSummary): DownloadRowKind {
  if (isRestartInterruptedJob(job)) return "interrupted";
  if (job.status === "running") return "active";
  if (job.status === "paused") return "paused";
  if (job.status === "pending" || job.status === "retrying") return "queued";
  if (job.status === "cancelled") return "cancelled";
  return "attention";
}

function serverLabel(
  status: SteamCmdStatus,
  serverId: string | null,
  serverName?: string | null,
): string {
  if (serverName !== null && serverName !== undefined && serverName.length > 0) {
    return serverName;
  }
  if (serverId !== null && serverId.length > 0) {
    return serverId;
  }
  if (status.operation === "install-steamcmd") {
    return "This PC";
  }
  return "Unknown server";
}

function liveRowFromStatus(
  status: SteamCmdStatus,
  activeServer?: ServerProfile | null,
): DownloadRow | null {
  if (!status.busy || status.operation === null) {
    return null;
  }
  const operation = status.operation;
  const downloaded = status.progressBytesDownloaded;
  const total = status.progressBytesTotal;
  const byteProgress =
    downloaded !== null
    && total !== null
    && hasMeaningfulSteamCmdByteProgress(downloaded, total)
      ? formatSteamCmdByteProgress(downloaded, total)
      : null;
  const serverName = serverLabel(status, status.serverId, activeServer?.name ?? null);
  return {
    id: `live:${operation}:${status.serverId ?? "global"}`,
    kind: "active",
    serverId: status.serverId,
    eventId: null,
    title: serverName,
    subtitle: operationTitle(operation),
    serverName,
    mapId: activeServer?.map ?? null,
    mapModId: activeServer?.mapModId ?? null,
    modThumbnailUrl:
      activeServer?.mapModId != null
        ? (activeServer.modMetadataCache?.[activeServer.mapModId]?.thumbnailUrl ?? null)
        : null,
    statusLabel: status.running ? "running" : "queued",
    phase: status.progressLabel ?? status.lastLine ?? "In progress…",
    percent: status.progressPercent,
    byteProgress,
    byteProgressNoun: byteProgress !== null ? steamCmdByteProgressNoun(operation) : null,
    job: null,
    usesLiveCancel: true,
    canPause: canPauseSteamCmdJob(operation),
    reorderable: false,
    canMoveUp: false,
    canMoveDown: false,
  };
}

function jobRowFromSummary(
  job: CriticalJobSummary,
  server?: ServerProfile | null,
  status?: SteamCmdStatus,
): DownloadRow {
  const kind = classifyJobKind(job);
  const reorderable =
    kind === "queued" && FILES_QUEUE_OPERATIONS.has(job.operation);
  const matchesLiveProgress =
    kind === "active"
    && status !== undefined
    && status.serverId === job.serverId
    && (status.operation === job.operation
      || (status.operation === "sync-files" && job.operation === "install-files"));
  const downloaded = status?.progressBytesDownloaded ?? null;
  const total = status?.progressBytesTotal ?? null;
  const byteProgress =
    matchesLiveProgress
    && downloaded !== null
    && total !== null
    && hasMeaningfulSteamCmdByteProgress(downloaded, total)
      ? formatSteamCmdByteProgress(downloaded, total)
      : null;
  return {
    id: job.id,
    kind,
    serverId: job.serverId,
    eventId: job.eventId ?? null,
    title: job.serverName ?? server?.name ?? job.serverId,
    subtitle: operationTitle(job.operation),
    serverName: job.serverName ?? server?.name ?? job.serverId,
    mapId: server?.map ?? null,
    mapModId: server?.mapModId ?? null,
    modThumbnailUrl:
      server?.mapModId != null
        ? (server.modMetadataCache?.[server.mapModId]?.thumbnailUrl ?? null)
        : null,
    statusLabel: statusLabelForJob(job),
    phase:
      kind === "interrupted"
        ? "Interrupted"
        : kind === "paused"
        ? "Paused"
        : kind === "queued"
          ? "Queued"
          : job.status === "cancelled"
            ? "Cancelled"
            : matchesLiveProgress && status?.progressLabel !== null
              ? status.progressLabel
              : formatDownloadPhase(job.phase),
    percent: matchesLiveProgress ? status?.progressPercent ?? null : null,
    byteProgress,
    byteProgressNoun:
      matchesLiveProgress
      && byteProgress !== null
      && (status?.operation === "install-steamcmd"
        || status?.operation === "install-files"
        || status?.operation === "update"
        || status?.operation === "sync-files"
        || status?.operation === "verify-files")
        ? steamCmdByteProgressNoun(status.operation)
        : null,
    job,
    usesLiveCancel: kind === "active",
    canPause: kind === "active" && canPauseSteamCmdJob(job.operation, job.phase),
    reorderable,
    canMoveUp: false,
    canMoveDown: false,
  };
}

export function buildDownloadRows(
  status: SteamCmdStatus,
  options?: { activeServer?: ServerProfile | null; serversById?: Map<string, ServerProfile> },
): DownloadRow[] {
  const jobs = status.criticalJobs ?? [];
  const runningJob = jobs.find((job) => job.status === "running");
  const liveRow =
    status.operation === "install-steamcmd"
    || status.operation === "sync-files"
    || (status.running && runningJob === undefined)
      ? liveRowFromStatus(status, options?.activeServer)
      : null;

  const rows: DownloadRow[] = [];
  if (liveRow !== null) {
    rows.push(liveRow);
  }

  for (const job of jobs) {
    if (!isOperatorVisibleCriticalJob(job)) {
      continue;
    }
    if (liveRow !== null && job.status === "running") {
      continue;
    }
    rows.push(jobRowFromSummary(job, options?.serversById?.get(job.serverId) ?? null, status));
  }

  const queued = rows.filter((row) => row.kind === "queued" && row.reorderable);
  for (let index = 0; index < queued.length; index += 1) {
    const row = queued[index]!;
    row.canMoveUp = index > 0;
    row.canMoveDown = index < queued.length - 1;
  }

  return rows;
}

export function downloadsBadgeCount(rows: DownloadRow[]): number {
  return rows.length;
}

export function defaultSelectedRowId(rows: DownloadRow[]): string | null {
  const active = rows.find((row) => row.kind === "active");
  if (active !== undefined) return active.id;
  const interrupted = rows.find((row) => row.kind === "interrupted");
  if (interrupted !== undefined) return interrupted.id;
  const paused = rows.find((row) => row.kind === "paused");
  if (paused !== undefined) return paused.id;
  const attention = rows.find((row) => row.kind === "attention");
  if (attention !== undefined) return attention.id;
  return rows[0]?.id ?? null;
}

export function findDownloadRow(
  rows: DownloadRow[],
  selectedId: string | null,
): DownloadRow | null {
  if (selectedId === null) return null;
  return rows.find((row) => row.id === selectedId) ?? null;
}

/** SteamCMD console text for the Downloads lower pane — active or paused job output; cleared on resume. */
export function downloadConsoleBody(
  rows: DownloadRow[],
  lines: string[],
): string {
  const showConsole = rows.some(
    (row) =>
      row.kind === "active"
      || row.kind === "paused"
      || row.kind === "interrupted",
  );
  if (!showConsole) {
    return "";
  }
  if (lines.length === 0) {
    return "Waiting for progress…";
  }
  return lines.slice(-120).join("\n");
}

/** Detail hint for a queued files job — reflects queue order, not only the live row. */
export function queuedJobDetailHint(
  selected: DownloadRow,
  rows: DownloadRow[],
): string {
  const queued = rows.filter((row) => row.kind === "queued" && row.reorderable);
  const index = queued.findIndex((row) => row.id === selected.id);
  if (index < 0) {
    return "This job is waiting in the queue.";
  }
  if (index === 0) {
    const active = rows.find((row) => row.kind === "active");
    if (active !== undefined) {
      return `Runs next, after ${active.serverName} finishes.`;
    }
    const paused = rows.find((row) => row.kind === "paused");
    if (paused !== undefined) {
      return `Runs next, after ${paused.serverName} is resumed and finishes.`;
    }
    const interrupted = rows.find((row) => row.kind === "interrupted");
    if (interrupted !== undefined) {
      return `Runs next, after ${interrupted.serverName} is retried and finishes.`;
    }
    return "Runs next when SteamCMD is free.";
  }
  const previous = queued[index - 1]!;
  const interrupted = rows.find((row) => row.kind === "interrupted");
  if (interrupted !== undefined) {
    return `Runs after ${interrupted.serverName} is retried and ${previous.serverName} finishes.`;
  }
  return `Runs after ${previous.serverName} finishes.`;
}

export function shouldShowDownloadsChrome(status: SteamCmdStatus | null): boolean {
  if (status === null) return false;
  if (status.busy) return true;
  return (status.criticalJobs?.length ?? 0) > 0;
}
