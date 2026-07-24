import type {
  AppEvent,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { Stack } from "@mantine/core";
import { OverviewHeader } from "./components/OverviewHeader";
import { RecentActivityPanel } from "./components/RecentActivityPanel";
import { ServerGrid } from "./components/ServerGrid";
import classes from "./OverviewPage.module.css";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateServer: () => void;
  onCheckUpdates: () => void;
  checkingUpdates?: boolean;
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  runningServers: number;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  events: AppEvent[];
  steamCmdServerId?: string | null;
  steamCmdRunning?: boolean;
  steamCmdBusy?: boolean;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null;
  onOpenWorkspace: (server: ServerProfile) => void;
  onOpenLogs: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onKillServer: (serverId: string) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onVerifyFiles: (serverId: string) => void;
  onCheckUpdatesForServer: (serverId: string) => void;
  onCloneServer: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onSendRcon: (serverId: string, command: string) => void;
  onCancelSteamCmd: () => void;
}

export function OverviewPage(props: Props): JSX.Element {
  return (
    <div className={classes.page} data-overview-page>
      <OverviewHeader
        onCreateServer={props.onCreateServer}
        onCheckUpdates={props.onCheckUpdates}
        checkingUpdates={props.checkingUpdates}
      />

      <Stack gap="lg" className={classes.content}>
        <ServerGrid
          search={props.search}
          onSearchChange={props.onSearchChange}
          servers={props.servers}
          filteredServers={props.filteredServers}
          runningServers={props.runningServers}
          statuses={props.statuses}
          installationInfo={props.installationInfo}
          steamCmdServerId={props.steamCmdServerId ?? null}
          steamCmdRunning={props.steamCmdRunning ?? false}
          steamCmdBusy={props.steamCmdBusy ?? props.steamCmdRunning ?? false}
          steamCmdProgressPercent={props.steamCmdProgressPercent ?? null}
          steamCmdProgressLabel={props.steamCmdProgressLabel ?? null}
          steamCmdProgressBytesDownloaded={props.steamCmdProgressBytesDownloaded ?? null}
          steamCmdProgressBytesTotal={props.steamCmdProgressBytesTotal ?? null}
          steamCmdOperation={props.steamCmdOperation ?? null}
          onOpenWorkspace={props.onOpenWorkspace}
          onOpenLogs={props.onOpenLogs}
          onStartServer={props.onStartServer}
          onStopServer={props.onStopServer}
          onRestartServer={props.onRestartServer}
          onKillServer={props.onKillServer}
          onOpenFolder={props.onOpenFolder}
          onInstallFiles={props.onInstallFiles}
          onUpdateNow={props.onUpdateNow}
          onVerifyFiles={props.onVerifyFiles}
          onCheckUpdatesForServer={props.onCheckUpdatesForServer}
          checkingUpdates={props.checkingUpdates}
          onCloneServer={props.onCloneServer}
          onDeleteServer={props.onDeleteServer}
          onSendRcon={props.onSendRcon}
          onCancelSteamCmd={props.onCancelSteamCmd}
        />

        <RecentActivityPanel events={props.events} />
      </Stack>
    </div>
  );
}
