import { HardDrives } from "@phosphor-icons/react";
import { Card, Group, Stack, Text, UnstyledButton } from "@mantine/core";
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
}

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
  const view = deriveServerCardView({
    status,
    installation,
    officialSteamBuild: props.officialSteamBuild,
    steamCmdBusy,
    steamCmdOperation,
    steamCmdProgressLabel,
    steamCmdProgressBytesDownloaded,
    steamCmdProgressBytesTotal,
  });

  const runRuntimeAction = (): void => {
    switch (view.runtimeAction.kind) {
      case "cancel":
        props.onCancelSteamCmd();
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
      data-server-card
      data-server-name={server.name}
    >
      <Stack gap="sm">
        <div className={classes.mainRow}>
          <UnstyledButton
            className={classes.cardHit}
            onClick={props.onOpenWorkspace}
            aria-label={
              steamCmdBusy
                ? `Open ${server.name} (files job in progress)`
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
                label={steamCmdBusy ? view.installStateLabel : undefined}
                color={steamCmdBusy ? "blue" : undefined}
              />
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
          />
        </div>

        {steamCmdBusy && (
          <ServerCardProgress
            shortProgressLabel={view.progress.shortProgressLabel}
            byteProgressLabel={view.progress.byteProgressLabel}
            byteProgressNoun={view.progress.byteProgressNoun}
            steamCmdProgressPercent={steamCmdProgressPercent}
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
