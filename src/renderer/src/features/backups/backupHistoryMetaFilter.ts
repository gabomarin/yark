import type { BackupRecord, BackupStatus, BackupType } from "@shared/types";

export type BackupHistoryMetaFilterState = {
  statuses: BackupStatus[];
  types: BackupType[];
};

export const EMPTY_BACKUP_HISTORY_META_FILTER: BackupHistoryMetaFilterState = {
  statuses: [],
  types: [],
};

export function isBackupHistoryMetaFilterActive(filter: BackupHistoryMetaFilterState): boolean {
  return filter.statuses.length > 0 || filter.types.length > 0;
}

/** Apply Status / Type header filters (empty selection = all). */
export function filterBackupRecordsByMeta(
  records: BackupRecord[],
  filter: BackupHistoryMetaFilterState,
): BackupRecord[] {
  if (!isBackupHistoryMetaFilterActive(filter)) return records;
  return records.filter((row) => {
    if (filter.statuses.length > 0 && !filter.statuses.includes(row.status)) return false;
    if (filter.types.length > 0 && !filter.types.includes(row.type)) return false;
    return true;
  });
}

export function backupHistoryStatusTone(
  status: BackupRecord["status"],
  diskMissing = false,
): "ok" | "warn" | "danger" {
  if (diskMissing) return "warn";
  if (status === "completed") return "ok";
  if (status === "failed") return "danger";
  return "warn";
}
