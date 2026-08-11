import type { BackupRecord } from "@shared/types";

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
    ...(backup.kind === "world"
      ? [`Map: ${backup.mapToken ?? "(unknown)"}`]
      : []),
    `Status: ${backup.status}`,
    `Created: ${backup.createdAt}`,
    `Finished: ${backup.completedAt ?? "(not finished)"}`,
    `Size bytes: ${backup.sizeBytes}`,
    `Path: ${backup.path}`,
    `Notes: ${backup.notes ?? "(none)"}`,
  ];
  return `${lines.join("\n")}\n`;
}
