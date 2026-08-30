import { HardDrives, Trash } from "@phosphor-icons/react";
import { ActionIcon, Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import type { ServerOperationalLogs } from "@shared/types";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type { ReactElement } from "react";
import { ReadonlyPath } from "@ui/ReadonlyPath/ReadonlyPath";
import classes from "../../LogsPage.module.css";
import {
  LogsClearAction,
  LogsEmptyState,
  LogsTabIntro,
} from "../LogsPanelChrome/LogsPanelChrome";

export interface LogsBackupsTabProps {
  embedded?: boolean;
  loading: boolean;
  busy: boolean;
  logs: ServerOperationalLogs | null;
  highlightedBackupId: string | null;
  onClearBackups: () => void;
  onDeleteBackup: (backupId: string, label: string) => void;
  onOpenBackupsTab?: () => void;
}

export function LogsBackupsTab(props: LogsBackupsTabProps): ReactElement {
  const {
    embedded,
    loading,
    busy,
    logs,
    highlightedBackupId,
    onClearBackups,
    onDeleteBackup,
    onOpenBackupsTab,
  } = props;

  return (
    <div className={classes.fillPanel}>
      <Stack gap="sm" className={classes.panelStack}>
        <LogsTabIntro
          embedded={embedded}
          title="Backup history"
          purpose="Archive records for this server (kind, status, path, size, timing)."
          useWhen="You need to confirm a backup finished, find a path, or audit failures. Create and restore live on the Backups workspace tab; you can delete archives here."
          action={
            <LogsClearAction
              label="Delete all listed backup archives"
              onClick={onClearBackups}
              disabled={
                loading ||
                busy ||
                logs === null ||
                logs.backups.length === 0
              }
            />
          }
        />
        {loading ? (
          <Text c="dimmed">Loading backups…</Text>
        ) : logs === null || logs.backups.length === 0 ? (
          <LogsEmptyState
            icon={<HardDrives size={24} />}
            title="No backups recorded"
            description="Manual, scheduled, and automatic archives will list here after the first backup runs."
            action={
              onOpenBackupsTab !== undefined ? (
                <Button variant="light" size="sm" onClick={onOpenBackupsTab}>
                  Open Backups tab
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className={classes.eventList} data-logs-scroll-region="backups">
            {logs.backups.map((backup) => {
              const focused = highlightedBackupId === backup.id;
              return (
                <div
                  key={backup.id}
                  className={[
                    classes.eventRow,
                    focused ? classes.eventRowFocused : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-backup-id={backup.id}
                >
                  <Stack gap={4}>
                    <Text fw={600}>
                      {backup.kind} · {backup.type}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {formatLogDateTime(backup.createdAt)} | {backup.status}
                    </Text>
                    <Group
                      align="center"
                      gap="sm"
                      wrap="nowrap"
                      className={classes.backupPathRow}
                    >
                      <ReadonlyPath
                        value={backup.path}
                        compact
                        className={classes.backupPath}
                      />
                      <Tooltip label={`Delete ${backup.kind} · ${backup.type} backup`}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={`Delete ${backup.kind} ${backup.type} backup`}
                          disabled={busy}
                          className={classes.backupDeleteAction}
                          onClick={() =>
                            onDeleteBackup(
                              backup.id,
                              `${backup.kind} · ${backup.type}`,
                            )
                          }
                        >
                          <Trash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Stack>
                </div>
              );
            })}
          </div>
        )}
      </Stack>
    </div>
  );
}
