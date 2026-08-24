import type { ReactElement } from "react";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
} from "@shared/types";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import { ServerCard } from "@features/servers/components/ServerCard/ServerCard";
import type { ServerCardHandlers } from "@features/servers/components/ServerCard/serverCardHandlers";
import type { SteamCmdCardJobRef } from "./serverGridTypes";

interface Props {
  server: ServerProfile;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialSteamBuild: string | null;
  officialVersion?: string | null;
  steamCmdServerId: string | null;
  steamCmdRunning?: boolean;
  steamCmdBusy: boolean;
  steamCmdPausedByServerId?: ReadonlyMap<string, SteamCmdCardJobRef>;
  steamCmdQueuedByServerId?: ReadonlyMap<string, SteamCmdCardJobRef>;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?:
    | "install-steamcmd"
    | "install-files"
    | "update"
    | "sync-files"
    | "verify-files"
    | null;
  stopProgressByServerId?: Map<string, ServerStopProgress>;
  startBusyByServerId?: ReadonlySet<string>;
  checkingUpdates?: boolean;
  playerList?: PlayerListState | null;
  handlers: ServerCardHandlers;
}

export function OverviewServerCard(props: Props): ReactElement {
  const stopProgress = props.stopProgressByServerId?.get(props.server.id);
  const stopBusy = stopProgress?.active === true;
  const startBusy = props.startBusyByServerId?.has(props.server.id) === true;
  const pausedJob = props.steamCmdPausedByServerId?.get(props.server.id);
  const queuedJob = props.steamCmdQueuedByServerId?.get(props.server.id);
  const liveSteamCmd =
    props.steamCmdRunning === true && props.steamCmdServerId === props.server.id;
  const overlayJob = pausedJob ?? queuedJob;

  return (
    <ServerCard
      server={props.server}
      runtime={props.statuses.get(props.server.id) ?? null}
      installation={props.installationInfo.get(props.server.id) ?? null}
      officialSteamBuild={props.officialSteamBuild}
      officialVersion={props.officialVersion}
      steamCmdBusy={!stopBusy && props.steamCmdBusy && liveSteamCmd}
      steamCmdPaused={pausedJob !== undefined}
      steamCmdQueued={queuedJob !== undefined}
      steamCmdQueueLabel={overlayJob?.label ?? null}
      steamCmdProgressPercent={liveSteamCmd ? (props.steamCmdProgressPercent ?? null) : null}
      steamCmdProgressLabel={liveSteamCmd ? (props.steamCmdProgressLabel ?? null) : null}
      steamCmdProgressBytesDownloaded={
        liveSteamCmd ? (props.steamCmdProgressBytesDownloaded ?? null) : null
      }
      steamCmdProgressBytesTotal={
        liveSteamCmd ? (props.steamCmdProgressBytesTotal ?? null) : null
      }
      steamCmdOperation={
        liveSteamCmd
          ? (props.steamCmdOperation ?? null)
          : (overlayJob?.operation ?? null)
      }
      stopBusy={stopBusy}
      startBusy={startBusy}
      stopProgressPercent={stopBusy ? (stopProgress?.percent ?? null) : null}
      stopProgressLabel={stopBusy ? (stopProgress?.label ?? null) : null}
      checkingUpdates={props.checkingUpdates}
      playerList={props.playerList}
      handlers={props.handlers}
    />
  );
}
