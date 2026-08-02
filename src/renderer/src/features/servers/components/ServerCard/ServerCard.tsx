import type { ReactElement } from "react";
import { HardDrives } from "@phosphor-icons/react";
import { Badge, Card, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import type { ServerInstallationInfo, ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { ServerRuntimeStatusBadge } from "@ui/ServerRuntimeStatusBadge/ServerRuntimeStatusBadge";
import { ServerCardActions } from "./ServerCardActions";
import { ServerCardMetaItem } from "./ServerCardMetaItem";
import { ServerCardProgress } from "./ServerCardProgress";
import {
  deriveServerCardView,
  type SteamCmdOperation,
} from "./serverCardModel";
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
  steamCmdOperation?: SteamCmdOperation;
  stopBusy?: boolean;
  stopProgressPercent?: number | null;
  stopProgressLabel?: string | null;
  checkingUpdates?: boolean;
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
  onDelete: () => void;
  onCancelSteamCmd: () => void;
  onToggleEnabled?: () => void;
}

export function ServerCard(props: Props): ReactElement {
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
  const status = runtime?.status ?? "stopped";
  const view = deriveServerCardView({
    status,
    installation,
    officialSteamBuild: props.officialSteamBuild,
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
        props.onCancelSteamCmd();
        break;
      case "enable":
        props.onToggleEnabled?.();
        break;
      case "start":
        props.onStart();
        break;
      case "stop":
        props.onStop();
        break;
      case "starting":
      case "stopping":
        break;
    }
  };

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
    >
      <Stack gap="sm">
        <div className={classes.mainRow}>
          <UnstyledButton
            className={classes.cardHit}
            onClick={props.onOpenWorkspace}
            aria-label={
              badgeBusy
                ? `Open ${server.name} (operation in progress)`
                : `Open settings for ${server.name}`
            }
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
              />
            </div>
          </UnstyledButton>

          <ServerCardActions
            status={status}
            isActive={view.isActive}
            isInstallationReady={view.isInstallationReady}
            updateAvailable={view.updateAvailable}
            steamCmdBusy={steamCmdBusy}
            stopBusy={stopBusy}
            checkingUpdates={checkingUpdates}
            runtimeAction={view.runtimeAction}
            restartAction={view.restartAction}
            updateAction={view.updateAction}
            onRuntimeAction={runRuntimeAction}
            onOpenWorkspace={props.onOpenWorkspace}
            onStop={props.onStop}
            onRestart={props.onRestart}
            onOpenFolder={props.onOpenFolder}
            onOpenLogs={props.onOpenLogs}
            onCheckUpdates={props.onCheckUpdates}
            onUpdateNow={props.onUpdateNow}
            onVerifyFiles={props.onVerifyFiles}
            onInstallFiles={props.onInstallFiles}
            onClone={props.onClone}
            onKill={props.onKill}
            onDelete={props.onDelete}
            serverEnabled={server.enabled}
            onToggleEnabled={props.onToggleEnabled}
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
            onClick={props.onReviewError}
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
