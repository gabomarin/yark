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
import { ActionIcon, Button, Group, Menu, Tooltip } from "@mantine/core";
import type { ServerStatus } from "@shared/types";
import type { ServerCardPrimaryAction } from "./serverCardModel";
import classes from "./ServerCard.module.css";

interface Props {
  status: ServerStatus;
  isActive: boolean;
  isInstallationReady: boolean;
  updateAvailable: boolean;
  steamCmdBusy: boolean;
  checkingUpdates: boolean;
  primaryAction: ServerCardPrimaryAction;
  onPrimaryAction: () => void;
  onOpenWorkspace: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpenFolder: () => void;
  onOpenLogs: () => void;
  onCheckUpdates: () => void;
  onUpdateNow: () => void;
  onVerifyFiles: () => void;
  onInstallFiles: () => void;
  onClone: () => void;
  onKill: () => void;
  onDelete: () => void;
}

function primaryActionIcon(kind: ServerCardPrimaryAction["kind"]): JSX.Element {
  switch (kind) {
    case "cancel":
    case "review-error":
      return <XCircle size={16} />;
    case "install":
    case "update":
      return <CloudArrowDown size={16} />;
    case "manage":
      return <GearSix size={16} />;
    case "starting":
    case "stopping":
      return <ArrowsClockwise size={16} />;
    case "start":
      return <Play size={16} weight="fill" />;
  }
}

export function ServerCardActions(props: Props): JSX.Element {
  const { primaryAction } = props;

  return (
    <Group gap="xs" wrap="nowrap" className={classes.rowActions}>
      <Button
        size="sm"
        variant={primaryAction.variant}
        color={primaryAction.color}
        leftSection={primaryActionIcon(primaryAction.kind)}
        disabled={primaryAction.disabled}
        onClick={props.onPrimaryAction}
        className={classes.primaryAction}
        data-primary-action
      >
        {primaryAction.label}
      </Button>

      <Menu shadow="md" withinPortal position="bottom-end">
        <Menu.Target>
          <Tooltip label="More options" withArrow>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="More options"
              disabled={props.steamCmdBusy}
            >
              <DotsThreeVertical size={18} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
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
                color={props.updateAvailable ? "orange" : undefined}
                onClick={props.onUpdateNow}
              >
                Update server
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
