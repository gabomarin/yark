import {
  canPauseSteamCmdJob,
  formatSteamCmdByteProgress,
  hasMeaningfulSteamCmdByteProgress,
  steamCmdByteProgressNoun,
} from "@shared/steamcmd-progress";
import type {
  CriticalJobOperation,
  CriticalJobSummary,
  ServerProfile,
  SteamCmdStatus,
} from "@shared/types";
import { formatDownloadPhase } from "./downloadsCopy";

export type DownloadRowKind = "active" | "queued" | "paused" | "attention";

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

export type DownloadsTeaser = {
  visible: boolean;
  title: string;
  detail: string;
  percent: number | null;
  attention: boolean;
  canCancel: boolean;
  canResume: boolean;
  canPause: boolean;
  canRetry: boolean;
  usesLiveCancel: boolean;
  selectedJobId: string | null;
};

const OPERATION_TITLE: Record<
  NonNullable<SteamCmdStatus["operation"]> | CriticalJobOperation,
  string
> = {
  "install-steamcmd": "Installing SteamCMD",
  "install-files": "Installing files",
  update: "Updating server",
  "sync-files": "Copying files to the server",
  "verify-files": "Verifying integrity",
  "pre-update-backup": "Creating pre-update backup",
  restore: "Restoring backup",
};

const FILES_QUEUE_OPERATIONS = new Set<CriticalJobOperation>([
  "install-files",
  "update",
  "verify-files",
]);

export function operationTitle(
  operation: NonNullable<SteamCmdStatus["operation"]> | CriticalJobOperation,
): string {
  return OPERATION_TITLE[operation];
}

function statusLabelForJob(job: CriticalJobSummary): string {
  if (job.status === "pending" || job.status === "retrying") return "queued";
  return job.status;
}

function classifyJobKind(job: CriticalJobSummary): DownloadRowKind {
  if (job.status === "running") return "active";
  if (job.status === "paused") return "paused";
  if (job.status === "pending" || job.status === "retrying") return "queued";
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
      kind === "paused"
        ? "Paused"
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

export function buildDownloadsTeaser(
  status: SteamCmdStatus,
  rows: DownloadRow[],
): DownloadsTeaser {
  const attentionRows = rows.filter((row) => row.kind === "attention");
  const attentionHint =
    attentionRows.length > 0
      ? `${attentionRows.length} need review`
      : null;

  const active = rows.find((row) => row.kind === "active");
  if (active !== undefined) {
    const queued = rows.filter((row) => row.kind === "queued").length;
    const byteNoun =
      status.operation !== null ? steamCmdByteProgressNoun(status.operation) : "Files";
    const title =
      active.title === active.serverName
        ? active.title
        : `${active.title} · ${active.serverName}`;
    return {
      visible: true,
      title,
      detail: [
        active.byteProgress !== null ? `${byteNoun}: ${active.byteProgress}` : active.phase,
        queued > 0 ? `${queued} queued` : null,
        attentionHint,
      ]
        .filter(Boolean)
        .join(" · "),
      percent: active.percent,
      attention: attentionRows.length > 0,
      canCancel: true,
      canResume: false,
      canPause: active.canPause,
      canRetry: false,
      usesLiveCancel: active.usesLiveCancel,
      selectedJobId: active.job?.id ?? null,
    };
  }

  const paused = rows.filter((row) => row.kind === "paused");
  if (paused.length > 0) {
    const first = paused[0]!;
    return {
      visible: true,
      title: `${first.title} · paused`,
      detail: [first.subtitle, attentionHint].filter(Boolean).join(" · "),
      percent: first.percent,
      attention: attentionRows.length > 0,
      canCancel: status.detected && first.job?.nextActions.includes("cancel") === true,
      canResume: status.detected,
      canPause: false,
      canRetry: false,
      usesLiveCancel: false,
      selectedJobId: first.job?.id ?? null,
    };
  }

  const attention = rows.filter((row) => row.kind === "attention");
  if (attention.length > 0) {
    return {
      visible: true,
      title: `${attention.length} download${attention.length === 1 ? "" : "s"} need attention`,
      detail: attention.map((row) => row.serverName).join(" · "),
      percent: null,
      attention: true,
      canCancel: false,
      canResume: false,
      canPause: false,
      canRetry: attention[0]?.job?.nextActions.includes("retry") === true,
      usesLiveCancel: false,
      selectedJobId: attention[0]?.job?.id ?? null,
    };
  }

  const queuedOnly = rows.filter((row) => row.kind === "queued");
  if (queuedOnly.length > 0) {
    const first = queuedOnly[0]!;
    return {
      visible: true,
      title: `${queuedOnly.length} queued download${queuedOnly.length === 1 ? "" : "s"}`,
      detail: first.title,
      percent: null,
      attention: false,
      canCancel: first.job?.nextActions.includes("cancel") === true,
      canResume: false,
      canPause: false,
      canRetry: false,
      usesLiveCancel: false,
      selectedJobId: first.job?.id ?? null,
    };
  }

  return {
    visible: false,
    title: "",
    detail: "",
    percent: null,
    attention: false,
    canCancel: false,
    canResume: false,
    canPause: false,
    canRetry: false,
    usesLiveCancel: false,
    selectedJobId: null,
  };
}

export function shouldShowDownloadsChrome(status: SteamCmdStatus | null): boolean {
  if (status === null) return false;
  if (status.busy) return true;
  return (status.criticalJobs?.length ?? 0) > 0;
}

export type ServerFilesQueueKind = "active" | "paused" | "queued";

export type ServerFilesQueueState = {
  kind: ServerFilesQueueKind;
  jobId: string;
  operation: CriticalJobOperation;
  label: string;
};

const QUEUE_KIND_RANK: Record<ServerFilesQueueKind, number> = {
  active: 0,
  paused: 1,
  queued: 2,
};

function queueKindForJob(status: CriticalJobSummary["status"]): ServerFilesQueueKind | null {
  if (status === "running") return "active";
  if (status === "paused") return "paused";
  if (status === "pending" || status === "retrying") return "queued";
  return null;
}

export function steamFilesOperationForKind(
  kind: "install" | "update" | "verify",
): CriticalJobOperation {
  if (kind === "install") return "install-files";
  if (kind === "verify") return "verify-files";
  return "update";
}

/** Latest install/update/verify job per server (active wins over paused over queued). */
export function filesQueueStateByServerId(
  jobs: CriticalJobSummary[] | undefined,
): Map<string, ServerFilesQueueState> {
  const map = new Map<string, ServerFilesQueueState>();
  for (const job of jobs ?? []) {
    if (!FILES_QUEUE_OPERATIONS.has(job.operation)) continue;
    const kind = queueKindForJob(job.status);
    if (kind === null) continue;
    const current = map.get(job.serverId);
    if (current !== undefined && QUEUE_KIND_RANK[current.kind] <= QUEUE_KIND_RANK[kind]) {
      continue;
    }
    const title = operationTitle(job.operation);
    map.set(job.serverId, {
      kind,
      jobId: job.id,
      operation: job.operation,
      label:
        kind === "queued"
          ? `Queued · ${title}`
          : kind === "paused"
            ? `Paused · ${title}`
            : title,
    });
  }
  return map;
}
