import {
  ArrowsClockwise,
  CloudArrowDown,
  Copy,
  DotsThreeVertical,
  FileText,
  FolderOpen,
  GearSix,
  MagnifyingGlass,
  Pause,
  Play,
  ShieldCheck,
  Trash,
  XCircle,
} from "@phosphor-icons/react";
import { ActionIcon, Group, Menu, Tooltip } from "@mantine/core";
import type { ServerStatus } from "@shared/types";
import type {
  ServerCardRestartAction,
  ServerCardRuntimeAction,
  ServerCardUpdateAction,
} from "./serverCardModel";
import classes from "./ServerCard.module.css";

interface Props {
  status: ServerStatus;
  isActive: boolean;
  isInstallationReady: boolean;
  updateAvailable: boolean;
  steamCmdBusy: boolean;
  stopBusy: boolean;
  checkingUpdates: boolean;
  runtimeAction: ServerCardRuntimeAction;
  restartAction: ServerCardRestartAction;
  updateAction: ServerCardUpdateAction;
  onRuntimeAction: () => void;
  onRestart: () => void;
  onUpdateNow: () => void;
  onOpenWorkspace: () => void;
  onStop: () => void;
  onOpenFolder: () => void;
  onOpenLogs: () => void;
  onCheckUpdates: () => void;
  onVerifyFiles: () => void;
  onInstallFiles: () => void;
  onClone: () => void;
  onKill: () => void;
  onDelete: () => void;
}

