import { memo, type ReactElement } from "react";
import { Badge, Card, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import { useRowContextMenu } from "@ui/RowActionMenu/useRowContextMenu";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import { ServerCardActions } from "./ServerCardActions";
import { ServerCardMetaItem } from "./ServerCardMetaItem";
import { ServerCardProgress } from "./ServerCardProgress";
import { buildServerCardMenuActions } from "./serverCardMenuActions";
import type { ServerCardHandlers } from "./serverCardHandlers";
import {
  deriveServerCardView,
  type SteamCmdOperation,
} from "./serverCardModel";
import classes from "./ServerCard.module.css";

type ServerCardSharedProps = {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  officialSteamBuild: string | null;
  /** Wildcard informational ARK Version (UI only; not used for update decisions). */
  officialVersion?: string | null;
  steamCmdBusy?: boolean;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: SteamCmdOperation;
  stopBusy?: boolean;
  stopProgressPercent?: number | null;
  stopProgressLabel?: string | null;
  checkingUpdates?: boolean;
};

type ServerCardCallbackProps = {
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
  onOpenWorkspace: () => void;
  onOpenLogs: () => void;
  /** Opens the runtime logs section for a failed/crashed launch. */
  onReviewError: () => void;
  onOpenFolder: () => void;
  onInstallFiles: () => void;
  onUpdateNow: () => void;
  onVerifyFiles: () => void;
  onCheckUpdates: () => void;
  onClone: () => void;
  onCopyConfiguration: () => void;
  onDelete: () => void;
  onCancelSteamCmd: () => void;
  onToggleEnabled?: () => void;
};

/** Overview: stable `handlers` bag. Tests/other callers: explicit zero-arg callbacks. */
export type ServerCardProps =
  | (ServerCardSharedProps & { handlers: ServerCardHandlers })
  | (ServerCardSharedProps & ServerCardCallbackProps);

function bindServerCardHandlers(
  handlers: ServerCardHandlers,
  server: ServerProfile,
): ServerCardCallbackProps {
  const id = server.id;
  return {
    onStart: () => handlers.onStartServer(id),
    onStop: () => handlers.onStopServer(id),
    onKill: () => handlers.onKillServer(id),
    onRestart: () => handlers.onRestartServer(id),
    onOpenWorkspace: () => handlers.onOpenWorkspace(server),
    onOpenLogs: () => handlers.onOpenLogs(id),
    onReviewError: () => handlers.onReviewError(id),
    onOpenFolder: () => handlers.onOpenFolder(id),
    onInstallFiles: () => handlers.onInstallFiles(id),
    onUpdateNow: () => handlers.onUpdateNow(id),
    onVerifyFiles: () => handlers.onVerifyFiles(id),
    onCheckUpdates: () => handlers.onCheckUpdatesForServer(id),
    onClone: () => handlers.onCloneServer(id),
    onCopyConfiguration: () => handlers.onCopyConfiguration(id),
    onDelete: () => handlers.onDeleteServer(id),
    onCancelSteamCmd: () => handlers.onCancelSteamCmd(),
    onToggleEnabled: handlers.onToggleServerEnabled
      ? () => handlers.onToggleServerEnabled?.(id, !server.enabled)
      : undefined,
  };
}

function ServerCardComponent(props: ServerCardProps): ReactElement {
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
    stopBusy = false,
    stopProgressPercent = null,
    stopProgressLabel = null,
    checkingUpdates = false,
  } = props;
  const {
    onStart,
    onStop,
    onKill,
    onRestart,
    onOpenWorkspace,
    onOpenLogs,
    onReviewError,
    onOpenFolder,
    onInstallFiles,
    onUpdateNow,
    onVerifyFiles,
    onCheckUpdates,
    onClone,
    onCopyConfiguration,
    onDelete,
    onCancelSteamCmd,
    onToggleEnabled,
  } = "handlers" in props
    ? bindServerCardHandlers(props.handlers, server)
    : props;
  const status = runtime?.status ?? "stopped";
  const view = deriveServerCardView({
    status,
    installation,
    officialSteamBuild: props.officialSteamBuild,
    officialVersion: props.officialVersion,
    steamCmdBusy,
    stopBusy,
    steamCmdOperation,
    steamCmdProgressLabel,
    steamCmdProgressBytesDownloaded,
    steamCmdProgressBytesTotal,
    stopProgressLabel,
    serverEnabled: server.enabled,
  });
  const showProgress = stopBusy || steamCmdBusy;
  const progressPercent = stopBusy ? stopProgressPercent : steamCmdProgressPercent;
  const badgeBusy = stopBusy || steamCmdBusy;

  const runRuntimeAction = (): void => {
    switch (view.runtimeAction.kind) {
      case "cancel":
        onCancelSteamCmd();
        break;
      case "enable":
        onToggleEnabled?.();
        break;
      case "start":
        onStart();
        break;
      case "stop":
        onStop();
        break;
      case "starting":
      case "stopping":
        break;
    }
  };

  const menuDisabled = steamCmdBusy || stopBusy;
  const menuEntries = buildServerCardMenuActions({
    status,
    isActive: view.isActive,
    isInstallationReady: view.isInstallationReady,
    canOfferInstall: view.canOfferInstall,
    updateAvailable: view.updateAvailable,
    steamCmdBusy,
    checkingUpdates,
    updateAction: view.updateAction,
    serverEnabled: server.enabled,
    onOpenWorkspace,
    onStop,
    onRestart,
    onOpenFolder,
    onOpenLogs,
    onCheckUpdates,
    onUpdateNow,
    onVerifyFiles,
    onInstallFiles,
    onClone,
    onCopyConfiguration,
    onKill,
    onDelete,
    onToggleEnabled,
  });
  const { onContextMenu, onKeyDown, menuTriggerProps } = useRowContextMenu(
    menuEntries,
    { disabled: menuDisabled },
  );

  return (
    <Card
      withBorder
      className={classes.card}
      padding="md"
      radius="md"
      data-tone={view.rowTone}
      data-disabled={!server.enabled}
      data-server-card
      data-server-name={server.name}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      {...menuTriggerProps}
    >
      <Stack gap="sm">
        <div className={classes.mainRow}>
          <UnstyledButton
            className={classes.cardHit}
            onClick={onOpenWorkspace}
            aria-label={
              badgeBusy
                ? `Open ${server.name} (operation in progress)`
                : `Open settings for ${server.name}`
            }
          >
            <Group gap="sm" align="center" wrap="nowrap" className={classes.identity}>
              <MapArtThumb
                mapId={server.map}
                mapModId={server.mapModId}
                modThumbnailUrl={
                  server.mapModId
                    ? server.modMetadataCache?.[server.mapModId]?.thumbnailUrl
                    : null
                }
                size="md"
                className={classes.thumb}
              />
              <div className={classes.identityText}>
                <Text className={classes.title} lineClamp={1}>
                  {server.name}
                </Text>
                <Text className={classes.subtitle} c="dimmed" lineClamp={1}>
                  {server.sessionName}
                </Text>
              </div>
              <ServerRuntimeStatusBadge
                status={status}
                label={badgeBusy ? view.installStateLabel : undefined}
                color={badgeBusy ? "blue" : undefined}
              />
              {!server.enabled && (
                <Badge size="sm" variant="light" color="gray">
                  Inactive
                </Badge>
              )}
            </Group>

            <div className={classes.metaGrid} data-meta-grid>
              <ServerCardMetaItem label="Map" value={server.map} />
              <ServerCardMetaItem label="Cluster" value={server.clusterId ?? "—"} />
              <ServerCardMetaItem label="Mods" value={String(server.mods.length)} />
              <ServerCardMetaItem
                label="Version"
                value={view.localVersion ?? "—"}
                tone={view.versionMetaTone}
                hint={view.versionRefreshHint}
              />
            </div>
          </UnstyledButton>

          <ServerCardActions
            status={status}
            isActive={view.isActive}
            isInstallationReady={view.isInstallationReady}
            canOfferInstall={view.canOfferInstall}
            updateAvailable={view.updateAvailable}
            steamCmdBusy={steamCmdBusy}
            stopBusy={stopBusy}
            checkingUpdates={checkingUpdates}
            runtimeAction={view.runtimeAction}
            restartAction={view.restartAction}
            updateAction={view.updateAction}
            onRuntimeAction={runRuntimeAction}
            onOpenWorkspace={onOpenWorkspace}
            onStop={onStop}
            onRestart={onRestart}
            onOpenFolder={onOpenFolder}
            onOpenLogs={onOpenLogs}
            onCheckUpdates={onCheckUpdates}
            onUpdateNow={onUpdateNow}
            onVerifyFiles={onVerifyFiles}
            onInstallFiles={onInstallFiles}
            onClone={onClone}
            onCopyConfiguration={onCopyConfiguration}
            onKill={onKill}
            onDelete={onDelete}
            serverEnabled={server.enabled}
            onToggleEnabled={onToggleEnabled}
          />
        </div>

        {showProgress && (
          <ServerCardProgress
            shortProgressLabel={view.progress.shortProgressLabel}
            byteProgressLabel={view.progress.byteProgressLabel}
            byteProgressNoun={view.progress.byteProgressNoun}
            steamCmdProgressPercent={progressPercent}
          />
        )}

        {runtime?.lastError !== null && runtime?.lastError !== undefined && (
          <UnstyledButton
            className={classes.runtimeError}
            onClick={onReviewError}
            aria-label="Review error — open runtime logs"
          >
            <Text c="red" size="sm" className={classes.runtimeErrorText}>
              {runtime.lastError}
            </Text>
          </UnstyledButton>
        )}
      </Stack>
    </Card>
  );
}

export const ServerCard = memo(ServerCardComponent);
