import { formatLogDateTime } from "@shared/format-log-datetime";
import type { BackupHealthStatus } from "@shared/types";

export function formatBackupWhen(iso: string | null | undefined): string {
  return formatLogDateTime(iso);
}

export function formatBackupBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "–";
  const abs = Math.abs(bytes);
  if (abs >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (abs >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (abs >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

export function backupHealthColor(health: BackupHealthStatus): string {
  if (health === "ok") return "teal";
  if (health === "warning") return "yellow";
  if (health === "critical") return "red";
  return "gray";
}

export function backupHealthLabel(health: BackupHealthStatus): string {
  if (health === "ok") return "Protected";
  if (health === "warning") return "At risk";
  if (health === "critical") return "Critical";
  return "Unknown";
}

export function backupHealthTooltip(health: BackupHealthStatus): string {
  if (health === "ok") {
    return "This server has a completed world backup and is not overdue for its schedule.";
  }
  if (health === "warning") {
    return "Backup protection needs attention – for example the world schedule is on with no world backup yet, the last world backup is overdue, or a recent backup failed.";
  }
  if (health === "critical") {
    return "World backups cannot protect this server right now – the backup folder is missing or a world backup failed in the last 24 hours.";
  }
  return "No completed world backup yet. Either the world schedule is off, or it is on but this server is not running so a scheduled backup cannot run yet. Start the server or create a manual world backup.";
}

export type BackupHealthFilter = "all" | "at_risk" | "failed" | "protected";
