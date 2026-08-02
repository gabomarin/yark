import type { ReactElement } from "react";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
} from "@shared/types";
import { ServerCard } from "@features/servers/components/ServerCard/ServerCard";

interface Props {
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialSteamBuild: string | null;
  steamCmdServerId: string | null;
  steamCmdRunning: boolean;
  steamCmdBusy?: boolean;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null;
  stopProgressByServerId?: Map<string, ServerStopProgress>;
  checkingUpdates?: boolean;
  onOpenWorkspace: (server: ServerProfile) => void;
  onOpenLogs: (serverId: string) => void;
  onReviewError: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onKillServer: (serverId: string) => void;
  onSetServerEnabled?: (serverId: string, enabled: boolean) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onVerifyFiles: (serverId: string) => void;
  onCheckUpdatesForServer: (serverId: string) => void;
  onCloneServer: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onCancelSteamCmd: () => void;
}

export function ServerGridCards(props: Props): ReactElement {
  return (
    <>
      {props.servers.map((server) => {
        const stopProgress = props.stopProgressByServerId?.get(server.id);
        const stopBusy = stopProgress?.active === true;
        return (
          <ServerCard
            key={server.id}
            server={server}
            runtime={props.statuses.get(server.id) ?? null}
            installation={props.installationInfo.get(server.id) ?? null}
            officialSteamBuild={props.officialSteamBuild}
            steamCmdBusy={
              !stopBusy
              && (props.steamCmdBusy ?? props.steamCmdRunning)
              && props.steamCmdServerId === server.id
            }
            steamCmdProgressPercent={
              props.steamCmdServerId === server.id
                ? (props.steamCmdProgressPercent ?? null)
                : null
            }
            steamCmdProgressLabel={
              props.steamCmdServerId === server.id
                ? (props.steamCmdProgressLabel ?? null)
                : null
            }
            steamCmdProgressBytesDownloaded={
              props.steamCmdServerId === server.id
                ? (props.steamCmdProgressBytesDownloaded ?? null)
                : null
            }
            steamCmdProgressBytesTotal={
              props.steamCmdServerId === server.id
                ? (props.steamCmdProgressBytesTotal ?? null)
                : null
            }
            steamCmdOperation={
              props.steamCmdServerId === server.id ? (props.steamCmdOperation ?? null) : null
            }
            stopBusy={stopBusy}
            stopProgressPercent={stopBusy ? (stopProgress?.percent ?? null) : null}
            stopProgressLabel={stopBusy ? (stopProgress?.label ?? null) : null}
            checkingUpdates={props.checkingUpdates}
            onStart={() => props.onStartServer(server.id)}
            onStop={() => props.onStopServer(server.id)}
            onKill={() => props.onKillServer(server.id)}
            onRestart={() => props.onRestartServer(server.id)}
            onSetEnabled={(enabled) => props.onSetServerEnabled?.(server.id, enabled)}
            onOpenWorkspace={() => props.onOpenWorkspace(server)}
            onOpenLogs={() => props.onOpenLogs(server.id)}
            onReviewError={() => props.onReviewError(server.id)}
            onOpenFolder={() => props.onOpenFolder(server.id)}
            onInstallFiles={() => props.onInstallFiles(server.id)}
            onUpdateNow={() => props.onUpdateNow(server.id)}
            onVerifyFiles={() => props.onVerifyFiles(server.id)}
            onCheckUpdates={() => props.onCheckUpdatesForServer(server.id)}
            onClone={() => props.onCloneServer(server.id)}
            onDelete={() => props.onDeleteServer(server.id)}
            onCancelSteamCmd={props.onCancelSteamCmd}
          />
        );
      })}
    </>
  );
}
