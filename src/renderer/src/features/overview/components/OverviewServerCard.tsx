import type { ReactElement } from "react";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
} from "@shared/types";
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
  checkingUpdates?: boolean;
  handlers: ServerCardHandlers;
}

export function OverviewServerCard(props: Props): ReactElement {
  const stopProgress = props.stopProgressByServerId?.get(props.server.id);
  const stopBusy = stopProgress?.active === true;
  const pausedJob = props.steamCmdPausedByServerId?.get(props.server.id);
  const queuedJob = props.steamCmdQueuedByServerId?.get(props.server.id);
  const liveSteamCmd = props.steamCmdServerId === props.server.id;
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
      stopProgressPercent={stopBusy ? (stopProgress?.percent ?? null) : null}
      stopProgressLabel={stopBusy ? (stopProgress?.label ?? null) : null}
      checkingUpdates={props.checkingUpdates}
      handlers={props.handlers}
    />
  );
}
