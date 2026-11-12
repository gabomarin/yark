import type { BackupRecord, BackupStatus, BackupType } from "@shared/types";

/** Status filter values; `missing` is derived from `diskMissing` (status stays completed). */
export type BackupHistoryStatusFilter = BackupStatus | "missing";

export type BackupHistoryMetaFilterState = {
  statuses: BackupHistoryStatusFilter[];
  types: BackupType[];
};

export const EMPTY_BACKUP_HISTORY_META_FILTER: BackupHistoryMetaFilterState = {
  statuses: [],
  types: [],
};

export function isBackupHistoryMetaFilterActive(filter: BackupHistoryMetaFilterState): boolean {
  return filter.statuses.length > 0 || filter.types.length > 0;
}

function matchesStatusFilter(row: BackupRecord, statuses: BackupHistoryStatusFilter[]): boolean {
  if (statuses.length === 0) return true;
  const selected = new Set(statuses);
  if (row.diskMissing) return selected.has("missing");
  return selected.has(row.status);
}

/** Apply Status / Type header filters (empty selection = all). */
export function filterBackupRecordsByMeta(
  records: BackupRecord[],
  filter: BackupHistoryMetaFilterState,
): BackupRecord[] {
  if (!isBackupHistoryMetaFilterActive(filter)) return records;
  const types = new Set(filter.types);
  return records.filter((row) => {
    if (!matchesStatusFilter(row, filter.statuses)) return false;
    if (types.size > 0 && !types.has(row.type)) return false;
    return true;
  });
}

export function backupHistoryStatusTone(status: BackupRecord["status"], diskMissing = false): "ok" | "warn" | "danger" {
  if (diskMissing) return "warn";
  if (status === "completed") return "ok";
  if (status === "failed") return "danger";
  return "warn";
}
