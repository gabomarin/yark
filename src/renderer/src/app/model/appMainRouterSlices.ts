import type { Dispatch, ReactNode, SetStateAction } from "react";
import type {
  AppEvent,
  ClusterComplianceReport,
  InstallationServersMode,
  OfficialNetworkStatus,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
  SteamCmdCacheKind,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "@shared/types";
import type { CopyConfigSession, Overlay } from "@app/model/appOverlay";
import type { SteamCmdCardJobRef } from "@app/model/steamCmdShellModel";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import type { ServerFilesQueueState } from "@features/downloads/downloadsModel";
import type { ServerLogsFocus } from "@features/logs/ServerLogsPanel";
import type { UpdateAllOutdatedPlan } from "@features/overview/updateAllOutdatedModel";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import type { RconHistoryEntry } from "@features/server-workspace/ServerWorkspacePage";
import type { DesktopShellPreferencesController } from "@features/settings/hooks/useDesktopShellPreferences";
import type { UiDensity } from "@features/settings/settingsModel";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { AppBusyOverlayContent } from "@ui/AppBusyOverlay/AppBusyOverlay";

/** Shared fleet refresh signature used across router overlays and pages. */
export type AppRefresh = (options?: {
  includeInstallation?: boolean;
  includeServerList?: boolean;
  forceOfficialCheck?: boolean;
  serversMode?: InstallationServersMode;
}) => Promise<unknown>;

export interface AppFleetSlice {
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  events: AppEvent[];
  reports: ClusterComplianceReport[];
  refresh: AppRefresh;
}

export interface ServerLifecycleActions {
  startServer: (id: string) => void;
  restartServer: (id: string) => void;
  confirmKillServer: (id: string) => void;
  setServerEnabled: (id: string, enabled: boolean) => void;
  openServerLogs: (serverId: string, focus?: ServerLogsFocus) => void;
  openServerBackups: (serverId: string) => void;
  confirmDeleteServer: (id: string) => void;
  runAction: (action: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
  setCopyConfig: Dispatch<SetStateAction<CopyConfigSession | null>>;
}

export interface AppLifecycleSlice {
  stopProgressByServerId: Map<string, ServerStopProgress>;
  startBusyByServerId: Set<string>;
  actions: ServerLifecycleActions;
}

export interface AppRconSlice {
  rconHistoryByServer: Map<string, RconHistoryEntry[]>;
  playerListsByServer: Map<string, PlayerListState>;
  sendRconCommand: (serverId: string, command: string) => Promise<boolean>;
  clearRconHistory: (serverId: string) => void;
  onRconTabFocusChanged: (serverId: string, isFocused: boolean) => Promise<void>;
  onRefreshPlayers: (serverId: string) => Promise<void>;
  onKickPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  onBanPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
}

export interface AppSteamCmdSlice {
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdConsole: SteamCmdConsoleSnapshot | null;
  steamCmdBusy: boolean;
  officialSteamBuild: string | null;
  filesQueueByServerId: Map<string, ServerFilesQueueState>;
  steamCmdPausedByServerId: Map<string, SteamCmdCardJobRef>;
  steamCmdQueuedByServerId: Map<string, SteamCmdCardJobRef>;
  startSteamFilesJob: (serverId: string, kind: "install" | "update" | "verify") => void;
  runPauseSteamCmd: () => Promise<boolean>;
  openSteamCmdSettings: () => void;
  pickSteamCmdPath: () => void;
  openSteamCmdCache: (kind: SteamCmdCacheKind) => void;
  clearSteamCmdCache: (kind: SteamCmdCacheKind) => void;
}

export interface AppNavigationSlice {
  overlay: Overlay;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  route: Route;
  navigate: (next: Route) => void;
  registerOverlayLeaveGuard: (guard: ((action: () => void) => void) | null) => void;
  runWithOverlayLeaveGuard: (action: () => void) => void;
  consumePendingSetupCluster: () => void;
}

export interface AppOverviewSlice {
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
}

export interface AppSettingsSlice {
  focusYarkUpdates: boolean;
  setFocusYarkUpdates: Dispatch<SetStateAction<boolean>>;
  focusSteamCmd: boolean;
  setFocusSteamCmd: Dispatch<SetStateAction<boolean>>;
  openNativeTerminalOnStart: boolean;
  handleOpenNativeConsoleChange: (enabled: boolean) => void;
  uiDensity: UiDensity;
  handleUiDensityChange: (density: UiDensity) => void;
  defaultBaseFolder: string | null;
  setDefaultBaseFolder: Dispatch<SetStateAction<string | null>>;
  extraClusterOptions: KnownClusterOption[] | undefined;
  desktopShell: DesktopShellPreferencesController;
  onRunSetupAgain: () => void;
}

/** Inputs for `buildShellChrome` / `AppShellChromeProps` (sidebar chrome). */
export interface AppShellChromeInputs {
  officialVersion: string | null;
  officialNetworkStatus: OfficialNetworkStatus;
  yarkUpdateAvailableVersion: string | null;
  onWhatsNewClick: () => void;
  onYarkUpdateClick: () => void;
  stopBusyOverlay: AppBusyOverlayContent | null;
  downloadCount: number;
  downloadsWorkspaceFooter: ReactNode;
}
