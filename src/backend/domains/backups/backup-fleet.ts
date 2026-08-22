import { backupFinishedAt } from "@shared/backup-player-meta";
import type {
  BackupDiskAlertSettings,
  BackupFleetAlert,
  BackupFleetSummary,
  BackupHealthStatus,
  BackupPolicy,
  BackupRecord,
  BackupServerHealth,
} from "@shared/types";
import { readVolumeSpace, volumeRootForPath } from "./backup-disk";

/** World backup is stale when older than interval × this factor. */
export const BACKUP_STALE_INTERVAL_FACTOR = 1.5;

/** Consecutive scheduled world failures before session pause (alert copy). */
export const SCHEDULED_WORLD_FAIL_LIMIT = 3;

export interface ComputeBackupServerHealthInput {
  destinationOk: boolean;
  stale: boolean;
  failed24h: number;
  failedWorld24h: number;
  scheduleEnabled: boolean;
  hasWorldBackup: boolean;
  /** Scheduled world backups only run while the process is active. */
  serverRunning: boolean;
}

/** Pure fleet health badge for one server (used by getFleetSummary). */
export function computeBackupServerHealth(
  input: ComputeBackupServerHealthInput,
): BackupHealthStatus {
  if (!input.destinationOk || input.failedWorld24h > 0) return "critical";
  if (input.failed24h > 0) return "warning";
  if (input.scheduleEnabled && !input.hasWorldBackup) {
    return input.serverRunning ? "warning" : "unknown";
  }
  if (input.stale) return "warning";
  if (!input.scheduleEnabled && !input.hasWorldBackup) return "unknown";
  void input.serverRunning;
  return "ok";
}

/** Newest finished (completed/failed) backup by finish time. */
export function pickLatestFinishedBackup(
  records: BackupRecord[],
): BackupRecord | null {
  let latest: BackupRecord | null = null;
  let latestStamp = "";
  for (const row of records) {
    if (row.status === "running") continue;
    const stamp = backupFinishedAt(row);
    if (latest === null || stamp > latestStamp) {
      latest = row;
      latestStamp = stamp;
    }
  }
  return latest;
}

export function normalizeDiskAlertSettings(
  settings: BackupDiskAlertSettings,
): BackupDiskAlertSettings {
  const warnUsedPercent = Math.max(
    50,
    Math.min(99, Math.floor(settings.warnUsedPercent)),
  );
  const criticalUsedPercent = Math.max(
    warnUsedPercent + 1,
    Math.min(100, Math.floor(settings.criticalUsedPercent)),
  );
  const warnFreeBytes = Math.max(
    1024 * 1024 * 1024,
    Math.floor(settings.warnFreeBytes),
  );
  return { warnUsedPercent, criticalUsedPercent, warnFreeBytes };
}

export function formatBackupByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export interface BuildBackupServerHealthRowInput {
  serverId: string;
  serverName: string;
  policy: BackupPolicy;
  resolvedRoot: string;
  records: BackupRecord[];
  latestWorld: BackupRecord | null;
  destinationOk: boolean;
  serverRunning: boolean;
  schedulePaused: boolean;
  nowMs?: number;
}

export function buildBackupServerHealthRow(
  input: BuildBackupServerHealthRowInput,
): BackupServerHealth {
  const now = input.nowMs ?? Date.now();
  const dayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { records, policy, latestWorld } = input;
  const completed = records.filter((row) => row.status === "completed");
  const failed24h = records.filter((row) => {
    if (row.status !== "failed") return false;
    return backupFinishedAt(row) >= dayAgoIso;
  });
  const failedWorld24h = failed24h.filter((row) => row.kind === "world");
  const latest = pickLatestFinishedBackup(records);
  const usedBytes = completed.reduce((sum, row) => sum + Math.max(0, row.sizeBytes), 0);

  let stale = false;
  if (policy.enabled && input.serverRunning) {
    if (latestWorld === null) {
      stale = true;
    } else {
      const stamp = backupFinishedAt(latestWorld);
      const ageMs = now - new Date(stamp).getTime();
      stale =
        Number.isFinite(ageMs) &&
        ageMs > policy.intervalMinutes * 60_000 * BACKUP_STALE_INTERVAL_FACTOR;
    }
  }

  const counts = {
    world: completed.filter((row) => row.kind === "world").length,
    players: completed.filter((row) => row.kind === "players").length,
    ini: completed.filter((row) => row.kind === "ini").length,
    failed24h: failed24h.length,
  };

  const health = computeBackupServerHealth({
    destinationOk: input.destinationOk,
    stale,
    failed24h: counts.failed24h,
    failedWorld24h: failedWorld24h.length,
    scheduleEnabled: policy.enabled,
    hasWorldBackup: latestWorld !== null,
    serverRunning: input.serverRunning,
  });

  return {
    serverId: input.serverId,
    serverName: input.serverName,
    policy,
    resolvedRoot: input.resolvedRoot,
    health,
    latest,
    latestWorld,
    counts,
    usedBytes,
    stale,
    destinationOk: input.destinationOk,
    schedulePaused: input.schedulePaused,
  };
}

