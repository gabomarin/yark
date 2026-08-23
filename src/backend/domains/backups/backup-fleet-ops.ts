/**
 * Fleet summary, disk-alert settings, and dismissed-alert persistence for BackupService.
 */

import type {
  BackupDiskAlertSettings,
  BackupFleetAlert,
  BackupFleetSummary,
  BackupServerHealth,
} from "@shared/types";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";
import { isBackupDestinationReachable } from "./backup-disk";
import { resolveServerBackupRoot } from "./backup-create-pipeline";
import {
  buildBackupServerHealthRow,
  buildDiskUsageFromHealthRows,
  buildDiskVolumeAlerts,
  buildFleetAlertsForServer,
  computeFleetSummaryStats,
  filterDismissedFleetAlerts,
  listFailedBackupsSince,
  normalizeDiskAlertSettings,
  type DismissedFleetAlertEntry,
} from "./backup-fleet";

const DISK_ALERT_SETTINGS_KEY = "backupDiskAlerts.v1";
const DEFAULT_DISK_ALERT_SETTINGS: BackupDiskAlertSettings = {
  warnUsedPercent: 85,
  criticalUsedPercent: 95,
  warnFreeBytes: 20 * 1024 * 1024 * 1024,
};
/** Dismissed fleet alerts: alertId → fingerprint that was hidden. */
const DISMISSED_FLEET_ALERTS_KEY = "backupFleetAlerts.dismissed.v1";

export interface BackupFleetOpsHost {
  servers: ServerRepository;
  backups: BackupRepository;
  processes: ProcessManager;
  settings: AppSettingsRepository;
  scheduledWorldPaused: Set<string>;
  reconcileDiskBackups: (serverId: string) => Promise<number>;
}

export class BackupFleetOps {
  constructor(private readonly host: BackupFleetOpsHost) {}

  getDiskAlertSettings(): BackupDiskAlertSettings {
    return this.readDiskAlertSettings();
  }

  setDiskAlertSettings(settings: BackupDiskAlertSettings): BackupDiskAlertSettings {
    const next = normalizeDiskAlertSettings(settings);
    this.host.settings.set(DISK_ALERT_SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  /**
   * Hide a fleet alert until its fingerprint changes (new failure, recovered then
   * re-failed, disk usage moved, etc.).
   */
  dismissFleetAlert(alertId: string, fingerprint: string): void {
    const id = alertId.trim();
    const fp = fingerprint.trim();
    if (id.length === 0 || fp.length === 0) {
      throw new Error("Alert id and fingerprint are required");
    }
    const map = this.readDismissedFleetAlerts();
    map[id] = { fingerprint: fp, dismissedAt: new Date().toISOString() };
    this.writeDismissedFleetAlerts(map);
  }

  /** Fleet health overview: per-server status, disk usage, and actionable alerts. */
  async getFleetSummary(): Promise<BackupFleetSummary> {
    const servers = this.host.servers.list();
    const diskSettings = this.readDiskAlertSettings();
    const now = Date.now();
    const dayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    const healthRows: BackupServerHealth[] = [];
    const alerts: BackupFleetAlert[] = [];

    for (const server of servers) {
      await this.host.reconcileDiskBackups(server.id);
      const policy = this.host.backups.getPolicy(server.id);
      const resolvedRoot = resolveServerBackupRoot(server.installDir, policy.backupDir);
      const records = this.host.backups.listBackups(server.id, 10_000);
      const serverRunning = this.host.processes.isActive(server.id);
      const latestWorld = this.host.backups.latestCompleted(server.id, "world");
      const failed24h = listFailedBackupsSince(records, dayAgoIso);
      const failedWorld24h = failed24h.filter((row) => row.kind === "world");

      const row = buildBackupServerHealthRow({
        serverId: server.id,
        serverName: server.name,
        policy,
        resolvedRoot,
        records,
        latestWorld,
        destinationOk: isBackupDestinationReachable(resolvedRoot),
        serverRunning,
        schedulePaused: this.host.scheduledWorldPaused.has(server.id),
        nowMs: now,
      });
      healthRows.push(row);
      alerts.push(
        ...buildFleetAlertsForServer({
          row,
          failed24h,
          failedWorld24h,
          serverRunning,
        }),
      );
    }

    const disks = await buildDiskUsageFromHealthRows(healthRows);
    alerts.push(...buildDiskVolumeAlerts(disks, diskSettings));

    const visibleAlerts = this.applyDismissedFleetAlerts(alerts);

    return {
      servers: healthRows,
      stats: computeFleetSummaryStats(healthRows),
      disks,
      alerts: visibleAlerts,
      diskSettings,
    };
  }

  private readDiskAlertSettings(): BackupDiskAlertSettings {
    const raw = this.host.settings.get(DISK_ALERT_SETTINGS_KEY);
    if (raw === null || raw.trim().length === 0) {
      return { ...DEFAULT_DISK_ALERT_SETTINGS };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<BackupDiskAlertSettings>;
      return normalizeDiskAlertSettings({
        warnUsedPercent:
          typeof parsed.warnUsedPercent === "number"
            ? parsed.warnUsedPercent
            : DEFAULT_DISK_ALERT_SETTINGS.warnUsedPercent,
        criticalUsedPercent:
          typeof parsed.criticalUsedPercent === "number"
            ? parsed.criticalUsedPercent
            : DEFAULT_DISK_ALERT_SETTINGS.criticalUsedPercent,
        warnFreeBytes:
          typeof parsed.warnFreeBytes === "number"
            ? parsed.warnFreeBytes
            : DEFAULT_DISK_ALERT_SETTINGS.warnFreeBytes,
      });
    } catch {
      return { ...DEFAULT_DISK_ALERT_SETTINGS };
    }
  }

  private readDismissedFleetAlerts(): Record<string, DismissedFleetAlertEntry> {
    const raw = this.host.settings.get(DISMISSED_FLEET_ALERTS_KEY);
    if (raw === null || raw.trim().length === 0) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, Partial<DismissedFleetAlertEntry>>;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      const out: Record<string, DismissedFleetAlertEntry> = {};
      for (const [id, entry] of Object.entries(parsed)) {
        if (
          typeof id === "string" &&
          id.length > 0 &&
          entry !== null &&
          typeof entry === "object" &&
          typeof entry.fingerprint === "string" &&
          entry.fingerprint.trim().length > 0
        ) {
          out[id] = {
            fingerprint: entry.fingerprint.trim(),
            dismissedAt:
              typeof entry.dismissedAt === "string" && entry.dismissedAt.length > 0
                ? entry.dismissedAt
                : new Date(0).toISOString(),
          };
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  private writeDismissedFleetAlerts(
    map: Record<string, DismissedFleetAlertEntry>,
  ): void {
    this.host.settings.set(DISMISSED_FLEET_ALERTS_KEY, JSON.stringify(map));
  }

  /** Drop alerts whose current fingerprint was dismissed; prune stale dismiss rows. */
  private applyDismissedFleetAlerts(alerts: BackupFleetAlert[]): BackupFleetAlert[] {
    const dismissed = this.readDismissedFleetAlerts();
    const { visible, prunedDismissed } = filterDismissedFleetAlerts(alerts, dismissed);
    const prevKeys = Object.keys(dismissed).sort().join("\0");
    const nextKeys = Object.keys(prunedDismissed).sort().join("\0");
    if (prevKeys !== nextKeys) {
      this.writeDismissedFleetAlerts(prunedDismissed);
    }
    return visible;
  }
}
