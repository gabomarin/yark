import type { ReactNode } from "react";
import { Group, Stack, Text, Tooltip } from "@mantine/core";
import { StatusWord } from "@ui/StatusWord/StatusWord";
import type { DataTableColumn } from "mantine-datatable";
import { backupFinishedAt, parsePlayerKeyFromNotes, playerBackupDisplayName } from "@shared/backups/backup-player-meta";
import type { BackupKind, BackupRecord, BackupType } from "@shared/types";
import { BackupHistoryRowActions } from "./BackupHistoryRowActions";
import { archiveFileName } from "./backupHistorySort";
import { backupHistoryStatusTone, type BackupHistoryMetaFilterState } from "./backupHistoryMetaFilter";
import { BackupHistoryMetaFilter } from "./components/BackupHistoryMetaFilter/BackupHistoryMetaFilter";
import { formatBackupHistoryTitle, formatBackupTypeLabel, formatBackupWhenLabel } from "./model/serverBackupPanelModel";
import classes from "./BackupsPage.module.css";

/** Fixed Actions width (~6 icon buttons) so empty filtered lists do not reflow columns. */
const BACKUP_HISTORY_ACTIONS_COLUMN_WIDTH = 220;
const BACKUP_HISTORY_DATE_COLUMN_WIDTH = 120;
const BACKUP_HISTORY_SIZE_COLUMN_WIDTH = 72;

export interface BackupHistoryColumnInput {
  kind: BackupKind;
  busy: boolean;
  opsLocked: boolean;
  protectionSaving: boolean;
  formatSize: (sizeBytes: number) => string;
  metaFilter: BackupHistoryMetaFilterState;
  typeFilterOptions: BackupType[];
  metaFilterActive: boolean;
  onMetaFilterChange: (next: BackupHistoryMetaFilterState) => void;
  onMetaFilterClear: () => void;
  onCopyDetails: (backup: BackupRecord) => void;
  onOpenFolder: (backupId: string) => void;
  onExport: (backup: BackupRecord) => void;
  onRestore: (backup: BackupRecord) => void;
  onDelete: (backup: BackupRecord) => void;
  onSaveProtection: (backup: BackupRecord, isProtected: boolean, operatorNote: string) => Promise<boolean>;
}

function titleTooltip(backup: BackupRecord, isPlayersTab: boolean): string {
  const status = backup.diskMissing ? "missing on disk" : backup.status;
  const typeLabel = formatBackupTypeLabel(backup.type);
  if (isPlayersTab) {
    return `${status} · ${typeLabel}`;
  }
  return `${status} · ${formatBackupHistoryTitle(backup)}`;
}

function renderTitleRow(backup: BackupRecord, isPlayersTab: boolean): ReactNode {
  const tone = backupHistoryStatusTone(backup.status, backup.diskMissing);
  const tooltip = titleTooltip(backup, isPlayersTab);
  const label = isPlayersTab ? playerBackupDisplayName(backup) : formatBackupHistoryTitle(backup);
  const statusLabel = backup.diskMissing ? "Missing on disk" : backup.status;
  // Keep the dense dot for normal rows; spell out Missing so problem archives scan in the list.
  const statusAppearance = backup.diskMissing ? "label" : "dot";

  return (
    <Group gap={6} wrap="nowrap" align="center" className={classes.backupTitleRow}>
      <StatusWord
        appearance={statusAppearance}
        tone={tone}
        label={statusLabel}
        processing={backup.status === "running"}
        size="sm"
        data-backup-missing-status={backup.diskMissing ? "true" : undefined}
      >
        {backup.diskMissing ? "Missing" : undefined}
      </StatusWord>
      <div className={classes.backupTitleClamp}>
        <Tooltip label={tooltip} withArrow>
          <Text
            fw={600}
            size="sm"
            className={classes.backupTitle}
            data-backup-title
            {...(isPlayersTab ? { "data-backup-player-name": "" } : {})}
            data-backup-status={backup.diskMissing ? "missing" : backup.status}
            title={backup.path}
          >
            {label}
          </Text>
        </Tooltip>
      </div>
    </Group>
  );
}

/**
 * File absorbs leftover width (`100%`); Date/Size/Actions use stable px widths so an
 * empty filtered body does not jump the header. Status/Type/Map live in the File
 * title + header filters.
 */
export function buildBackupHistoryTableColumns(input: BackupHistoryColumnInput): DataTableColumn<BackupRecord>[] {
  const isPlayersTab = input.kind === "players";

  return [
    {
      accessor: "path",
      title: isPlayersTab ? "Player" : "File",
      width: "100%",
      ellipsis: true,
      sortable: true,
      resizable: true,
      filtering: input.metaFilterActive,
      filter: (
        <BackupHistoryMetaFilter
          filter={input.metaFilter}
          typeOptions={input.typeFilterOptions}
          onChange={input.onMetaFilterChange}
          onClear={input.onMetaFilterClear}
        />
      ),
      cellsClassName: classes.backupFileCell,
      render: (backup) => {
        if (isPlayersTab) {
          const playerId = parsePlayerKeyFromNotes(backup.notes);
          return (
            <Stack gap={2} className={classes.backupFileStack}>
              {renderTitleRow(backup, true)}
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
          <Stack gap={2} className={classes.backupFileStack}>
            {renderTitleRow(backup, false)}
            <Text size="xs" c="dimmed" className={classes.backupFileName} title={backup.path} data-backup-filename>
              {archiveFileName(backup.path)}
            </Text>
          </Stack>
        );
      },
    },
    {
      accessor: "when",
      title: "Date",
      width: BACKUP_HISTORY_DATE_COLUMN_WIDTH,
      noWrap: true,
      sortable: true,
      resizable: true,
      render: (backup) => {
        const finishedAt = backupFinishedAt(backup);
        const { primary, tooltip } = formatBackupWhenLabel(finishedAt);
        return (
          <Tooltip label={tooltip} withArrow>
            <Text fw={600} size="sm" data-backup-date className={classes.backupDate}>
              {primary}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      accessor: "sizeBytes",
      title: "Size",
      width: BACKUP_HISTORY_SIZE_COLUMN_WIDTH,
      noWrap: true,
      sortable: true,
      resizable: true,
      render: (backup) => (
        <Text size="xs" c="dimmed">
          {input.formatSize(backup.sizeBytes)}
        </Text>
      ),
    },
    {
      accessor: "actions",
      title: "Actions",
      width: BACKUP_HISTORY_ACTIONS_COLUMN_WIDTH,
      textAlign: "right",
      render: (backup) => (
        <div className={classes.backupActions}>
          <BackupHistoryRowActions
            backup={backup}
            busy={input.busy}
            opsLocked={input.opsLocked}
            protectionSaving={input.protectionSaving}
            onCopyDetails={input.onCopyDetails}
            onOpenFolder={input.onOpenFolder}
            onExport={input.onExport}
            onRestore={input.onRestore}
            onDelete={input.onDelete}
            onSaveProtection={input.onSaveProtection}
          />
        </div>
      ),
    },
  ];
}
