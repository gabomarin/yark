import type { DataTableSortStatus } from "mantine-datatable";
import { backupFinishedAt, playerBackupDisplayName } from "@shared/backup-player-meta";
import type { BackupRecord } from "@shared/types";

export function archiveFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const name = parts[parts.length - 1] ?? "";
  return name.length > 0 ? name : path;
}

export const DEFAULT_BACKUP_HISTORY_SORT: DataTableSortStatus<BackupRecord> = {
  columnAccessor: "when",
  direction: "desc",
};

function compareFinishedAt(a: BackupRecord, b: BackupRecord): number {
  return Date.parse(backupFinishedAt(a)) - Date.parse(backupFinishedAt(b));
}

/** Client-side column sort for backup history (newest Date first by default). */
export function sortBackupRecords(
  records: BackupRecord[],
  status: DataTableSortStatus<BackupRecord>,
): BackupRecord[] {
  const dir = status.direction === "asc" ? 1 : -1;
  const accessor = String(status.columnAccessor);
  const next = [...records];
  next.sort((a, b) => {
    let cmp = 0;
    switch (accessor) {
      case "path":
        // Players tab: first column is Player (name), not archive filename.
        if (a.kind === "players" || b.kind === "players") {
          cmp = playerBackupDisplayName(a).localeCompare(
            playerBackupDisplayName(b),
            undefined,
            { sensitivity: "base" },
          );
        } else {
          cmp = archiveFileName(a.path).localeCompare(archiveFileName(b.path));
        }
        break;
      case "mapToken":
        cmp = (a.mapToken ?? "\uffff").localeCompare(b.mapToken ?? "\uffff");
        break;
      case "when":
        cmp = compareFinishedAt(a, b);
        break;
      case "sizeBytes":
        cmp = a.sizeBytes - b.sizeBytes;
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "type":
        cmp = a.type.localeCompare(b.type);
        break;
      default:
        cmp = 0;
    }
    if (cmp !== 0) return cmp * dir;
    const byTime = compareFinishedAt(b, a);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
  return next;
}
