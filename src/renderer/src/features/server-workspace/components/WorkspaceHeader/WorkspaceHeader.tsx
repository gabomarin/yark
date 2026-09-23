import type { ReactElement } from "react";
import { Copy, Eye, HardDrives, Play, ShareNetwork, Stop, Wrench } from "@phosphor-icons/react";
import { ActionIcon, Badge, Button, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { isInstallationReady } from "@shared/server/installation-health";
import { resolveDisplayedServerVersion } from "@shared/server/server-version-display";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import { RestartSplitButton } from "@ui/RestartSplitButton/RestartSplitButton";
import { formatMapDisplayName } from "@shared/asa/map-identity";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import { CrashRecoveryHeaderBadge } from "@features/crash-recovery/components/CrashRecoveryHeaderBadge";
import { RconStatusIcon } from "../RconStatusIcon/RconStatusIcon";
import { workspaceHeaderControls } from "./workspaceHeaderControls";
import classes from "./WorkspaceHeader.module.css";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  /** SteamCMD is rewriting this install – block start/restart like a live process. */
  filesJobActive?: boolean;
  filesJobReason?: string;
  /** Optimistic Start/Restart in flight before runtime status updates (#390). */
  startBusy?: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  /** Manual restart with a player warning countdown (#573). */
  onRestartWithWarning?: () => void;
  onCancelRestartWarning?: () => void;
  onToggleEnabled?: () => void;
  onOpenServerSwitcher?: () => void;
  onOpenServerActions?: () => void;
  /** Opens the join-info dialog (#505). */
  onOpenJoinInfo?: () => void;
  /**
   * `open IP:port` when a public IP is known, `null` while it is still unknown
   * (no chip rendered). The command itself is copied by `onCopyJoinCommand`.
   */
  joinCommand?: string | null;
  onCopyJoinCommand?: () => void;
  onCopySessionName?: () => void;
}

export function WorkspaceHeader(props: Props): ReactElement {
  const status = props.runtime?.status ?? "stopped";
  const version = resolveDisplayedServerVersion(props.installation) ?? "–";
  const displayStatus = props.startBusy === true && (status === "stopped" || status === "error") ? "starting" : status;

  return (
    <header className={classes.header}>
      <WorkspaceHeaderIdentity props={props} status={status} displayStatus={displayStatus} version={version} />
      <WorkspaceHeaderActions props={props} status={status} />
    </header>
  );
}

