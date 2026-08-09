import type { ReactElement } from "react";
import { Badge, Checkbox, Group, Text, Tooltip } from "@mantine/core";
import { backupFinishedAt, playerBackupDisplayName } from "@shared/backup-player-meta";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type { BackupRecord } from "@shared/types";
import { useRowContextMenu } from "@ui/RowActionMenu/useRowContextMenu";
import { BackupHistoryRowActions } from "./BackupHistoryRowActions";
import { buildBackupHistoryRowActions } from "./backupHistoryRowActionModel";
import classes from "./BackupsPage.module.css";

interface Props {
  backup: BackupRecord;
  busy: boolean;
  opsLocked: boolean;
  selected: boolean;
  onToggleSelected: () => void;
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

export function BackupHistoryRow(props: Props): ReactElement {
  const { backup } = props;
  const canSelect = backup.status !== "running";
  const isPlayers = backup.kind === "players";
  const finishedAt = backupFinishedAt(backup);
  const relative = props.formatRelativeTime(finishedAt);
  const absolute = formatLogDateTime(finishedAt, { fallback: finishedAt });
  const displayTitle = isPlayers ? playerBackupDisplayName(backup) : relative;
  const hasNotes = backup.notes !== null && backup.notes.length > 0;
  const fileName = archiveFileName(backup.path);

  const actionInput = {
    backup,
    busy: props.busy,
    opsLocked: props.opsLocked,
    onCopyDetails: props.onCopyDetails,
    onOpenFolder: props.onOpenFolder,
    onExport: props.onExport,
    onRestore: props.onRestore,
    onDelete: props.onDelete,
  };
  const menuEntries = buildBackupHistoryRowActions(actionInput);
  const onContextMenu = useRowContextMenu(menuEntries, { disabled: props.busy });

  return (
    <div
      className={classes.backupRow}
      data-backup-row
      data-backup-id={backup.id}
      onContextMenu={onContextMenu}
    >
      <Checkbox
        checked={props.selected}
        disabled={!canSelect || props.busy}
        onChange={props.onToggleSelected}
        aria-label={`Select backup ${backup.id}`}
        className={classes.backupCheck}
        size="xs"
      />
      <div className={classes.backupMeta}>
        <Group gap={6} wrap="nowrap" className={classes.backupPrimary}>
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
          <Text size="xs" c="dimmed" className={classes.backupMetaInline}>
            {isPlayers ? relative : null}
            {isPlayers ? " · " : null}
            {props.formatSize(backup.sizeBytes)}
          </Text>
          <Badge size="xs" color={statusColor(backup.status)} variant="light">
            {backup.status}
          </Badge>
          <Badge size="xs" variant="outline" color="gray">
            {backup.type}
          </Badge>
        </Group>
        <Text
          size="xs"
          c="dimmed"
          className={classes.backupFileName}
          title={backup.path}
          data-backup-filename
        >
          {fileName}
        </Text>
        {hasNotes && (
          <Text
            size="xs"
            c="dimmed"
            className={classes.backupNotes}
            title={backup.notes ?? undefined}
          >
            {backup.notes}
          </Text>
        )}
      </div>
      <div className={classes.backupActions}>
        <BackupHistoryRowActions {...actionInput} />
      </div>
    </div>
  );
}
