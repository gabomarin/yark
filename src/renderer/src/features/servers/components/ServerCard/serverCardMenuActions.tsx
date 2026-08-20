import {
  ArrowsClockwise,
  CloudArrowDown,
  Copy,
  Eye,
  EyeSlash,
  FileText,
  FolderOpen,
  GearSix,
  MagnifyingGlass,
  ShieldCheck,
  Stop,
  Trash,
  XCircle,
} from "@phosphor-icons/react";
import type { ServerStatus } from "@shared/types";
import type { RowActionEntry } from "@ui/RowActionMenu/rowActionModel";
import type { ServerCardUpdateAction } from "./serverCardActionModel";

const ICON = 16;

export interface ServerCardMenuActionInput {
  status: ServerStatus;
  isActive: boolean;
  isInstallationReady: boolean;
  canOfferInstall: boolean;
  updateAvailable: boolean;
  steamCmdBusy: boolean;
  filesLocked?: boolean;
  verifyFilesLocked?: boolean;
  installFilesLocked?: boolean;
  checkingUpdates: boolean;
  updateAction: ServerCardUpdateAction;
  serverEnabled: boolean;
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
  onCopyConfiguration: () => void;
  onKill: () => void;
  onDelete: () => void;
  onToggleEnabled?: () => void;
}

export interface ServerEnabledMenuState {
  label: string;
  disabled: boolean;
  title: string | undefined;
}

export function getServerEnabledMenuState(input: {
  enabled: boolean;
  active: boolean;
  steamCmdBusy: boolean;
  onToggle?: () => void;
}): ServerEnabledMenuState {
  const disabled =
    input.onToggle === undefined
    || input.steamCmdBusy
    || (input.enabled && input.active);
  const title =
    input.onToggle === undefined
      ? undefined
      : input.steamCmdBusy
        ? "Another server operation is in progress"
        : input.enabled && input.active
          ? "Stop the server first"
          : undefined;
  return {
    label: input.enabled ? "Disable server" : "Enable server",
    disabled,
    title,
  };
}

export function buildServerCardMenuActions(
  input: ServerCardMenuActionInput,
): RowActionEntry[] {
  const enabledState = getServerEnabledMenuState({
    enabled: input.serverEnabled,
    active: input.isActive,
    steamCmdBusy: input.steamCmdBusy,
    onToggle: input.onToggleEnabled,
  });

  const entries: RowActionEntry[] = [
    { kind: "label", key: "label-server", label: "Server" },
    {
      kind: "item",
      key: "open-settings",
      label: "Open settings",
      icon: <GearSix size={ICON} color="var(--mantine-color-blue-6)" />,
      onClick: input.onOpenWorkspace,
    },
    {
      kind: "item",
      key: "toggle-enabled",
      label: enabledState.label,
      icon: input.serverEnabled ? (
        <EyeSlash size={ICON} color="var(--app-color-danger-bright)" />
      ) : (
        <Eye size={ICON} color="var(--mantine-color-blue-6)" />
      ),
      disabled: enabledState.disabled,
      title: enabledState.title,
      onClick: () => {
        input.onToggleEnabled?.();
      },
    },
  ];

  if (input.status === "running") {
    entries.push(
      {
        kind: "item",
        key: "stop-safely",
        label: "Stop safely",
        color: "red",
        icon: <Stop size={ICON} weight="fill" />,
        onClick: input.onStop,
      },
      {
        kind: "item",
        key: "restart",
        label: "Restart",
        color: "fossil",
        icon: <ArrowsClockwise size={ICON} weight="bold" />,
        onClick: input.onRestart,
      },
    );
  } else if (input.status === "starting") {
    entries.push({
      kind: "item",
      key: "stop",
      label: "Stop",
      color: "red",
      icon: <Stop size={ICON} weight="fill" />,
      onClick: input.onStop,
    });
  }

  entries.push(
    {
      kind: "item",
      key: "open-folder",
      label: "Open folder",
      icon: <FolderOpen size={ICON} color="var(--mantine-color-blue-6)" />,
      onClick: input.onOpenFolder,
    },
    {
      kind: "item",
      key: "view-logs",
      label: "View logs",
      icon: <FileText size={ICON} color="var(--mantine-color-blue-6)" />,
      disabled: !input.isInstallationReady,
      onClick: input.onOpenLogs,
    },
    { kind: "divider", key: "div-maintenance" },
    { kind: "label", key: "label-maintenance", label: "Maintenance" },
  );

  if (input.isInstallationReady) {
    entries.push(
      {
        kind: "item",
        key: "check-updates",
        label: "Check server updates",
        icon: <MagnifyingGlass size={ICON} color="var(--mantine-color-blue-6)" />,
        disabled: input.checkingUpdates,
        onClick: input.onCheckUpdates,
      },
      {
        kind: "item",
        key: "update-server",
        label:
          input.updateAction.kind === "update"
          && input.updateAction.updateState === "unknown"
            ? "Update (couldn't check version)"
            : "Update server",
        icon: (
          <CloudArrowDown
            size={ICON}
            color={
              input.updateAvailable
                ? "var(--mantine-color-attention-6)"
                : "var(--mantine-color-gray-6)"
            }
          />
        ),
        disabled:
          input.updateAction.kind === "update"
            ? input.updateAction.disabled
            : !input.updateAvailable,
        title:
          input.updateAction.disabled && input.isActive
            ? "Stop the server before updating files"
            : input.updateAction.disabled
              ? "A Downloads job is already queued for this server"
              : undefined,
        onClick: input.onUpdateNow,
      },
      {
        kind: "item",
        key: "verify",
        label: "Verify integrity",
        icon: <ShieldCheck size={ICON} color="var(--mantine-color-teal-6)" />,
        disabled: input.verifyFilesLocked === true,
        title:
          input.verifyFilesLocked === true
            ? "A Downloads job is already queued for this server"
            : undefined,
        onClick: input.onVerifyFiles,
      },
    );
  } else if (input.canOfferInstall) {
    entries.push({
      kind: "item",
      key: "install-files",
      label: "Install files",
      icon: <CloudArrowDown size={ICON} color="var(--mantine-color-blue-6)" />,
      disabled: input.installFilesLocked === true,
      title:
        input.installFilesLocked === true
          ? "A Downloads job is already queued for this server"
          : undefined,
      onClick: input.onInstallFiles,
    });
  }

  entries.push(
    {
      kind: "item",
      key: "clone",
      label: "Clone",
      icon: <Copy size={ICON} color="var(--mantine-color-blue-6)" />,
      onClick: input.onClone,
    },
    {
      kind: "item",
      key: "copy-configuration",
      label: "Copy configuration…",
      icon: <Copy size={ICON} color="var(--mantine-color-teal-6)" />,
      onClick: input.onCopyConfiguration,
    },
    { kind: "divider", key: "div-danger" },
    { kind: "label", key: "label-danger", label: "Danger" },
    {
      kind: "item",
      key: "force-close",
      label: "Force close",
      color: "red",
      icon: <XCircle size={ICON} />,
      disabled: !input.isActive,
      onClick: input.onKill,
    },
    {
      kind: "item",
      key: "delete",
      label: input.isActive ? "Delete (stop the server first)" : "Delete server",
      color: "red",
      icon: <Trash size={ICON} />,
      disabled: input.isActive,
      onClick: input.onDelete,
    },
  );

  return entries;
}
