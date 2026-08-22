import { HardDrives, Trash } from "@phosphor-icons/react";
import { ActionIcon, Group, Stack, Text, Tooltip } from "@mantine/core";
import type { ServerOperationalLogs } from "@shared/types";
import { formatLogDateTime } from "@shared/format-log-datetime";
import type { ReactElement } from "react";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import classes from "../../LogsPage.module.css";
import {
  LogsClearAction,
  LogsEmptyState,
  LogsTabIntro,
} from "../LogsPanelChrome/LogsPanelChrome";

export interface LogsBackupsTabProps {
  loading: boolean;
  busy: boolean;
  logs: ServerOperationalLogs | null;
  highlightedBackupId: string | null;
  onClearBackups: () => void;
  onDeleteBackup: (backupId: string, label: string) => void;
}

export function LogsBackupsTab(props: LogsBackupsTabProps): ReactElement {
  const {
    loading,
    busy,
    logs,
    highlightedBackupId,
    onClearBackups,
    onDeleteBackup,
  } = props;

  return (
    <AppSurfaceCard fill className={classes.fillPanel}>
      <Stack gap="sm" className={classes.panelStack}>
        <LogsTabIntro
          title="Backups"
          purpose="History of backup archives for this server (kind, status, path, size timing)."
          useWhen="You need to confirm a backup finished, find a path, or audit failures. Create/restore lives in the Backups workspace tab; you can also delete archives here."
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
                  <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
                    <div className={classes.eventRowMain}>
                      <Text fw={600}>
                        {backup.kind} · {backup.type}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {formatLogDateTime(backup.createdAt)} | {backup.status}
                      </Text>
                      <Text size="sm">{backup.path}</Text>
                    </div>
                    <Tooltip label={`Delete ${backup.kind} · ${backup.type} backup`}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={`Delete ${backup.kind} ${backup.type} backup`}
                        disabled={busy}
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
                </div>
              );
            })}
          </div>
        )}
      </Stack>
    </AppSurfaceCard>
  );
}
