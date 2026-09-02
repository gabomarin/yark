import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { HardDrives } from "@phosphor-icons/react";
import type { DataTableSortStatus } from "mantine-datatable";
import type { BackupKind, BackupRecord } from "@shared/types";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { useRowActionMenuApi } from "@ui/RowActionMenu/RowActionMenuProvider";
import { YarkDataTable } from "@ui/YarkDataTable/YarkDataTable";
import { buildBackupHistoryRowActions } from "./backupHistoryRowActionModel";
import {
  DEFAULT_BACKUP_HISTORY_SORT,
  sortBackupRecords,
} from "./backupHistorySort";
import { buildBackupHistoryTableColumns } from "./backupHistoryTableColumns";
import classes from "./BackupsPage.module.css";

export { sortBackupRecords } from "./backupHistorySort";

interface Props {
  /** Active history tab — Map column only for world. */
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
  formatSize: (sizeBytes: number) => string;
}

const CONTEXT_SOURCE_ID = "backup-history-table";

/**
 * Backup history as a shared YARK DataTable (selection, density, empty/loading,
 * column sort + resize). Row actions and right-click context menu reuse the
 * existing action model.
 */
export function BackupHistoryTable(props: Props): ReactElement {
  const { openAt } = useRowActionMenuApi();
  const [sortStatus, setSortStatus] =
    useState<DataTableSortStatus<BackupRecord>>(DEFAULT_BACKUP_HISTORY_SORT);
  const showMapColumn = props.kind === "world";

  const sortedRecords = useMemo(() => {
    // Drop map sort when leaving the world tab so we do not sort on a hidden column.
    const status =
      !showMapColumn && String(sortStatus.columnAccessor) === "mapToken"
        ? DEFAULT_BACKUP_HISTORY_SORT
        : sortStatus;
    return sortBackupRecords(props.records, status);
  }, [props.records, sortStatus, showMapColumn]);

  const selectedRecords = useMemo(
    () => sortedRecords.filter((row) => props.selectedIds.includes(row.id)),
    [sortedRecords, props.selectedIds],
  );

  const columns = useMemo(
    () =>
      buildBackupHistoryTableColumns({
        kind: props.kind,
        showMapColumn,
        busy: props.busy,
        opsLocked: props.opsLocked,
        formatSize: props.formatSize,
        onCopyDetails: props.onCopyDetails,
        onOpenFolder: props.onOpenFolder,
        onExport: props.onExport,
        onRestore: props.onRestore,
        onDelete: props.onDelete,
      }),
    [
      showMapColumn,
      props.kind,
      props.busy,
      props.opsLocked,
      props.formatSize,
      props.onCopyDetails,
      props.onOpenFolder,
      props.onExport,
      props.onRestore,
      props.onDelete,
    ],
  );

  return (
    <YarkDataTable
      className={classes.historyTable}
      idAccessor="id"
      records={sortedRecords}
      fetching={props.fetching}
      minHeight={180}
      storeColumnsKey={`yark-backup-history-v6-${props.kind}`}
      sortStatus={
        !showMapColumn && String(sortStatus.columnAccessor) === "mapToken"
          ? DEFAULT_BACKUP_HISTORY_SORT
          : sortStatus
      }
      onSortStatusChange={setSortStatus}
      selectedRecords={selectedRecords}
      onSelectedRecordsChange={(rows) => {
        props.onSelectedIdsChange(rows.map((row) => row.id));
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
        });
        event.preventDefault();
        event.stopPropagation();
        openAt(CONTEXT_SOURCE_ID, entries, event.clientX, event.clientY);
      }}
      emptyState={
        <div className={classes.listEmpty} data-backup-list-empty>
          <EmptyState
            icon={<HardDrives size={22} />}
            title="No backups"
            description={props.emptyHint}
          />
        </div>
      }
      columns={columns}
    />
  );
}