export interface BuildFleetAlertsForServerInput {
  row: BackupServerHealth;
  failed24h: BackupRecord[];
  failedWorld24h: BackupRecord[];
  serverRunning: boolean;
}

export function buildFleetAlertsForServer(
  input: BuildFleetAlertsForServerInput,
): BackupFleetAlert[] {
  const { row, failed24h, failedWorld24h, serverRunning } = input;
  const alerts: BackupFleetAlert[] = [];
  const { serverId, serverName, policy, resolvedRoot, destinationOk } = row;

  if (!destinationOk) {
    alerts.push({
      id: `missing_destination:${serverId}`,
      kind: "missing_destination",
      severity: "error",
      serverId,
      volumePath: null,
      fingerprint: resolvedRoot,
      message: `${serverName}: backup destination is missing or unreachable (${resolvedRoot})`,
    });
  }
  if (row.schedulePaused && policy.enabled) {
    alerts.push({
      id: `schedule_paused:${serverId}`,
      kind: "schedule_paused",
      severity: "error",
      serverId,
      volumePath: null,
      fingerprint: "session",
      message: `${serverName}: world schedule paused for this YARK session after ${SCHEDULED_WORLD_FAIL_LIMIT} consecutive failures (restarts clear the pause; policy stays enabled)`,
    });
  }

  alerts.push(...buildFleetRunningAlerts(row, serverRunning));
  alerts.push(...buildFleetFailureAlerts(row, failed24h, failedWorld24h));
  return alerts;
}
/** Alerts that depend on server running state (never_backed_up). */
export function buildFleetRunningAlerts(
  row: BackupServerHealth,
  serverRunning: boolean,
): BackupFleetAlert[] {
  const alerts: BackupFleetAlert[] = [];
  const { serverId, serverName, policy, latestWorld, stale } = row;
  if (policy.enabled && latestWorld === null && serverRunning) {
    alerts.push({
      id: `never_backed_up:${serverId}`,
      kind: "never_backed_up",
      severity: "warning",
      serverId,
      volumePath: null,
      fingerprint: "pending",
      message: `${serverName}: world schedule is on but no completed world backup exists yet (waiting for the next scheduled cycle)`,
    });
  } else if (stale && latestWorld !== null) {
    alerts.push({
      id: `stale:${serverId}`,
      kind: "stale",
      severity: "warning",
      serverId,
      volumePath: null,
      fingerprint: `${latestWorld.id}:${backupFinishedAt(latestWorld)}`,
      message: `${serverName}: last world backup is older than the scheduled interval`,
    });
  }
  return alerts;
}

export function buildFleetFailureAlerts(
  row: BackupServerHealth,
  failed24h: BackupRecord[],
  failedWorld24h: BackupRecord[],
): BackupFleetAlert[] {
  if (row.counts.failed24h <= 0) return [];
  const { serverId, serverName } = row;
  const worldOnly = failedWorld24h.length === row.counts.failed24h;
  const focusBackup = failedWorld24h[0] ?? failed24h[0] ?? null;
  return [{
    id: `failed:${serverId}`,
    kind: "failed",
    severity: failedWorld24h.length > 0 ? "error" : "warning",
    serverId,
    volumePath: null,
    fingerprint: `${focusBackup?.id ?? "failed"}:${row.counts.failed24h}`,
    backupId: focusBackup?.id ?? null,
    message: worldOnly
      ? `${serverName}: ${row.counts.failed24h} failed world backup${row.counts.failed24h === 1 ? "" : "s"} in the last 24h`
      : failedWorld24h.length > 0
        ? `${serverName}: ${row.counts.failed24h} failed backup${row.counts.failed24h === 1 ? "" : "s"} in the last 24h (${failedWorld24h.length} world)`
        : `${serverName}: ${row.counts.failed24h} failed non-world backup${row.counts.failed24h === 1 ? "" : "s"} in the last 24h`,
  }];
}

