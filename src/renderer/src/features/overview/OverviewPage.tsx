import type {
  AppEvent,
  ClusterComplianceReport,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { Stack } from "@mantine/core";
import { OverviewHeader } from "./components/OverviewHeader";
import { OverviewStats } from "./components/OverviewStats";
import { RecentActivityPanel } from "./components/RecentActivityPanel";
import { ServerGrid } from "./components/ServerGrid";
import classes from "./OverviewPage.module.css";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  onCreateServer: () => void;
  openNativeTerminalOnStart: boolean;
  onOpenNativeTerminalOnStartChange: (enabled: boolean) => void;
  servers: ServerProfile[];
  filteredServers: ServerProfile[];
  runningServers: number;
  okClusters: number;
  warningsCount: number;
  updatesAvailableCount: number;
  reports: ClusterComplianceReport[];
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
  steamCmdOperation?: "install-steamcmd" | "install-files" | "update" | "sync-files" | null;
  onEditServer: (server: ServerProfile) => void;
  onOpenIni: (server: ServerProfile) => void;
  onOpenLogs: (serverId: string) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onKillServer: (serverId: string) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onCloneServer: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onSendRcon: (serverId: string, command: string) => void;
  onCancelSteamCmd: () => void;
}

export function OverviewPage(props: Props): JSX.Element {
  return (
    <div className={classes.page}>
      <OverviewHeader
        search={props.search}
        onSearchChange={props.onSearchChange}
        onCreateServer={props.onCreateServer}
        openNativeTerminalOnStart={props.openNativeTerminalOnStart}
        onOpenNativeTerminalOnStartChange={props.onOpenNativeTerminalOnStartChange}
      />

      <Stack gap="lg" className={classes.content}>
        <OverviewStats
          totalServers={props.servers.length}
          runningServers={props.runningServers}
          okClusters={props.okClusters}
          totalClusters={props.reports.length}
          updatesAvailableCount={props.updatesAvailableCount}
          warningsCount={props.warningsCount}
        />

        <ServerGrid
          servers={props.servers}
          filteredServers={props.filteredServers}
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
          onEditServer={props.onEditServer}
          onOpenIni={props.onOpenIni}
          onOpenLogs={props.onOpenLogs}
          onStartServer={props.onStartServer}
          onStopServer={props.onStopServer}
          onRestartServer={props.onRestartServer}
          onKillServer={props.onKillServer}
          onOpenFolder={props.onOpenFolder}
          onInstallFiles={props.onInstallFiles}
          onUpdateNow={props.onUpdateNow}
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