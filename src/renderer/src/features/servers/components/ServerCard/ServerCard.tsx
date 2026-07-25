import {
  ArrowsClockwise,
  CloudArrowDown,
  Copy,
  DotsThreeVertical,
  FileText,
  FolderOpen,
  GearSix,
  HardDrives,
  MagnifyingGlass,
  Pause,
  Play,
  ShieldCheck,
  Trash,
  XCircle,
} from "@phosphor-icons/react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Progress,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { getServerUpdateState } from "@shared/server-update-status";
import { formatSteamCmdByteProgress, steamCmdByteProgressNoun } from "@shared/steamcmd-progress";
import classes from "./ServerCard.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  officialSteamBuild: string | null;
  steamCmdBusy?: boolean;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null;
  checkingUpdates?: boolean;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
  onOpenWorkspace: () => void;
  onOpenLogs: () => void;
  onOpenFolder: () => void;
  onInstallFiles: () => void;
  onUpdateNow: () => void;
  onVerifyFiles: () => void;
  onCheckUpdates: () => void;
  onClone: () => void;
  onDelete: () => void;
  onCancelSteamCmd: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  error: "Error",
};

export function ServerCard(props: Props): JSX.Element {
  const {
    server,
    runtime,
    installation,
    steamCmdBusy = false,
    steamCmdProgressPercent = null,
    steamCmdProgressLabel = null,
    steamCmdProgressBytesDownloaded = null,
    steamCmdProgressBytesTotal = null,
    steamCmdOperation = null,
    checkingUpdates = false,
  } = props;
  const status = runtime?.status ?? "stopped";
  const isActive = status === "starting" || status === "running" || status === "stopping";
  const isInstallationReady = installation?.installed === true;
  const localVersion = installation?.arkVersion ?? installation?.build ?? null;
  const updateState = getServerUpdateState(installation, props.officialSteamBuild);
  const updateAvailable = updateState === "available";
  const installStateLabel = steamCmdBusy
    ? steamCmdOperation === "verify-files"
      ? "Verifying…"
      : steamCmdOperation === "update" || steamCmdOperation === "sync-files"
        ? "Updating…"
        : "Installing…"
    : !isInstallationReady
      ? "Not installed"
      : updateAvailable
        ? "Update available"
        : updateState === "current"
          ? "Up to date"
          : "Not verified";

  const byteProgressLabel =
    steamCmdProgressBytesDownloaded !== null && steamCmdProgressBytesTotal !== null
      ? formatSteamCmdByteProgress(
          steamCmdProgressBytesDownloaded,
          steamCmdProgressBytesTotal,
        )
      : null;
  const byteProgressNoun = steamCmdByteProgressNoun(steamCmdOperation);
  const shortProgressLabel =
    byteProgressLabel !== null
      ? (steamCmdProgressLabel?.split(" · ")[0]?.trim()
        || (steamCmdOperation === "verify-files" ? "Verifying" : "SteamCMD in progress…"))
      : (steamCmdProgressLabel
        ?? (steamCmdOperation === "verify-files" ? "Verifying" : "SteamCMD in progress…"));

  const openWorkspace = () => {
    if (!steamCmdBusy) {
      props.onOpenWorkspace();
    }
  };

  const primaryAction =
    steamCmdBusy
      ? {
          label: "Cancel",
          icon: <XCircle size={16} />,
          color: "red",
          variant: "light" as const,
          disabled: false,
          onClick: props.onCancelSteamCmd,
        }
      : !isInstallationReady
        ? {
            label: "Install",
            icon: <CloudArrowDown size={16} />,
            color: "blue",
            variant: "filled" as const,
            disabled: false,
            onClick: props.onInstallFiles,
          }
        : status === "running"
          ? {
              label: "Manage",
              icon: <GearSix size={16} />,
              color: "blue",
              variant: "filled" as const,
              disabled: false,
              onClick: props.onOpenWorkspace,
            }
          : status === "starting"
            ? {
                label: "Starting…",
                icon: <ArrowsClockwise size={16} />,
                color: "blue",
                variant: "light" as const,
                disabled: true,
                onClick: props.onOpenWorkspace,
              }
            : status === "stopping"
              ? {
                  label: "Stopping…",
                  icon: <ArrowsClockwise size={16} />,
                  color: "gray",
                  variant: "light" as const,
                  disabled: true,
                  onClick: props.onOpenWorkspace,
                }
              : status === "error"
                ? {
                    label: "Review error",
                    icon: <XCircle size={16} />,
                    color: "red",
                    variant: "light" as const,
                    disabled: false,
                    onClick: props.onOpenWorkspace,
                  }
                : updateAvailable
                  ? {
                      label: "Update",
                      icon: <CloudArrowDown size={16} />,
                      color: "orange",
                      variant: "light" as const,
                      disabled: false,
                      onClick: props.onUpdateNow,
                    }
                  : {
                      label: "Start",
                      icon: <Play size={16} weight="fill" />,
                      color: "teal",
                      variant: "light" as const,
                      disabled: false,
                      onClick: props.onStart,
                    };

  const rowTone =
    steamCmdBusy
      ? "busy"
      : status === "running"
        ? "running"
        : status === "error"
          ? "error"
          : !isInstallationReady || updateAvailable
            ? "attention"
            : "stopped";

  return (
    <Card
      withBorder
      className={classes.card}
      padding="md"
      radius="md"
      data-tone={rowTone}
      data-server-card
      data-server-name={server.name}
    >
      <Stack gap="sm">
        <div className={classes.mainRow}>
          <UnstyledButton
            className={classes.cardHit}
            onClick={openWorkspace}
            disabled={steamCmdBusy}
            aria-label={`Open settings for ${server.name}`}
          >
            <Group gap="sm" align="center" wrap="nowrap" className={classes.identity}>
              <div className={classes.thumb}>
                <HardDrives size={18} weight="duotone" />
              </div>
              <div className={classes.identityText}>
                <Text className={classes.title} lineClamp={1}>
                  {server.name}
                </Text>
                <Text className={classes.subtitle} c="dimmed" lineClamp={1}>
                  {server.sessionName}
                </Text>
              </div>
              <Badge
                size="xs"
                color={
                  steamCmdBusy
                    ? "blue"
                    : status === "running"
                      ? "green"
                      : status === "error"
                        ? "red"
                        : status === "starting" || status === "stopping"
                          ? "blue"
                          : "gray"
                }
                variant="light"
              >
                {steamCmdBusy ? installStateLabel : (STATUS_LABEL[status] ?? status)}
              </Badge>
            </Group>

            <div className={classes.metaGrid}>
              <MetaItem label="Map" value={server.map} />
              <MetaItem label="Cluster" value={server.clusterId ?? "—"} />
              <MetaItem label="Mods" value={String(server.mods.length)} />
              <MetaItem label="Version" value={localVersion ?? "—"} />
              <MetaItem
                label="Files"
                value={installStateLabel}
                tone={
                  steamCmdBusy
                    ? "warn"
                    : !isInstallationReady || updateAvailable
                      ? "warn"
                      : updateState === "current"
                        ? "ok"
                        : "muted"
                }
              />
            </div>
          </UnstyledButton>

          <Group gap="xs" wrap="nowrap" className={classes.rowActions}>
            <Button
              size="sm"
              variant={primaryAction.variant}
              color={primaryAction.color}
              leftSection={primaryAction.icon}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
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
                    disabled={steamCmdBusy}
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
                {status === "running" && (
                  <>
                    <Menu.Item leftSection={<Pause size={16} />} onClick={props.onStop}>
                      Stop safely
                    </Menu.Item>
                    <Menu.Item leftSection={<ArrowsClockwise size={16} />} onClick={props.onRestart}>
                      Restart
                    </Menu.Item>
                  </>
                )}
                {status === "starting" && (
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
                  disabled={!isInstallationReady}
                >
                  View logs
                </Menu.Item>

                <Menu.Divider />
                <Menu.Label>Maintenance</Menu.Label>
                {isInstallationReady ? (
                  <>
                    <Menu.Item
                      leftSection={<MagnifyingGlass size={16} />}
                      onClick={props.onCheckUpdates}
                      disabled={checkingUpdates}
                    >
                      Check for updates
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<CloudArrowDown size={16} />}
                      color={updateAvailable ? "orange" : undefined}
                      onClick={props.onUpdateNow}
                      disabled={isActive}
                    >
                      {isActive
                        ? "Update (stop the server first)"
                        : "Update server"}
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<ShieldCheck size={16} />}
                      onClick={props.onVerifyFiles}
                      disabled={isActive}
                    >
                      {isActive
                        ? "Verify integrity (stop the server first)"
                        : "Verify integrity"}
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
                  disabled={!isActive}
                >
                  Force close (kill)
                </Menu.Item>
                <Menu.Item
                  color="red"
                  leftSection={<Trash size={16} />}
                  onClick={props.onDelete}
                  disabled={isActive}
                >
                  {isActive ? "Delete (stop the server first)" : "Delete server"}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </div>

        {steamCmdBusy && (
          <Stack gap={6} className={classes.progressBlock}>
            <Group justify="space-between" gap="xs" align="flex-start">
              <div>
                <Text size="sm">{shortProgressLabel}</Text>
                {byteProgressLabel !== null && (
                  <Text size="xs" c="dimmed" mt={2}>
                    {byteProgressNoun}: {byteProgressLabel}
                  </Text>
                )}
              </div>
              {steamCmdProgressPercent !== null && (
                <Text size="sm" c="dimmed">
                  {steamCmdProgressPercent.toFixed(0)}%
                </Text>
              )}
            </Group>
            <Progress
              value={steamCmdProgressPercent ?? 12}
              animated
              striped
              size="sm"
              radius="xl"
            />
          </Stack>
        )}

        {runtime?.lastError !== null && runtime?.lastError !== undefined && (
          <Text c="red" size="sm" className={classes.runtimeError}>
            {runtime.lastError}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

interface MetaItemProps {
  label: string;
  value: string;
  tone?: "default" | "muted" | "ok" | "warn";
}

function MetaItem({ label, value, tone = "default" }: MetaItemProps): JSX.Element {
  return (
    <div className={classes.metaItem}>
      <Text c="dimmed" tt="uppercase" lts={0.04} display="block" fz="xs">
        {label}
      </Text>
      <Text className={classes[`metaValue-${tone}`]} display="block" lineClamp={1} fz="xs">
        {value}
      </Text>
    </div>
  );
}
