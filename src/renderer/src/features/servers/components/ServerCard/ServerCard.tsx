import { memo, type ReactElement } from "react";
import { Card, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { useUiDensity } from "@app/AppProviders";
import type { ProcessMetricsUpdatedPush } from "@shared/ipc";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import { MapArtThumb } from "@ui/MapArtThumb/MapArtThumb";
import { useRowContextMenu } from "@ui/RowActionMenu/useRowContextMenu";
import { ServerCardActions } from "./ServerCardActions";
import { ServerCardMetaGrid } from "./ServerCardMetaGrid";
import { ServerCardProgress } from "./ServerCardProgress";
import { ServerCardStatusBadges } from "./ServerCardStatusBadges";
import { buildServerCardMenuActions } from "./serverCardMenuActions";
import {
  bindServerCardHandlers,
  type ServerCardCallbackProps,
  type ServerCardHandlers,
} from "./serverCardHandlers";
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
  steamCmdPaused?: boolean;
  steamCmdQueued?: boolean;
  steamCmdQueueLabel?: string | null;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: SteamCmdOperation;
  stopBusy?: boolean;
  startBusy?: boolean;
  stopProgressPercent?: number | null;
  stopProgressLabel?: string | null;
  checkingUpdates?: boolean;
  /** When set, Overview shows online survivor count from the ListPlayers cache (#301). */
  playerList?: PlayerListState | null;
  /** When set, Overview shows dedicated-process RAM / CPU (#302). */
  processMetrics?: ProcessMetricsUpdatedPush | null;
};

/** Overview: stable `handlers` bag. Tests/other callers: explicit zero-arg callbacks. */
export type ServerCardProps =
  | (ServerCardSharedProps & { handlers: ServerCardHandlers })
  | (ServerCardSharedProps & ServerCardCallbackProps);

function ServerCardComponent(props: ServerCardProps): ReactElement {
  const {
    server,
    runtime,
    installation,
    steamCmdBusy = false,
    steamCmdPaused = false,
    steamCmdQueued = false,
    steamCmdQueueLabel = null,
    steamCmdProgressPercent = null,
    steamCmdProgressLabel = null,
    steamCmdProgressBytesDownloaded = null,
    steamCmdProgressBytesTotal = null,
    steamCmdOperation = null,
    stopBusy = false,
    startBusy = false,
    stopProgressPercent = null,
    stopProgressLabel = null,
    checkingUpdates = false,
    playerList,
    processMetrics,
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
    onOpenDownloads,
    onToggleEnabled,
  } = "handlers" in props
    ? bindServerCardHandlers(props.handlers, server)
    : props;
  const density = useUiDensity();
  const compact = density === "compact";
  const status = runtime?.status ?? "stopped";
  const view = deriveServerCardView({
    status,
    installation,
    officialSteamBuild: props.officialSteamBuild,
    officialVersion: props.officialVersion,
    steamCmdBusy,
    steamCmdPaused,
    steamCmdQueued,
    stopBusy,
    startBusy,
    steamCmdOperation,
    steamCmdProgressLabel:
      (steamCmdQueued || steamCmdPaused) && !steamCmdBusy
        ? steamCmdQueueLabel ?? steamCmdProgressLabel
        : steamCmdProgressLabel,
    steamCmdProgressBytesDownloaded,
    steamCmdProgressBytesTotal,
    stopProgressLabel,
    serverEnabled: server.enabled,
  });
  const showProgress = stopBusy || steamCmdBusy || steamCmdPaused || steamCmdQueued;
  const progressPercent = stopBusy
    ? stopProgressPercent
    : steamCmdQueued && !steamCmdBusy
      ? null
      : steamCmdProgressPercent;
  const showProgressBar = stopBusy || steamCmdBusy;
  const badgeBusy = stopBusy || steamCmdBusy || steamCmdPaused || steamCmdQueued;
  const filesJobBadge =
    !stopBusy && (steamCmdBusy || steamCmdPaused || steamCmdQueued);
  const filesJobProgressCta = filesJobBadge && onOpenDownloads !== undefined;
  const workspaceOpenLabel =
    steamCmdQueued && !steamCmdBusy
      ? `Open ${server.name} (job queued in Downloads)`
      : badgeBusy
        ? `Open ${server.name} (operation in progress)`
        : `Open settings for ${server.name}`;

  const runRuntimeAction = (): void => {
    switch (view.runtimeAction.kind) {
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

  const menuDisabled = steamCmdBusy || steamCmdPaused || stopBusy;
  const menuEntries = buildServerCardMenuActions({
    status,
    isActive: view.isActive,
    isInstallationReady: view.isInstallationReady,
    canOfferInstall: view.canOfferInstall,
    updateAvailable: view.updateAvailable,
    steamCmdBusy: steamCmdBusy || steamCmdPaused,
    filesLocked: steamCmdBusy || steamCmdPaused || steamCmdQueued,
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
      padding={compact ? "sm" : "md"}
      radius={0}
      data-tone={view.rowTone}
      data-disabled={!server.enabled}
      data-queued={steamCmdQueued || undefined}
      data-ui-density={density}
      data-server-card
      data-server-name={server.name}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      {...menuTriggerProps}
    >
      <Stack gap={compact ? "xs" : "sm"}>
        <div className={classes.mainRow}>
          <div className={classes.cardHit}>
            <div className={classes.identityRow}>
              <UnstyledButton
                className={classes.identityOpen}
                onClick={onOpenWorkspace}
                aria-label={workspaceOpenLabel}
              >
                <Group
                  gap={compact ? "xs" : "sm"}
                  align="center"
                  wrap="nowrap"
                  className={classes.identity}
                >
                  <MapArtThumb
                    mapId={server.map}
                    mapModId={server.mapModId}
                    modThumbnailUrl={
                      server.mapModId
                        ? server.modMetadataCache?.[server.mapModId]?.thumbnailUrl
                        : null
                    }
                    size={compact ? "md" : "lg"}
                    shape="rounded"
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
                </Group>
              </UnstyledButton>

              <ServerCardStatusBadges
                status={status}
                startBusy={startBusy}
                stopBusy={stopBusy}
                serverEnabled={server.enabled}
                compact={compact}
              />
            </div>

            <ServerCardMetaGrid
              server={server}
              status={status}
              localVersion={view.localVersion}
              versionMetaTone={view.versionMetaTone}
              versionRefreshHint={view.versionRefreshHint}
              playerList={playerList}
              processMetrics={processMetrics}
              workspaceOpenLabel={workspaceOpenLabel}
              onOpenWorkspace={onOpenWorkspace}
            />
          </div>

          <ServerCardActions
            status={status}
            isActive={view.isActive}
            isInstallationReady={view.isInstallationReady}
            canOfferInstall={view.canOfferInstall}
            updateAvailable={view.updateAvailable}
            steamCmdBusy={steamCmdBusy || steamCmdPaused}
            filesLocked={steamCmdBusy || steamCmdPaused || steamCmdQueued}
            verifyFilesLocked={view.verifyFilesLocked}
            installFilesLocked={view.installFilesLocked}
            stopBusy={stopBusy}
            startBusy={startBusy}
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
            showProgressBar={showProgressBar}
            onOpenDownloads={
              filesJobProgressCta
                ? () => {
                    onOpenDownloads?.();
                  }
                : undefined
            }
          />
        )}

        {runtime?.lastError !== null && runtime?.lastError !== undefined && (
          <UnstyledButton
            className={classes.runtimeError}
            onClick={onReviewError}
            aria-label="Review error – open runtime logs"
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
