import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { HardDrives } from "@phosphor-icons/react";
import type { DataTableSortStatus } from "mantine-datatable";
import type { BackupKind, BackupRecord, BackupType } from "@shared/types";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { useRowActionMenuApi } from "@ui/RowActionMenu/RowActionMenuProvider";
import { YarkDataTable } from "@ui/YarkDataTable/YarkDataTable";
import { buildBackupHistoryRowActions } from "./backupHistoryRowActionModel";
import {
  EMPTY_BACKUP_HISTORY_META_FILTER,
  filterBackupRecordsByMeta,
  isBackupHistoryMetaFilterActive,
  type BackupHistoryMetaFilterState,
} from "./backupHistoryMetaFilter";
import { DEFAULT_BACKUP_HISTORY_SORT, sortBackupRecords } from "./backupHistorySort";
import { buildBackupHistoryTableColumns } from "./backupHistoryTableColumns";
import classes from "./BackupsPage.module.css";

export { sortBackupRecords } from "./backupHistorySort";

interface Props {
  kind: BackupKind;
  records: BackupRecord[];
  selectedIds: string[];
  busy: boolean;
  opsLocked: boolean;
  fetching: boolean;
  emptyHint: string;
  onSelectedIdsChange: (ids: string[]) => void;
  onCopyDetails: (backup: BackupRecord) => void;
  onOpenFolder: (backupId: string) => void;
  onExport: (backup: BackupRecord) => void;
  onRestore: (backup: BackupRecord) => void;
  onDelete: (backup: BackupRecord) => void;
  onProtect: (backup: BackupRecord) => void;
  onSaveProtection: (backup: BackupRecord, isProtected: boolean, operatorNote: string) => Promise<boolean>;
  formatSize: (sizeBytes: number) => string;
}

const CONTEXT_SOURCE_ID = "backup-history-table";

/**
 * Backup history as a shared YARK DataTable (selection, density, empty/loading,
 * column sort + resize). Status/Type/Map live in the File title + header filters;
 * row actions and right-click reuse the same action model.
 */
export function BackupHistoryTable(props: Props): ReactElement {
  const { openAt } = useRowActionMenuApi();
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<BackupRecord>>(DEFAULT_BACKUP_HISTORY_SORT);
  const [metaFilter, setMetaFilter] = useState<BackupHistoryMetaFilterState>(EMPTY_BACKUP_HISTORY_META_FILTER);

  const typeFilterOptions = useMemo(() => {
    const seen = new Set<BackupType>();
    const options: BackupType[] = [];
    for (const row of props.records) {
      if (seen.has(row.type)) continue;
      seen.add(row.type);
      options.push(row.type);
    }
    return options.sort((a, b) => a.localeCompare(b));
  }, [props.records]);

  const metaFilterActive = isBackupHistoryMetaFilterActive(metaFilter);

  const sortedRecords = useMemo(() => {
    const filtered = filterBackupRecordsByMeta(props.records, metaFilter);
    return sortBackupRecords(filtered, sortStatus);
  }, [props.records, metaFilter, sortStatus]);

  const selectedRecords = useMemo(
    () => sortedRecords.filter((row) => props.selectedIds.includes(row.id)),
    [sortedRecords, props.selectedIds],
  );

  const columns = useMemo(
    () =>
      buildBackupHistoryTableColumns({
        kind: props.kind,
        busy: props.busy,
        opsLocked: props.opsLocked,
        formatSize: props.formatSize,
        metaFilter,
        typeFilterOptions,
        metaFilterActive,
        onMetaFilterChange: setMetaFilter,
        onMetaFilterClear: () => setMetaFilter(EMPTY_BACKUP_HISTORY_META_FILTER),
        onCopyDetails: props.onCopyDetails,
        onOpenFolder: props.onOpenFolder,
        onExport: props.onExport,
        onRestore: props.onRestore,
        onDelete: props.onDelete,
        protectionSaving: props.busy,
        onSaveProtection: props.onSaveProtection,
      }),
    [
      props.kind,
      props.busy,
      props.opsLocked,
      props.formatSize,
      metaFilter,
      typeFilterOptions,
      metaFilterActive,
      props.onCopyDetails,
      props.onOpenFolder,
      props.onExport,
      props.onRestore,
      props.onDelete,
      props.onSaveProtection,
    ],
  );

  return (
    <YarkDataTable
      className={classes.historyTable}
      idAccessor="id"
      records={sortedRecords}
      fetching={props.fetching}
      minHeight={180}
      storeColumnsKey={`yark-backup-history-v8-${props.kind}`}
      sortStatus={sortStatus}
      onSortStatusChange={setSortStatus}
      selectedRecords={selectedRecords}
      onSelectedRecordsChange={(rows) => {
        // Keep selections that are hidden by Status/Type filters; only replace visible ids.
        const visibleIds = new Set(sortedRecords.map((row) => row.id));
        const hiddenSelected = props.selectedIds.filter((id) => !visibleIds.has(id));
        props.onSelectedIdsChange([...hiddenSelected, ...rows.map((row) => row.id)]);
      }}
      isRecordSelectable={(record) => record.status !== "running" && !props.busy}
      selectionCheckboxProps={{ size: "xs" }}
      getRecordSelectionCheckboxProps={(record) => ({
        "aria-label": `Select backup ${record.id}`,
        disabled: record.status === "running" || props.busy,
      })}
      allRecordsSelectionCheckboxProps={{
        "aria-label": "Select all backups",
        disabled: props.busy,
      }}
      customRowAttributes={(record) => ({
        "data-backup-row": true,
        "data-backup-id": record.id,
        ...(record.diskMissing ? { "data-backup-disk-missing": "true" } : {}),
      })}
      onRowContextMenu={({ record, event }) => {
        if (props.busy) return;
        const entries = buildBackupHistoryRowActions({
          backup: record,
          busy: props.busy,
          opsLocked: props.opsLocked,
          onCopyDetails: props.onCopyDetails,
          onOpenFolder: props.onOpenFolder,
          onExport: props.onExport,
          onRestore: props.onRestore,
          onDelete: props.onDelete,
          onProtect: props.onProtect,
        });
        event.preventDefault();
        event.stopPropagation();
        openAt(CONTEXT_SOURCE_ID, entries, event.clientX, event.clientY);
      }}
      emptyState={
        <div className={classes.listEmpty} data-backup-list-empty>
          <EmptyState
            icon={<HardDrives size={22} />}
            title={metaFilterActive ? "No matching backups" : "No backups"}
            description={
              metaFilterActive ? "Clear the File column filters to see backups for this kind again." : props.emptyHint
            }
          />
        </div>
      }
      columns={columns}
    />
  );
}