function WorkspaceHeaderIdentity({
  props,
  status,
  displayStatus,
  version,
}: {
  props: Props;
  status: ServerRuntimeInfo["status"];
  displayStatus: ServerRuntimeInfo["status"];
  version: string;
}): ReactElement {
  return (
    <Group gap="sm" align="flex-start" wrap="nowrap" className={classes.identity}>
      <MapArtThumb
        mapId={props.server.map}
        mapModId={props.server.mapModId}
        modThumbnailUrl={
          props.server.mapModId ? props.server.modMetadataCache?.[props.server.mapModId]?.thumbnailUrl : null
        }
        size="lg"
      />
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Group gap="xs" wrap="nowrap">
          <Title order={3} fz="lg" lineClamp={1}>
            {props.server.name}
          </Title>
          <ServerRuntimeStatusBadge status={displayStatus} size="sm" />
          <CrashRecoveryHeaderBadge recovery={props.runtime?.crashRecovery} />
          {status === "running" && <RconStatusIcon serverId={props.server.id} />}
          {!props.server.enabled && (
            <Badge variant="light" color="gray">
              Inactive
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed" lineClamp={1} title={props.server.map} className={classes.mapDetails}>
          {formatMapDisplayName(props.server.map)} · port {props.server.gamePort} · version {version}
        </Text>
        <Group gap="sm" wrap="wrap" align="center" className={classes.details}>
          <Group gap="xs" wrap="nowrap" align="center" className={classes.detailItem}>
            <Text size="xs" c="dimmed">
              Session:
            </Text>
            <Text size="xs" title={props.server.sessionName} className={classes.detailValue}>
              {props.server.sessionName}
            </Text>
            {props.onCopySessionName && (
              <Tooltip label="Copy session name" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="xs"
                  aria-label={`Copy session name ${props.server.sessionName}`}
                  onClick={props.onCopySessionName}
                >
                  <Copy size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
          {props.joinCommand && (
            <Group gap="xs" wrap="nowrap" align="center" className={classes.detailItem}>
              <Text size="xs" c="dimmed">
                Join:
              </Text>
              <Text size="xs" ff="monospace" title={props.joinCommand} className={classes.detailValue}>
                {props.joinCommand}
              </Text>
              {props.onCopyJoinCommand && (
                <Tooltip label="Copy in-game command" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="xs"
                    aria-label={`Copy join command ${props.joinCommand}`}
                    onClick={props.onCopyJoinCommand}
                  >
                    <Copy size={12} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          )}
        </Group>
      </Stack>
    </Group>
  );
}

function WorkspaceHeaderActions({
  props,
  status,
}: {
  props: Props;
  status: ServerRuntimeInfo["status"];
}): ReactElement {
  const isServerDisabled = !props.server.enabled;
  const filesReady = isInstallationReady(props.installation);
  const startBusy = props.startBusy === true;
  const { canStart, canEnable, canStop, canRestart } = workspaceHeaderControls({
    status,
    enabled: props.server.enabled,
    filesJobActive: props.filesJobActive === true,
    filesReady,
    hasToggleEnabled: props.onToggleEnabled !== undefined,
    startBusy,
  });
  const lockTitle = props.filesJobReason ?? "Wait for the file update to finish";
  const installBlockedTitle = props.installation?.guidance ?? "Install files first";
  const startLoading = startBusy && (status === "stopped" || status === "error");
  const restartLoading = startBusy && status === "running";
  const manualRestartPending = props.runtime?.maintenance?.countdown?.kind === "manual";

  return (
    <Stack gap={7} align="flex-end" className={classes.controls}>
      <WorkspaceHeaderPrimaryActions
        props={props}
        isServerDisabled={isServerDisabled}
        filesReady={filesReady}
        canStart={canStart}
        canEnable={canEnable}
        canStop={canStop}
        canRestart={canRestart}
        startLoading={startLoading}
        restartLoading={restartLoading}
        manualRestartPending={manualRestartPending}
        lockTitle={lockTitle}
        installBlockedTitle={installBlockedTitle}
      />
      <WorkspaceHeaderTools props={props} />
    </Stack>
  );
}

function WorkspaceHeaderPrimaryActions({
  props,
  isServerDisabled,
  filesReady,
  canStart,
  canEnable,
  canStop,
  canRestart,
  startLoading,
  restartLoading,
  manualRestartPending,
  lockTitle,
  installBlockedTitle,
}: {
  props: Props;
  isServerDisabled: boolean;
  filesReady: boolean;
  canStart: boolean;
  canEnable: boolean;
  canStop: boolean;
  canRestart: boolean;
  startLoading: boolean;
  restartLoading: boolean;
  manualRestartPending: boolean;
  lockTitle: string;
  installBlockedTitle: string;
}): ReactElement {
  return (
    <Group gap="xs" wrap="nowrap">
      <WorkspaceHeaderStartAction
        props={props}
        isServerDisabled={isServerDisabled}
        filesReady={filesReady}
        canStart={canStart}
        canEnable={canEnable}
        startLoading={startLoading}
        lockTitle={lockTitle}
        installBlockedTitle={installBlockedTitle}
      />
      <RestartSplitButton
        countdown={props.runtime?.maintenance?.countdown ?? null}
        manualRestartWarningsEnabled={props.runtime?.maintenance?.manualRestartWarningsEnabled ?? false}
        canRestartNow={canRestart}
        canRestartWithWarning={canRestart}
        restartBusy={restartLoading}
        title={props.filesJobActive === true ? lockTitle : undefined}
        onRestartNow={props.onRestart}
        onRestartWithWarning={() => props.onRestartWithWarning?.()}
        onCancel={() => props.onCancelRestartWarning?.()}
      />
      <Button
        size="sm"
        color="red"
        variant="filled"
        leftSection={<Stop size={14} weight="fill" />}
        onClick={props.onStop}
        disabled={!canStop || manualRestartPending}
        title={manualRestartPending ? "Cancel the queued restart first" : undefined}
      >
        Stop
      </Button>
    </Group>
  );
}

function WorkspaceHeaderStartAction({
  props,
  isServerDisabled,
  filesReady,
  canStart,
  canEnable,
  startLoading,
  lockTitle,
  installBlockedTitle,
}: {
  props: Props;
  isServerDisabled: boolean;
  filesReady: boolean;
  canStart: boolean;
  canEnable: boolean;
  startLoading: boolean;
  lockTitle: string;
  installBlockedTitle: string;
}): ReactElement {
  if (isServerDisabled) {
    return (
      <Button
        size="sm"
        leftSection={<Eye size={14} weight="fill" color="var(--mantine-color-blue-6)" />}
        onClick={() => props.onToggleEnabled?.()}
        disabled={!canEnable}
        title={props.filesJobActive === true ? lockTitle : undefined}
      >
        Enable
      </Button>
    );
  }

  const startTitle = props.filesJobActive === true ? lockTitle : filesReady ? undefined : installBlockedTitle;
  return (
    <Button
      size="sm"
      variant="filled"
      leftSection={startLoading ? undefined : <Play size={14} weight="fill" />}
      onClick={props.onStart}
      disabled={!canStart}
      loading={startLoading}
      title={startTitle}
    >
      {startLoading ? "Starting…" : "Start"}
    </Button>
  );
}

function WorkspaceHeaderTools({ props }: { props: Props }): ReactElement | null {
  const hasServerTools = props.onOpenServerSwitcher !== undefined && props.onOpenServerActions !== undefined;
  if (props.onOpenJoinInfo === undefined && !hasServerTools) return null;

  return (
    <Group gap={6} wrap="nowrap" className={classes.compactTools}>
      {props.onOpenJoinInfo !== undefined && (
        <Button
          variant="default"
          leftSection={<ShareNetwork size={14} />}
          onClick={props.onOpenJoinInfo}
          title="Share the IP, join command, ports, and password"
        >
          Share connection details
        </Button>
      )}
      {hasServerTools && props.onOpenServerSwitcher && props.onOpenServerActions && (
        <>
          <Button variant="default" leftSection={<HardDrives size={14} />} onClick={props.onOpenServerSwitcher}>
            Switch server
          </Button>
          <Button variant="default" leftSection={<Wrench size={14} />} onClick={props.onOpenServerActions}>
            Status and actions
          </Button>
        </>
      )}
    </Group>
  );
}
