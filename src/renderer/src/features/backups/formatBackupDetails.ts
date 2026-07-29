import type { BackupRecord } from "@shared/types";
import { backupFinishedAt } from "@shared/backup-player-meta";

export interface BackupDetailsServer {
  id: string;
  name: string;
}

/** Plain-text diagnostic blob for clipboard / support reports. */
export function formatBackupDetails(
  server: BackupDetailsServer,
  backup: BackupRecord,
): string {
  const lines = [
    `Server: ${server.name} (${server.id})`,
    `Backup ID: ${backup.id}`,
    `Type: ${backup.type}`,
    `Kind: ${backup.kind}`,
    `Status: ${backup.status}`,
    `Created: ${backup.createdAt}`,
    `Finished: ${backupFinishedAt(backup)}`,
    `Size bytes: ${backup.sizeBytes}`,
    `Path: ${backup.path}`,
    `Notes: ${backup.notes ?? "(none)"}`,
  ];
  return `${lines.join("\n")}\n`;
}
