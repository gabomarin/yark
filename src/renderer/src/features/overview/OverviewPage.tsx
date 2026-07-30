import type {
  AppEvent,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
} from "@shared/types";
import { OverviewHeader } from "./components/OverviewHeader";
import { RecentActivityPanel } from "./components/RecentActivityPanel";
import { ServerGrid } from "./components/ServerGrid";
import classes from "./OverviewPage.module.css";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  loading?: boolean;
  onCreateServer: () => void;
  onCheckUpdates: () => void;
  checkingUpdates?: boolean;
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  runningServers: number;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  officialSteamBuild: string | null;
  events: AppEvent[];
  onViewAllActivity: () => void;
  steamCmdServerId?: string | null;
  steamCmdRunning?: boolean;
  steamCmdBusy?: boolean;
  steamCmdProgressPercent?: number | null;
  steamCmdProgressLabel?: string | null;
  steamCmdProgressBytesDownloaded?: number | null;
  steamCmdProgressBytesTotal?: number | null;
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null;
  stopProgressByServerId?: Map<string, ServerStopProgress>;
  onOpenWorkspace: (server: ServerProfile) => void;
  onOpenLogs: (serverId: string) => void;
  onReviewError: (serverId: string) => void;
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

      <div className={classes.content} data-overview-content>
        <ServerGrid
          search={props.search}
          onSearchChange={props.onSearchChange}
          loading={props.loading ?? false}
          onCreateServer={props.onCreateServer}
          servers={props.servers}
          filteredServers={props.filteredServers}
          runningServers={props.runningServers}
          statuses={props.statuses}
          installationInfo={props.installationInfo}
          officialSteamBuild={props.officialSteamBuild}
          steamCmdServerId={props.steamCmdServerId ?? null}
          steamCmdRunning={props.steamCmdRunning ?? false}
          steamCmdBusy={props.steamCmdBusy ?? props.steamCmdRunning ?? false}
          steamCmdProgressPercent={props.steamCmdProgressPercent ?? null}
          steamCmdProgressLabel={props.steamCmdProgressLabel ?? null}
          steamCmdProgressBytesDownloaded={props.steamCmdProgressBytesDownloaded ?? null}
          steamCmdProgressBytesTotal={props.steamCmdProgressBytesTotal ?? null}
          steamCmdOperation={props.steamCmdOperation ?? null}
          stopProgressByServerId={props.stopProgressByServerId}
          onOpenWorkspace={props.onOpenWorkspace}
          onOpenLogs={props.onOpenLogs}
          onReviewError={props.onReviewError}
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
          onCancelSteamCmd={props.onCancelSteamCmd}
        />

        <RecentActivityPanel
          events={props.events}
          loading={props.loading ?? false}
          onViewAll={props.onViewAllActivity}
        />
      </div>
    </div>
  );
}
