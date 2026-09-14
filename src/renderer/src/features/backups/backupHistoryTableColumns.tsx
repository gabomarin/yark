import { Stack, Text, Tooltip } from "@mantine/core";
import { StatusWord } from "@ui/StatusWord/StatusWord";
import type { DataTableColumn } from "mantine-datatable";
import { backupFinishedAt, parsePlayerKeyFromNotes, playerBackupDisplayName } from "@shared/backup-player-meta";
import { formatMapDisplayName } from "@shared/map-identity";
import type { BackupKind, BackupRecord } from "@shared/types";
import { BackupHistoryRowActions } from "./BackupHistoryRowActions";
import { archiveFileName } from "./backupHistorySort";
import {
  formatBackupHistoryTitle,
  formatBackupTypeLabel,
  formatBackupWhenLabel,
} from "./model/serverBackupPanelModel";
import classes from "./BackupsPage.module.css";

function statusTone(
  status: BackupRecord["status"],
): "ok" | "warn" | "danger" {
  if (status === "completed") return "ok";
  if (status === "failed") return "danger";
  return "warn";
}

export interface BackupHistoryColumnInput {
  kind: BackupKind;
  showMapColumn: boolean;
  busy: boolean;
  opsLocked: boolean;
  formatSize: (sizeBytes: number) => string;
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
              <Tooltip label={backup.mapToken} withArrow>
                <Text size="xs" fw={600} data-backup-map-token title={backup.mapToken}>
                  {formatMapDisplayName(backup.mapToken)}
                </Text>
              </Tooltip>
            ) : (
              <Text size="xs" c="dimmed">
                –
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
                {playerId ?? "–"}
              </Text>
            </Stack>
          );
        }
        return (
          <Stack gap={2}>
            <Text
              fw={600}
              size="sm"
              className={classes.backupTitle}
              title={backup.path}
              data-backup-title
            >
              {formatBackupHistoryTitle(backup)}
            </Text>
            <Text
              size="xs"
              c="dimmed"
              className={classes.backupFileName}
              title={backup.path}
              data-backup-filename
            >
              {archiveFileName(backup.path)}
            </Text>
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
        const { primary, tooltip } = formatBackupWhenLabel(finishedAt);
        return (
          <Tooltip label={tooltip} withArrow>
            <Text
              fw={600}
              size="sm"
              data-backup-date
              className={classes.backupTitle}
            >
              {primary}
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
        <StatusWord tone={statusTone(backup.status)}>
          {backup.status}
        </StatusWord>
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
        <Text size="xs" c="dimmed">
          {formatBackupTypeLabel(backup.type)}
        </Text>
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
