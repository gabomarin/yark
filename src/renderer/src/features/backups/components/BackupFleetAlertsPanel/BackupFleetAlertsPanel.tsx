import type { ReactElement } from "react";
import { Broom, Warning, WarningCircle } from "@phosphor-icons/react";
import { Button, Group, Text, Tooltip } from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { BackupFleetAlert } from "@shared/types";
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

function severityBadgeColor(severity: BackupFleetAlert["severity"]): string {
  return severity === "error" ? "red" : "yellow";
}

/**
 * Compact scrollable fleet-alert list for Sidebar → Backups.
 * Keeps create/restore messaging dense so many alerts do not dominate the page.
 */
export function BackupFleetAlertsPanel(props: Props): ReactElement | null {
  if (props.alerts.length === 0) {
    return null;
  }

  return (
    <AppSurfaceCard
      tone="flat"
      padding="sm"
      className={classes.panel}
      data-backup-alerts-panel
      aria-label="Backup alerts"
    >
      <ul className={classes.list} data-backup-alerts-list>
        {props.alerts.map((alert) => {
          const isFailed = alert.kind === "failed";
          const showLogs =
            isFailed &&
            alert.serverId !== null &&
            props.onOpenFailedBackupLogs !== undefined;
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
                {alert.severity === "error" ? (
                  <WarningCircle size={14} />
                ) : (
                  <Warning size={14} />
                )}
              </span>
              <Text size="sm" className={classes.message}>
                {alert.message}
              </Text>
              <Group gap={4} className={classes.actions} wrap="nowrap">
                {showLogs && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color={severityBadgeColor(alert.severity)}
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
                  <Button
                    size="compact-xs"
                    variant="default"
                    onClick={() => props.onOpenServerBackups(alert.serverId!)}
                  >
                    Open
                  </Button>
                )}
                {(alert.kind === "disk_warning" || alert.kind === "disk_critical") &&
                  props.onOpenCleanup !== undefined && (
                    <Button
                      size="compact-xs"
                      variant="light"
                      leftSection={<Broom size={12} />}
                      onClick={props.onOpenCleanup}
                    >
                      Cleanup
                    </Button>
                  )}
                {props.onDismissAlert !== undefined && (
                  <Tooltip label="Hide until this condition changes again">
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => props.onDismissAlert?.(alert)}
                    >
                      Dismiss
                    </Button>
                  </Tooltip>
                )}
              </Group>
            </li>
          );
        })}
      </ul>
    </AppSurfaceCard>
  );
}
