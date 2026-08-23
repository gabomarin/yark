import type { Dispatch, ReactElement, SetStateAction } from "react";
import type {
  AppEvent,
  ClusterComplianceReport,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
  OfficialNetworkStatus,
  SteamCmdCacheKind,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "@shared/types";
import type { ServerLogsFocus } from "@features/logs/ServerLogsPanel";
import { AppFormOverlays } from "@app/AppFormOverlays";
import { AppRouterPages } from "@app/AppRouterPages";
import { AppWorkspaceOverlay } from "@app/AppWorkspaceOverlay";
import type { CopyConfigSession, Overlay } from "@app/appOverlay";
import type { AppShellChromeProps } from "@app/appShellChrome";
import type { SteamCmdCardJobRef } from "@app/steamCmdShellModel";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import type { ServerFilesQueueState } from "@features/downloads/downloadsModel";
import type { UpdateAllOutdatedPlan } from "@features/overview/updateAllOutdatedModel";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import type { RconHistoryEntry } from "@features/server-workspace/ServerWorkspacePage";
import type { DesktopShellPreferencesController } from "@features/settings/useDesktopShellPreferences";
import type { UiDensity } from "@features/settings/settingsModel";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { AppBusyOverlayContent } from "@ui/AppBusyOverlay/AppBusyOverlay";
import type { ReactNode } from "react";

export interface AppMainRouterProps {
  overlay: Overlay;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  route: Route;
  navigate: (next: Route) => void;
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  events: AppEvent[];
  rconHistoryByServer: Map<string, RconHistoryEntry[]>;
  playerListsByServer: Map<string, PlayerListState>;
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdConsole: SteamCmdConsoleSnapshot | null;
  steamCmdBusy: boolean;
  officialVersion: string | null;
  officialNetworkStatus: OfficialNetworkStatus;
  officialSteamBuild: string | null;
  yarkUpdateAvailableVersion: string | null;
  onWhatsNewClick: () => void;
  onYarkUpdateClick: () => void;
  stopBusyOverlay: AppBusyOverlayContent | null;
  downloadCount: number;
  downloadsWorkspaceFooter: ReactNode;
  filesQueueByServerId: Map<string, ServerFilesQueueState>;
  stopProgressByServerId: Map<string, ServerStopProgress>;
  startBusyByServerId: Set<string>;
  registerOverlayLeaveGuard: (guard: ((action: () => void) => void) | null) => void;
  startServer: (id: string) => void;
  runAction: (action: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
  restartServer: (id: string) => void;
  confirmKillServer: (id: string) => void;
  setServerEnabled: (id: string, enabled: boolean) => void;
  startSteamFilesJob: (serverId: string, kind: "install" | "update" | "verify") => void;
  sendRconCommand: (serverId: string, command: string) => Promise<boolean>;
  clearRconHistory: (serverId: string) => void;
  onRconTabFocusChanged: (serverId: string, isFocused: boolean) => Promise<void>;
  onRefreshPlayers: (serverId: string) => Promise<void>;
  onKickPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  onBanPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  refresh: (options?: {
    includeInstallation?: boolean;
    includeServerList?: boolean;
    forceOfficialCheck?: boolean;
    serversMode?: import("@shared/types").InstallationServersMode;
  }) => Promise<unknown>;
  setCopyConfig: Dispatch<SetStateAction<CopyConfigSession | null>>;
  defaultBaseFolder: string | null;
  extraClusterOptions: KnownClusterOption[] | undefined;
  runWithOverlayLeaveGuard: (action: () => void) => void;
  consumePendingSetupCluster: () => void;
  search: string;
  setSearch: (value: string) => void;
  overviewLoading: boolean;
  setImportWizardKey: Dispatch<SetStateAction<number>>;
  setImportInstallOpen: Dispatch<SetStateAction<boolean>>;
  checkingUpdates: boolean;
  checkForUpdates: (serverId?: string) => Promise<void>;
  installScan: { active: boolean; reason: "startup" | "manual" | null };
  runInstallHealthScan: (reason: "startup" | "manual") => Promise<void>;
  canUpdateAllOutdated: boolean;
  updateAllOutdatedLoading: boolean;
  openUpdateAllOutdated: () => Promise<void>;
  updateAllOutdatedOpen: boolean;
  updateAllOutdatedModalPlan: UpdateAllOutdatedPlan | null;
  updateAllOutdatedQueueing: boolean;
  closeUpdateAllOutdated: () => void;
  confirmUpdateAllOutdated: () => Promise<void>;
  filteredServers: ServerProfile[];
  filteredDisabledServers: ServerProfile[];
  runningServers: number;
  steamCmdPausedByServerId: Map<string, SteamCmdCardJobRef>;
  steamCmdQueuedByServerId: Map<string, SteamCmdCardJobRef>;
  openServerLogs: (serverId: string, focus?: ServerLogsFocus) => void;
  confirmDeleteServer: (id: string) => void;
  runPauseSteamCmd: () => Promise<boolean>;
  openSteamCmdSettings: () => void;
  reports: ClusterComplianceReport[];
  openServerBackups: (serverId: string) => void;
  focusYarkUpdates: boolean;
  setFocusYarkUpdates: Dispatch<SetStateAction<boolean>>;
  focusSteamCmd: boolean;
  setFocusSteamCmd: Dispatch<SetStateAction<boolean>>;
  openNativeTerminalOnStart: boolean;
  handleOpenNativeConsoleChange: (enabled: boolean) => void;
  uiDensity: UiDensity;
  handleUiDensityChange: (density: UiDensity) => void;
  setDefaultBaseFolder: Dispatch<SetStateAction<string | null>>;
  pickSteamCmdPath: () => void;
  openSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  clearSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  desktopShell: DesktopShellPreferencesController;
  onRunSetupAgain: () => void;
}

function buildShellChrome(props: AppMainRouterProps): AppShellChromeProps {
  return {
    navigate: props.navigate,
    steamCmdDetected: props.steamCmdStatus?.detected === true,
    steamCmdRunning: props.steamCmdBusy,
    officialVersion: props.officialVersion,
    officialNetworkStatus: props.officialNetworkStatus,
    yarkUpdateAvailableVersion: props.yarkUpdateAvailableVersion,
    onWhatsNewClick: props.onWhatsNewClick,
    onYarkUpdateClick: props.onYarkUpdateClick,
    busyOverlay: props.stopBusyOverlay,
    downloadCount: props.downloadCount,
    workspaceFooter: props.downloadsWorkspaceFooter,
  };
}

export function AppMainRouter(props: AppMainRouterProps): ReactElement {
  const shell = buildShellChrome(props);

  if (props.overlay?.kind === "workspace") {
    return (
      <AppWorkspaceOverlay
        shell={shell}
        overlay={props.overlay}
        setOverlay={props.setOverlay}
        servers={props.servers}
        statuses={props.statuses}
        installationInfo={props.installationInfo}
        events={props.events}
        rconHistoryByServer={props.rconHistoryByServer}
        playerListsByServer={props.playerListsByServer}
        filesQueueByServerId={props.filesQueueByServerId}
        steamCmdStatus={props.steamCmdStatus}
        steamCmdBusy={props.steamCmdBusy}
        stopProgressByServerId={props.stopProgressByServerId}
        startBusyByServerId={props.startBusyByServerId}
        registerOverlayLeaveGuard={props.registerOverlayLeaveGuard}
        startServer={props.startServer}
        runAction={props.runAction}
        restartServer={props.restartServer}
        confirmKillServer={props.confirmKillServer}
        setServerEnabled={props.setServerEnabled}
        startSteamFilesJob={props.startSteamFilesJob}
        sendRconCommand={props.sendRconCommand}
        clearRconHistory={props.clearRconHistory}
        onRconTabFocusChanged={props.onRconTabFocusChanged}
        onRefreshPlayers={props.onRefreshPlayers}
        onKickPlayer={props.onKickPlayer}
        onBanPlayer={props.onBanPlayer}
        refresh={props.refresh}
        setCopyConfig={props.setCopyConfig}
      />
    );
  }

  if (props.overlay?.kind === "create" || props.overlay?.kind === "edit") {
    return (
      <AppFormOverlays
        shell={shell}
        overlay={props.overlay}
        setOverlay={props.setOverlay}
        navigate={props.navigate}
        servers={props.servers}
        defaultBaseFolder={props.defaultBaseFolder}
        extraClusterOptions={props.extraClusterOptions}
        registerOverlayLeaveGuard={props.registerOverlayLeaveGuard}
        runWithOverlayLeaveGuard={props.runWithOverlayLeaveGuard}
        consumePendingSetupCluster={props.consumePendingSetupCluster}
        refresh={props.refresh}
      />
    );
  }

  return (
    <AppRouterPages
      shell={shell}
      route={props.route}
      setOverlay={props.setOverlay}
      servers={props.servers}
      statuses={props.statuses}
      installationInfo={props.installationInfo}
      events={props.events}
      steamCmdStatus={props.steamCmdStatus}
      steamCmdConsole={props.steamCmdConsole}
      steamCmdBusy={props.steamCmdBusy}
      officialSteamBuild={props.officialSteamBuild}
      search={props.search}
      setSearch={props.setSearch}
      overviewLoading={props.overviewLoading}
      setImportWizardKey={props.setImportWizardKey}
      setImportInstallOpen={props.setImportInstallOpen}
      checkingUpdates={props.checkingUpdates}
      checkForUpdates={props.checkForUpdates}
      installScan={props.installScan}
      runInstallHealthScan={props.runInstallHealthScan}
      canUpdateAllOutdated={props.canUpdateAllOutdated}
      updateAllOutdatedLoading={props.updateAllOutdatedLoading}
      openUpdateAllOutdated={props.openUpdateAllOutdated}
      updateAllOutdatedOpen={props.updateAllOutdatedOpen}
      updateAllOutdatedModalPlan={props.updateAllOutdatedModalPlan}
      updateAllOutdatedQueueing={props.updateAllOutdatedQueueing}
      closeUpdateAllOutdated={props.closeUpdateAllOutdated}
      confirmUpdateAllOutdated={props.confirmUpdateAllOutdated}
      filteredServers={props.filteredServers}
      filteredDisabledServers={props.filteredDisabledServers}
      runningServers={props.runningServers}
      steamCmdPausedByServerId={props.steamCmdPausedByServerId}
      steamCmdQueuedByServerId={props.steamCmdQueuedByServerId}
      stopProgressByServerId={props.stopProgressByServerId}
      startBusyByServerId={props.startBusyByServerId}
      openServerLogs={props.openServerLogs}
      confirmDeleteServer={props.confirmDeleteServer}
      runAction={props.runAction}
      runPauseSteamCmd={props.runPauseSteamCmd}
      openSteamCmdSettings={props.openSteamCmdSettings}
      reports={props.reports}
      openServerBackups={props.openServerBackups}
      focusYarkUpdates={props.focusYarkUpdates}
      setFocusYarkUpdates={props.setFocusYarkUpdates}
      focusSteamCmd={props.focusSteamCmd}
      setFocusSteamCmd={props.setFocusSteamCmd}
      openNativeTerminalOnStart={props.openNativeTerminalOnStart}
      handleOpenNativeConsoleChange={props.handleOpenNativeConsoleChange}
      uiDensity={props.uiDensity}
      handleUiDensityChange={props.handleUiDensityChange}
      setDefaultBaseFolder={props.setDefaultBaseFolder}
      pickSteamCmdPath={props.pickSteamCmdPath}
      openSteamCmdCache={props.openSteamCmdCache}
      clearSteamCmdCache={props.clearSteamCmdCache}
      desktopShell={props.desktopShell}
      onRunSetupAgain={props.onRunSetupAgain}
      startServer={props.startServer}
      restartServer={props.restartServer}
      confirmKillServer={props.confirmKillServer}
      setServerEnabled={props.setServerEnabled}
      startSteamFilesJob={props.startSteamFilesJob}
      setCopyConfig={props.setCopyConfig}
      defaultBaseFolder={props.defaultBaseFolder}
      refresh={props.refresh}
    />
  );
}
