import { backupFinishedAt } from "@shared/backup-player-meta";
import { formatBackupFileStamp } from "@shared/backup-file-stamp";
import type { BackupKind, BackupRecord } from "@shared/types";

/** Safe filename fragment for Windows/macOS paths. */
export function slugFilePart(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "server";
}

export function suggestedExportFileName(
  backup: BackupRecord,
  serverName: string,
): string {
  const finished = backupFinishedAt(backup) ?? backup.id;
  const stamp = formatBackupFileStamp(finished);
  const server = slugFilePart(serverName);
  // Date stamp is the final segment so operators can scan names left→right.
  return `${server}-${backup.kind}-${stamp}.zip`;
}

export async function runBackupExport(input: {
  serverId: string;
  serverName: string;
  backup: BackupRecord;
  onError: (message: string) => void;
  onSuccess: (path: string) => void;
}): Promise<void> {
  const pick = await window.api.pickPath(
    "save",
    suggestedExportFileName(input.backup, input.serverName),
    "Export backup archive",
  );
  if (!pick.ok) {
    input.onError(pick.error ?? "Could not open save dialog");
    return;
  }
  if (pick.data === null) return;
  const result = await window.api.exportBackup(
    input.serverId,
    input.backup.id,
    pick.data,
  );
  if (!result.ok) {
    input.onError(result.error ?? "Could not export backup");
    return;
  }
  input.onSuccess(result.data);
}

export async function runBackupImport(input: {
  serverId: string;
  kind: BackupKind;
  kindLabel: string;
  onError: (message: string) => void;
  onSuccess: () => Promise<void> | void;
}): Promise<void> {
  const pick = await window.api.pickPath(
    "file",
    undefined,
    `Import ${input.kindLabel} backup ZIP`,
  );
  if (!pick.ok) {
    input.onError(pick.error ?? "Could not open file picker");
    return;
  }
  if (pick.data === null) return;
  const result = await window.api.importBackup(
    input.serverId,
    input.kind,
    pick.data,
  );
  if (!result.ok) {
    input.onError(result.error ?? "Could not import backup");
    return;
  }
  await input.onSuccess();
}
