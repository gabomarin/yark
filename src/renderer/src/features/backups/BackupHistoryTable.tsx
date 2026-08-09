import type { ReactElement } from "react";
import { useMemo } from "react";
import { Badge, Stack, Text, Tooltip } from "@mantine/core";
import { HardDrives } from "@phosphor-icons/react";
import { backupFinishedAt, playerBackupDisplayName } from "@shared/backup-player-meta";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type { BackupRecord } from "@shared/types";
import { EmptyState } from "@ui/EmptyState/EmptyState";
import { useRowActionMenuApi } from "@ui/RowActionMenu/RowActionMenuProvider";
import { YarkDataTable } from "@ui/YarkDataTable/YarkDataTable";
import { BackupHistoryRowActions } from "./BackupHistoryRowActions";
import { buildBackupHistoryRowActions } from "./backupHistoryRowActionModel";
import classes from "./BackupsPage.module.css";

interface Props {
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
  formatRelativeTime: (iso: string) => string;
}

function archiveFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const name = parts[parts.length - 1] ?? "";
  return name.length > 0 ? name : path;
}

function statusColor(status: BackupRecord["status"]): string {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  return "yellow";
}

const CONTEXT_SOURCE_ID = "backup-history-table";

/**
 * Backup history as a shared YARK DataTable (selection, density, empty/loading).
 * Row actions and right-click context menu reuse the existing action model.
 */
export function BackupHistoryTable(props: Props): ReactElement {
  const { openAt } = useRowActionMenuApi();

  const selectedRecords = useMemo(
    () => props.records.filter((row) => props.selectedIds.includes(row.id)),
    [props.records, props.selectedIds],
  );

  return (
    <YarkDataTable
      className={classes.historyTable}
      idAccessor="id"
      records={props.records}
      fetching={props.fetching}
      minHeight={180}
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
      columns={[
        {
          accessor: "when",
          title: "When",
          width: "28%",
          render: (backup) => {
            const isPlayers = backup.kind === "players";
            const finishedAt = backupFinishedAt(backup);
            const relative = props.formatRelativeTime(finishedAt);
            const absolute = formatLogDateTime(finishedAt, { fallback: finishedAt });
            const displayTitle = isPlayers ? playerBackupDisplayName(backup) : relative;
            return (
              <Stack gap={2}>
                <Tooltip label={absolute} withArrow>
                  <Text
                    fw={600}
                    size="sm"
                    data-backup-title
                    className={classes.backupTitle}
                    title={isPlayers ? absolute : undefined}
                  >
                    {displayTitle}
                  </Text>
                </Tooltip>
                {isPlayers ? (
                  <Text size="xs" c="dimmed">
                    {relative}
                  </Text>
                ) : null}
              </Stack>
            );
          },
        },
        {
          accessor: "sizeBytes",
          title: "Size",
          width: 88,
          render: (backup) => (
            <Text size="xs" c="dimmed">
              {props.formatSize(backup.sizeBytes)}
            </Text>
          ),
        },
        {
          accessor: "status",
          title: "Status",
          width: 110,
          render: (backup) => (
            <Badge size="xs" color={statusColor(backup.status)} variant="light">
              {backup.status}
            </Badge>
          ),
        },
        {
          accessor: "type",
          title: "Type",
          width: 110,
          render: (backup) => (
            <Badge size="xs" variant="outline" color="gray">
              {backup.type}
            </Badge>
          ),
        },
        {
          accessor: "path",
          title: "File",
          render: (backup) => (
            <Stack gap={2}>
              <Text
                size="xs"
                c="dimmed"
                className={classes.backupFileName}
                title={backup.path}
                data-backup-filename
              >
                {archiveFileName(backup.path)}
              </Text>
              {backup.notes !== null && backup.notes.length > 0 ? (
                <Text
                  size="xs"
                  c="dimmed"
                  className={classes.backupNotes}
                  title={backup.notes}
                >
                  {backup.notes}
                </Text>
              ) : null}
            </Stack>
          ),
        },
        {
          accessor: "actions",
          title: "Actions",
          width: 168,
          textAlign: "right",
          render: (backup) => (
            <div className={classes.backupActions}>
              <BackupHistoryRowActions
                backup={backup}
                busy={props.busy}
                opsLocked={props.opsLocked}
                onCopyDetails={props.onCopyDetails}
                onOpenFolder={props.onOpenFolder}
                onExport={props.onExport}
                onRestore={props.onRestore}
                onDelete={props.onDelete}
              />
            </div>
          ),
        },
      ]}
    />
  );
}
