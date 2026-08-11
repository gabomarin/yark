import { Badge, Stack, Text, Tooltip } from "@mantine/core";
import type { DataTableColumn } from "mantine-datatable";
import { backupFinishedAt, parsePlayerKeyFromNotes, playerBackupDisplayName } from "@shared/backup-player-meta";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type { BackupKind, BackupRecord } from "@shared/types";
import { BackupHistoryRowActions } from "./BackupHistoryRowActions";
import { archiveFileName } from "./backupHistorySort";
import classes from "./BackupsPage.module.css";

function statusColor(status: BackupRecord["status"]): string {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  return "yellow";
}

export interface BackupHistoryColumnInput {
  kind: BackupKind;
  showMapColumn: boolean;
  busy: boolean;
  opsLocked: boolean;
  formatSize: (sizeBytes: number) => string;
  formatRelativeTime: (iso: string) => string;
  onCopyDetails: (backup: BackupRecord) => void;
  onOpenFolder: (backupId: string) => void;
  onExport: (backup: BackupRecord) => void;
  onRestore: (backup: BackupRecord) => void;
  onDelete: (backup: BackupRecord) => void;
}

/**
 * Content-sized columns use `width: "0%"` (+ noWrap) so cells hug content.
 * Actions uses `width: "100%"` to absorb leftover space (icons stay right).
 */
export function buildBackupHistoryTableColumns(
  input: BackupHistoryColumnInput,
): DataTableColumn<BackupRecord>[] {
  const isPlayersTab = input.kind === "players";
  const shrink = { width: "0%" as const, noWrap: true as const };

  const mapColumn: DataTableColumn<BackupRecord>[] = input.showMapColumn
    ? [
        {
          accessor: "mapToken",
          title: "Map",
          width: 150,
          noWrap: true,
          sortable: true,
          resizable: true,
          render: (backup) =>
            backup.mapToken !== null ? (
              <Badge size="xs" variant="light" color="blue" data-backup-map-token>
                {backup.mapToken}
              </Badge>
            ) : (
              <Text size="xs" c="dimmed">
                —
              </Text>
            ),
        },
      ]
    : [];

  return [
    {
      accessor: "path",
      title: isPlayersTab ? "Player" : "File",
      width: "0%",
      ellipsis: true,
      sortable: true,
      resizable: true,
      render: (backup) => {
        if (isPlayersTab) {
          const name = playerBackupDisplayName(backup);
          const playerId = parsePlayerKeyFromNotes(backup.notes);
          return (
            <Stack gap={2}>
              <Text
                fw={600}
                size="sm"
                className={classes.backupTitle}
                data-backup-title
                data-backup-player-name
                title={backup.path}
              >
                {name}
              </Text>
              <Text
                size="xs"
                c="dimmed"
                className={classes.backupNotes}
                data-backup-player-id
                title={playerId ?? undefined}
              >
                {playerId ?? "—"}
              </Text>
            </Stack>
          );
        }
        return (
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
        );
      },
    },
    ...mapColumn,
    {
      accessor: "when",
      title: "Date",
      ...shrink,
      sortable: true,
      resizable: true,
      render: (backup) => {
        const finishedAt = backupFinishedAt(backup);
        const relative = input.formatRelativeTime(finishedAt);
        const absolute = formatLogDateTime(finishedAt, { fallback: finishedAt });
        return (
          <Tooltip label={absolute} withArrow>
            <Text
              fw={600}
              size="sm"
              data-backup-date
              {...(!isPlayersTab ? { "data-backup-title": true } : {})}
              className={classes.backupTitle}
            >
              {relative}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      accessor: "sizeBytes",
      title: "Size",
      ...shrink,
      sortable: true,
      resizable: true,
      render: (backup) => (
        <Text size="xs" c="dimmed">
          {input.formatSize(backup.sizeBytes)}
        </Text>
      ),
    },
    {
      accessor: "status",
      title: "Status",
      width: 110,
      noWrap: true,
      sortable: true,
      resizable: true,
      render: (backup) => (
        <Badge size="xs" color={statusColor(backup.status)} variant="light">
          {backup.status}
        </Badge>
      ),
    },
    {
      accessor: "type",
      title: "Type",
      width: 140,
      noWrap: true,
      sortable: true,
      resizable: true,
      render: (backup) => (
        <Badge size="xs" variant="outline" color="gray">
          {backup.type}
        </Badge>
      ),
    },
    {
      accessor: "actions",
      title: "Actions",
      width: "100%",
      textAlign: "right",
      render: (backup) => (
        <div className={classes.backupActions}>
          <BackupHistoryRowActions
            backup={backup}
            busy={input.busy}
            opsLocked={input.opsLocked}
            onCopyDetails={input.onCopyDetails}
            onOpenFolder={input.onOpenFolder}
            onExport={input.onExport}
            onRestore={input.onRestore}
            onDelete={input.onDelete}
          />
        </div>
      ),
    },
  ];
}