export function buildDiskVolumeAlerts(
  disks: BackupFleetSummary["disks"],
  diskSettings: BackupDiskAlertSettings,
): BackupFleetAlert[] {
  const alerts: BackupFleetAlert[] = [];
  for (const disk of disks) {
    if (disk.usedPercent === null || disk.freeBytes === null) continue;
    const overCritical = disk.usedPercent >= diskSettings.criticalUsedPercent;
    const overWarn = disk.usedPercent >= diskSettings.warnUsedPercent;
    const lowFree = disk.freeBytes < diskSettings.warnFreeBytes;
    const diskFingerprint = [
      `u${Math.floor(disk.usedPercent)}`,
      `f${Math.floor(disk.freeBytes / (1024 ** 3))}`,
      `w${diskSettings.warnUsedPercent}`,
      `c${diskSettings.criticalUsedPercent}`,
      `fb${diskSettings.warnFreeBytes}`,
    ].join(":");
    if (overCritical) {
      alerts.push({
        id: `disk_critical:${disk.volumePath}`,
        kind: "disk_critical",
        severity: "error",
        serverId: null,
        volumePath: disk.volumePath,
        fingerprint: diskFingerprint,
        message: `${disk.volumePath} is ${disk.usedPercent.toFixed(0)}% full (critical ≥ ${diskSettings.criticalUsedPercent}%)`,
      });
    } else if (overWarn || lowFree) {
      const parts: string[] = [];
      if (overWarn) {
        parts.push(`${disk.usedPercent.toFixed(0)}% used`);
      }
      if (lowFree) {
        parts.push(`${formatBackupByteSize(disk.freeBytes)} free`);
      }
      alerts.push({
        id: `disk_warning:${disk.volumePath}`,
        kind: "disk_warning",
        severity: "warning",
        serverId: null,
        volumePath: disk.volumePath,
        fingerprint: diskFingerprint,
        message: `${disk.volumePath}: ${parts.join(" · ")} (warning threshold)`,
      });
    }
  }
  return alerts;
}

export function computeFleetSummaryStats(
  healthRows: BackupServerHealth[],
): BackupFleetSummary["stats"] {
  const protectedCount = healthRows.filter((row) => row.health === "ok").length;
  const atRiskCount = healthRows.filter(
    (row) => row.health === "warning" || row.health === "critical",
  ).length;
  const failed24h = healthRows.reduce((sum, row) => sum + row.counts.failed24h, 0);
  const totalBackupBytes = healthRows.reduce((sum, row) => sum + row.usedBytes, 0);
  return { protectedCount, atRiskCount, failed24h, totalBackupBytes };
}

export interface DismissedFleetAlertEntry {
  fingerprint: string;
  dismissedAt: string;
}

export function filterDismissedFleetAlerts(
  alerts: BackupFleetAlert[],
  dismissed: Record<string, DismissedFleetAlertEntry>,
): {
  visible: BackupFleetAlert[];
  prunedDismissed: Record<string, DismissedFleetAlertEntry>;
} {
  if (Object.keys(dismissed).length === 0) {
    return { visible: alerts, prunedDismissed: dismissed };
  }

  const kept: Record<string, DismissedFleetAlertEntry> = {};
  const visible: BackupFleetAlert[] = [];
  for (const alert of alerts) {
    const entry = dismissed[alert.id];
    if (entry !== undefined && entry.fingerprint === alert.fingerprint) {
      kept[alert.id] = entry;
      continue;
    }
    visible.push(alert);
  }
  return { visible, prunedDismissed: kept };
}

export async function buildDiskUsageFromHealthRows(
  rows: BackupServerHealth[],
): Promise<BackupFleetSummary["disks"]> {
  const byVolume = new Map<
    string,
    { roots: Set<string>; backupBytes: number; probePath: string }
  >();

  for (const row of rows) {
    const volumePath = volumeRootForPath(row.resolvedRoot);
    const current = byVolume.get(volumePath) ?? {
      roots: new Set<string>(),
      backupBytes: 0,
      probePath: row.resolvedRoot,
    };
    current.roots.add(row.resolvedRoot);
    current.backupBytes += row.usedBytes;
    byVolume.set(volumePath, current);
  }

  const disks: BackupFleetSummary["disks"] = [];
  for (const [volumePath, info] of byVolume) {
    const space = await readVolumeSpace(info.probePath);
    const freeBytes = space?.freeBytes ?? null;
    const totalBytes = space?.totalBytes ?? null;
    let usedPercent: number | null = null;
    if (freeBytes !== null && totalBytes !== null && totalBytes > 0) {
      usedPercent = ((totalBytes - freeBytes) / totalBytes) * 100;
    }
    disks.push({
      volumePath,
      roots: [...info.roots],
      backupBytes: info.backupBytes,
      freeBytes,
      totalBytes,
      usedPercent,
    });
  }

  disks.sort((a, b) => a.volumePath.localeCompare(b.volumePath));
  return disks;
}

export function listFailedBackupsSince(
  records: BackupRecord[],
  sinceIso: string,
): BackupRecord[] {
  return records.filter((row) => {
    if (row.status !== "failed") return false;
    return backupFinishedAt(row) >= sinceIso;
  });
}