function runtimeActionIcon(kind: ServerCardRuntimeAction["kind"]): JSX.Element {
  switch (kind) {
    case "cancel":
      return <XCircle size={18} />;
    case "starting":
    case "stopping":
      return <ArrowsClockwise size={18} />;
    case "stop":
      return <Pause size={18} weight="fill" />;
    case "start":
      return <Play size={18} weight="fill" />;
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

export function ServerCardActions(props: Props): JSX.Element {
  const { runtimeAction, restartAction, updateAction } = props;
  // Only model.disabled blocks icons. Do not blanket-disable Cancel/Stop during
  // starting/stopping — Overview needs escape hatches when a transition sticks.
  const menuDisabled = props.steamCmdBusy || props.stopBusy;

  return (
    <Group gap="xs" wrap="nowrap" className={classes.rowActions} data-row-actions>
      {runtimeAction.visible ? (
        <Tooltip label={runtimeAction.label} withArrow>
          <span className={classes.tooltipTarget}>
            <ActionIcon
              size="lg"
              variant={runtimeAction.variant}
              color={runtimeAction.color}
              aria-label={runtimeAction.label}
              disabled={runtimeAction.disabled}
              onClick={props.onRuntimeAction}
              className={classes.iconAction}
              data-primary-action
            >
              {runtimeActionIcon(runtimeAction.kind)}
            </ActionIcon>
          </span>
        </Tooltip>
      ) : (
        <span className={classes.tooltipTarget} aria-hidden>
          <ActionIcon
            size="lg"
            variant="light"
            className={`${classes.iconAction} ${classes.iconActionReserved}`}
            tabIndex={-1}
            data-primary-action
            data-reserved
          >
            <Play size={18} weight="fill" />
          </ActionIcon>
        </span>
      )}

      {restartAction.visible ? (
        <Tooltip label={restartAction.label} withArrow>
          <span className={classes.tooltipTarget}>
            <ActionIcon
              size="lg"
              variant="light"
              color={restartAction.color}
              aria-label={restartAction.label}
              disabled={restartAction.disabled}
              onClick={props.onRestart}
              className={classes.iconAction}
              data-restart-action
            >
              <ArrowsClockwise size={18} />
            </ActionIcon>
          </span>
        </Tooltip>
      ) : (
        <span className={classes.tooltipTarget} aria-hidden>
          <ActionIcon
            size="lg"
            variant="light"
            className={`${classes.iconAction} ${classes.iconActionReserved}`}
            tabIndex={-1}
            data-restart-action
            data-reserved
          >
            <ArrowsClockwise size={18} />
          </ActionIcon>
        </span>
      )}

      {updateAction.visible ? (
        <Tooltip label={updateAction.label} withArrow>
          <span className={classes.tooltipTarget}>
            <ActionIcon
              size="lg"
              variant={updateAction.variant}
              color={updateAction.color}
              aria-label={updateAction.label}
              disabled={updateAction.disabled}
              onClick={() => filesActionClick(updateAction.kind, props)}
              className={classes.iconAction}
              data-update-action
              data-files-action={updateAction.kind}
            >
              <CloudArrowDown size={18} />
            </ActionIcon>
          </span>
        </Tooltip>
      ) : (
        <span className={classes.tooltipTarget} aria-hidden>
          <ActionIcon
            size="lg"
            variant="light"
            className={`${classes.iconAction} ${classes.iconActionReserved}`}
            tabIndex={-1}
            data-update-action
            data-reserved
          >
            <CloudArrowDown size={18} />
          </ActionIcon>
        </span>
      )}

      <Menu shadow="md" withinPortal position="bottom-end">
        <Tooltip label="More options" withArrow>
          <span className={classes.tooltipTarget}>
            <Menu.Target>
              <ActionIcon
                variant="default"
                size="lg"
                aria-label="More options"
                disabled={menuDisabled}
              >
                <DotsThreeVertical size={18} />
              </ActionIcon>
            </Menu.Target>
          </span>
        </Tooltip>
        <Menu.Dropdown>
          <Menu.Label>Server</Menu.Label>
          <Menu.Item leftSection={<GearSix size={16} />} onClick={props.onOpenWorkspace}>
            Open settings
          </Menu.Item>
          {props.status === "running" && (
            <>
              <Menu.Item leftSection={<Pause size={16} />} onClick={props.onStop}>
                Stop safely
              </Menu.Item>
              <Menu.Item leftSection={<ArrowsClockwise size={16} />} onClick={props.onRestart}>
                Restart
              </Menu.Item>
            </>
          )}
          {props.status === "starting" && (
            <Menu.Item leftSection={<Pause size={16} />} onClick={props.onStop}>
              Stop
            </Menu.Item>
          )}
          <Menu.Item leftSection={<FolderOpen size={16} />} onClick={props.onOpenFolder}>
            Open folder
          </Menu.Item>
          <Menu.Item
            leftSection={<FileText size={16} />}
            onClick={props.onOpenLogs}
            disabled={!props.isInstallationReady}
          >
            View logs
          </Menu.Item>

          <Menu.Divider />
          <Menu.Label>Maintenance</Menu.Label>
          {props.isInstallationReady ? (
            <>
              <Menu.Item
                leftSection={<MagnifyingGlass size={16} />}
                onClick={props.onCheckUpdates}
                disabled={props.checkingUpdates}
              >
                Check for updates
              </Menu.Item>
              <Menu.Item
                leftSection={<CloudArrowDown size={16} />}
                color={props.updateAvailable ? "attention" : undefined}
                onClick={props.onUpdateNow}
                disabled={
                  updateAction.kind === "update"
                    ? updateAction.updateState === "current" || props.steamCmdBusy
                    : !props.updateAvailable
                }
              >
                {updateAction.kind === "update" && updateAction.updateState === "unknown"
                  ? "Update server (status unknown)"
                  : "Update server"}
              </Menu.Item>
              <Menu.Item
                leftSection={<ShieldCheck size={16} />}
                onClick={props.onVerifyFiles}
              >
                Verify integrity
              </Menu.Item>
            </>
          ) : (
            <Menu.Item
              leftSection={<CloudArrowDown size={16} />}
              onClick={props.onInstallFiles}
            >
              Install files
            </Menu.Item>
          )}
          <Menu.Item leftSection={<Copy size={16} />} onClick={props.onClone}>
            Clone
          </Menu.Item>

          <Menu.Divider />
          <Menu.Label>Danger</Menu.Label>
          <Menu.Item
            color="red"
            leftSection={<XCircle size={16} />}
            onClick={props.onKill}
            disabled={!props.isActive}
          >
            Force close (kill)
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<Trash size={16} />}
            onClick={props.onDelete}
            disabled={props.isActive}
          >
            {props.isActive ? "Delete (stop the server first)" : "Delete server"}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
