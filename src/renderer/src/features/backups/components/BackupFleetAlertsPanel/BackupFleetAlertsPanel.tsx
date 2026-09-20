import type { ReactElement } from "react";
import { Broom, Warning, WarningCircle } from "@phosphor-icons/react";
import { Button, Group, Text, Tooltip } from "@mantine/core";
import type { BackupFleetAlert } from "@shared/types";
import { BACKUP_ALERTS_LIST_ATTR } from "../../backupsTestIds";
import classes from "./BackupFleetAlertsPanel.module.css";

export interface OpenFailedBackupLogsArgs {
  serverId: string;
  backupId?: string | null;
}

interface Props {
  alerts: BackupFleetAlert[];
  onOpenServerBackups: (serverId: string) => void;
  onOpenFailedBackupLogs?: (args: OpenFailedBackupLogsArgs) => void;
  onDismissAlert?: (alert: BackupFleetAlert) => void;
  onOpenCleanup?: () => void;
}

/**
 * Fleet-alert bars for Sidebar → Backups, stacked straight onto the page: no card and no
 * scroll cap, because an alert clipped into a 280px box is worse than a long page. Each
 * bar uses the Fluent InfoBar grammar (solid fill, hairline, left severity accent) that
 * `DismissibleHint` already established.
 */
export function BackupFleetAlertsPanel(props: Props): ReactElement | null {
  if (props.alerts.length === 0) {
    return null;
  }

  return (
    <ul
      className={classes.list}
      data-backup-alerts-panel
      aria-label="Backup alerts"
      {...{ [BACKUP_ALERTS_LIST_ATTR]: true }}
    >
      {props.alerts.map((alert) => {
        const isFailed = alert.kind === "failed";
        const showLogs = isFailed && alert.serverId !== null && props.onOpenFailedBackupLogs !== undefined;
        // Failed alerts deep-link to Logs → Backups; other server alerts open the workspace.
        const showOpen = alert.serverId !== null && !isFailed;

        return (
          <li
            key={alert.id}
            className={classes.row}
            data-severity={alert.severity}
            data-alert-id={alert.id}
            data-alert-kind={alert.kind}
          >
            <span className={classes.icon} aria-hidden>
              {alert.severity === "error" ? <WarningCircle size={14} /> : <Warning size={14} />}
            </span>
            <Text size="sm" className={classes.message}>
              {alert.message}
            </Text>
            <Group gap={4} className={classes.actions} wrap="nowrap">
              {showLogs && (
                <Button
                  variant="default"
                  onClick={() =>
                    props.onOpenFailedBackupLogs?.({
                      serverId: alert.serverId!,
                      backupId: alert.backupId,
                    })
                  }
                >
                  Logs
                </Button>
              )}
              {showOpen && (
                <Button variant="default" onClick={() => props.onOpenServerBackups(alert.serverId!)}>
                  Open
                </Button>
              )}
              {(alert.kind === "disk_warning" || alert.kind === "disk_critical") &&
                props.onOpenCleanup !== undefined && (
                  <Button variant="default" leftSection={<Broom size={12} />} onClick={props.onOpenCleanup}>
                    Cleanup
                  </Button>
                )}
              {props.onDismissAlert !== undefined && (
                <Tooltip label="Hide until this condition changes again">
                  <Button variant="subtle" color="gray" onClick={() => props.onDismissAlert?.(alert)}>
                    Dismiss
                  </Button>
                </Tooltip>
              )}
            </Group>
          </li>
        );
      })}
    </ul>
  );
}
