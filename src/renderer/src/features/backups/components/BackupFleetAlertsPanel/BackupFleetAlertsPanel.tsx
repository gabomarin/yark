import type { ReactElement } from "react";
import { Broom, Warning, WarningCircle } from "@phosphor-icons/react";
import { Button, Group, Text } from "@mantine/core";
import { AppSurfaceCard } from "@ui/AppSurfaceCard/AppSurfaceCard";
import type { BackupFleetAlert } from "@shared/types";
import classes from "./BackupFleetAlertsPanel.module.css";

interface Props {
  alerts: BackupFleetAlert[];
  onOpenServerBackups: (serverId: string) => void;
  onOpenServerLogs?: (serverId: string) => void;
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
        {props.alerts.map((alert) => (
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
              {alert.kind === "failed" &&
                alert.serverId !== null &&
                props.onOpenServerLogs !== undefined && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    color={severityBadgeColor(alert.severity)}
                    onClick={() => props.onOpenServerLogs?.(alert.serverId!)}
                  >
                    Logs
                  </Button>
                )}
              {alert.serverId !== null && (
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
            </Group>
          </li>
        ))}
      </ul>
    </AppSurfaceCard>
  );
}
