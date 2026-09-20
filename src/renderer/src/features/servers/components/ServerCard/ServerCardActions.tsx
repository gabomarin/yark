import type { ReactElement } from "react";
import {
  ArrowsClockwise,
  CloudArrowDown,
  DotsThreeVertical,
  Eye,
  Play,
  Stop,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { ActionIcon, Group, Menu, Tooltip } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import type { ServerMaintenanceRuntime, ServerStatus } from "@shared/types";
import { RowActionMenuItems } from "@ui/RowActionMenu/RowActionMenuItems";
import {
  formatRestartCountdown,
  useCountdownRemaining,
} from "@ui/RestartSplitButton/useCountdownRemaining";
import type {
  ServerCardRestartAction,
  ServerCardRuntimeAction,
  ServerCardUpdateAction,
} from "./serverCardModel";
import { actionGlyphColor } from "./serverCardModel";
import { buildServerCardMenuActions } from "./serverCardMenuActions";
import classes from "./ServerCard.module.css";

interface Props {
  status: ServerStatus;
  isActive: boolean;
  isInstallationReady: boolean;
  /** When false, hide Install (suspicious / unknown / inaccessible). */
  canOfferInstall: boolean;
  updateAvailable: boolean;
  steamCmdBusy: boolean;
  filesLocked?: boolean;
  verifyFilesLocked?: boolean;
  installFilesLocked?: boolean;
  stopBusy: boolean;
  startBusy?: boolean;
  checkingUpdates: boolean;
  runtimeAction: ServerCardRuntimeAction;
  restartAction: ServerCardRestartAction;
  updateAction: ServerCardUpdateAction;
  /** Manual restart warning setting + live countdown (#573). */
  maintenance?: ServerMaintenanceRuntime | null;
  onRuntimeAction: () => void;
  onRestart: () => void;
  onRestartWithWarning?: () => void;
  onCancelRestartWarning?: () => void;
  onConfigureRestartWarnings?: () => void;
  onUpdateNow: () => void;
  onOpenWorkspace: () => void;
  onStop: () => void;
  onOpenFolder: () => void;
  onOpenLogs: () => void;
  onCheckUpdates: () => void;
  onVerifyFiles: () => void;
  onInstallFiles: () => void;
  onClone: () => void;
  onCopyConfiguration: () => void;
  onKill: () => void;
  onDelete: () => void;
  serverEnabled?: boolean;
  onToggleEnabled?: () => void;
}

function runtimeActionIcon(
  kind: ServerCardRuntimeAction["kind"],
  iconSize: number,
): ReactElement {
  switch (kind) {
    case "starting":
    case "stopping":
      return <ArrowsClockwise size={iconSize} />;
    case "stop":
      return <Stop size={iconSize} weight="fill" />;
    case "start":
      return <Play size={iconSize} weight="fill" />;
    case "enable":
      return <Eye size={iconSize} weight="fill" />;
  }
}

function filesActionClick(
  kind: ServerCardUpdateAction["kind"],
  props: Pick<Props, "onInstallFiles" | "onUpdateNow">,
): void {
  if (kind === "install") {
    props.onInstallFiles();
    return;
  }
  props.onUpdateNow();
}

export function ServerCardActions(props: Props): ReactElement {
  const { runtimeAction, restartAction, updateAction } = props;
  const density = useUiDensity();
  const actionSize = density === "compact" ? "md" : "lg";
  const iconSize = density === "compact" ? 16 : 18;
  // Only model.disabled blocks icons. Do not blanket-disable Cancel/Stop during
  // starting/stopping — Overview needs escape hatches when a transition sticks.
  const menuDisabled = props.steamCmdBusy || props.stopBusy || props.startBusy === true;
  const manualCountdown =
    props.maintenance?.countdown?.kind === "manual"
      ? props.maintenance.countdown
      : null;
  const hasManualRestartOptions =
    props.maintenance?.manualRestartWarningsEnabled === true
    && props.onRestartWithWarning !== undefined;
  const countdownRemaining = useCountdownRemaining(
    manualCountdown?.targetAtMs ?? null,
  );
  const cancelRestartLabel =
    countdownRemaining === null
      ? "Cancel restart"
      : `Cancel restart · ${formatRestartCountdown(countdownRemaining)}`;
  const stopBlockedByManualRestart = manualCountdown !== null;
  const runtimeActionDisabled =
    runtimeAction.disabled
    || (stopBlockedByManualRestart && runtimeAction.kind === "stop");
  const runtimeActionHint = stopBlockedByManualRestart && runtimeAction.kind === "stop"
    ? "Cancel the queued restart first"
    : runtimeAction.hint ?? runtimeAction.label;
  const menuEntries = buildServerCardMenuActions({
    status: props.status,
    isActive: props.isActive,
    isInstallationReady: props.isInstallationReady,
    canOfferInstall: props.canOfferInstall,
    updateAvailable: props.updateAvailable,
    steamCmdBusy: props.steamCmdBusy,
    filesLocked: props.filesLocked === true,
    verifyFilesLocked: props.verifyFilesLocked === true,
    installFilesLocked: props.installFilesLocked === true,
    checkingUpdates: props.checkingUpdates,
    updateAction: props.updateAction,
    serverEnabled: props.serverEnabled ?? true,
    manualRestartWarningsEnabled: props.maintenance?.manualRestartWarningsEnabled ?? false,
    manualRestartPending: stopBlockedByManualRestart,
    onRestartWithWarning: props.onRestartWithWarning,
    onConfigureRestartWarnings: props.onConfigureRestartWarnings,
    onOpenWorkspace: props.onOpenWorkspace,
    onStop: props.onStop,
    onRestart: props.onRestart,
    onOpenFolder: props.onOpenFolder,
    onOpenLogs: props.onOpenLogs,
    onCheckUpdates: props.onCheckUpdates,
    onUpdateNow: props.onUpdateNow,
    onVerifyFiles: props.onVerifyFiles,
    onInstallFiles: props.onInstallFiles,
    onClone: props.onClone,
    onCopyConfiguration: props.onCopyConfiguration,
    onKill: props.onKill,
    onDelete: props.onDelete,
    onToggleEnabled: props.onToggleEnabled,
  });

  return (
    <Group gap="xs" wrap="nowrap" className={classes.rowActions} data-row-actions>
      {runtimeAction.visible ? (
        <Tooltip label={runtimeActionHint} withArrow>
          <span className={classes.tooltipTarget}>
            <ActionIcon
              size={actionSize}
              variant={runtimeAction.variant}
              color={runtimeAction.color}
              aria-label={runtimeAction.label}
              disabled={runtimeActionDisabled}
              loading={runtimeAction.kind === "starting" || runtimeAction.kind === "stopping"}
              onClick={props.onRuntimeAction}
              className={classes.iconAction}
              data-primary-action
            >
              {runtimeActionIcon(runtimeAction.kind, iconSize)}
            </ActionIcon>
          </span>
        </Tooltip>
      ) : (
        <span className={classes.tooltipTarget} aria-hidden>
          <ActionIcon
            size={actionSize}
            variant="filled"
            className={`${classes.iconAction} ${classes.iconActionReserved}`}
            tabIndex={-1}
            data-primary-action
            data-reserved
          >
            <Play size={iconSize} weight="fill" />
          </ActionIcon>
        </span>
      )}

      {restartAction.visible ? (
        manualCountdown !== null ? (
          <Tooltip label={cancelRestartLabel} withArrow>
            <span className={classes.tooltipTarget}>
              <ActionIcon
                size={actionSize}
                variant="default"
                color="red"
                aria-label={cancelRestartLabel}
                onClick={props.onCancelRestartWarning}
                className={classes.iconAction}
                data-restart-action
                data-restart-warning-cancel
              >
                <XCircle size={iconSize} weight="bold" color={actionGlyphColor("red")} />
              </ActionIcon>
            </span>
          </Tooltip>
        ) : hasManualRestartOptions ? (
          <Menu shadow="md" withinPortal position="bottom-end">
            <Menu.Target>
              <ActionIcon
                size={actionSize}
                variant={restartAction.variant}
                aria-label="Restart options"
                title="Restart options"
                disabled={restartAction.disabled}
                loading={restartAction.label === "Restarting…"}
                className={classes.iconAction}
                data-restart-action
                data-restart-options
              >
                <ArrowsClockwise size={iconSize} weight="bold" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<ArrowsClockwise size={16} weight="bold" />}
                onClick={props.onRestart}
              >
                Restart now
              </Menu.Item>
              <Menu.Item
                leftSection={<Warning size={16} />}
                onClick={() => props.onRestartWithWarning?.()}
                data-restart-with-warning
              >
                Restart with player warning
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : (
          <Tooltip label={restartAction.label} withArrow>
            <span className={classes.tooltipTarget}>
              <ActionIcon
                size={actionSize}
                variant={restartAction.variant}
                aria-label={restartAction.label}
                disabled={restartAction.disabled}
                loading={restartAction.label === "Restarting…"}
                onClick={props.onRestart}
                className={classes.iconAction}
                data-restart-action
              >
                <ArrowsClockwise size={iconSize} weight="bold" />
              </ActionIcon>
            </span>
          </Tooltip>
        )
      ) : (
        <span className={classes.tooltipTarget} aria-hidden>
          <ActionIcon
            size={actionSize}
            variant="default"
            className={`${classes.iconAction} ${classes.iconActionReserved}`}
            tabIndex={-1}
            data-restart-action
            data-reserved
          >
            <ArrowsClockwise size={iconSize} />
          </ActionIcon>
        </span>
      )}

      {updateAction.visible ? (
        <Tooltip
          label={
            updateAction.kind === "update" && props.isActive
              ? "Stop the server before updating files"
              : updateAction.label
          }
          withArrow
        >
          <span className={classes.tooltipTarget}>
            <ActionIcon
              size={actionSize}
              variant={updateAction.variant}
              color={updateAction.color}
              aria-label={updateAction.label}
              disabled={updateAction.disabled}
              onClick={() => filesActionClick(updateAction.kind, props)}
              className={classes.iconAction}
              data-update-action
              data-files-action={updateAction.kind}
            >
              <CloudArrowDown size={iconSize} color={actionGlyphColor(updateAction.color)} />
            </ActionIcon>
          </span>
        </Tooltip>
      ) : (
        <span className={classes.tooltipTarget} aria-hidden>
          <ActionIcon
            size={actionSize}
            variant="default"
            className={`${classes.iconAction} ${classes.iconActionReserved}`}
            tabIndex={-1}
            data-update-action
            data-reserved
          >
            <CloudArrowDown size={iconSize} />
          </ActionIcon>
        </span>
      )}

      <Menu shadow="md" withinPortal position="bottom-end">
        <Tooltip label="More options" withArrow>
          <span className={classes.tooltipTarget}>
            <Menu.Target>
              <ActionIcon
                variant="default"
                size={actionSize}
                aria-label="More options"
                disabled={menuDisabled}
              >
                <DotsThreeVertical size={iconSize} />
              </ActionIcon>
            </Menu.Target>
          </span>
        </Tooltip>
        <Menu.Dropdown>
          <RowActionMenuItems entries={menuEntries} />
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
