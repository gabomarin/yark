import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { useAppFleetRefresh } from "@app/hooks/useAppFleetRefresh";
import type { ProcessMetricsUpdatedPush } from "@shared/ipc";
import type {
  AppEvent,
  ClusterComplianceReport,
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
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import type { RconHistoryEntry } from "@features/server-workspace/ServerWorkspacePage";
import type { DesktopShellPreferencesController } from "@features/settings/hooks/useDesktopShellPreferences";
import type { ThemeId, UiDensity, WorkspacePanelsId } from "@features/settings/settingsModel";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { AppBusyOverlayContent } from "@ui/AppBusyOverlay/AppBusyOverlay";

/** Shared fleet refresh signature used across router overlays and pages. */
type AppRefresh = ReturnType<typeof useAppFleetRefresh>["refresh"];

export interface AppFleetSlice {
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  /** Dedicated-process RAM/CPU samples (#302). */
  processMetricsByServer: Map<string, ProcessMetricsUpdatedPush>;
  events: AppEvent[];
  reports: ClusterComplianceReport[];
  refresh: AppRefresh;
}

interface ServerLifecycleActions {
  startServer: (id: string) => void;
  restartServer: (id: string) => void;
  /** Manual restart with a player warning window (#573). */
  restartServerWithWarning: (id: string) => void;
  cancelRestartWarning: (id: string) => void;
  openServerMaintenance: (serverId: string) => void;
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
  /** Workspace Status panel visible → process metrics sampling (#302). */
  onWorkspaceStatusPanelVisibleChange?: (visible: boolean) => void;
}

export interface AppOverviewSlice {
  overviewLoading: boolean;
  setImportWizardKey: Dispatch<SetStateAction<number>>;
  setImportInstallOpen: Dispatch<SetStateAction<boolean>>;
  installScan: { active: boolean; reason: "startup" | "manual" | null };
  runInstallHealthScan: (reason: "startup" | "manual") => Promise<void>;
  /** Survives Overview unmount, create/clone/import overlays (#438). */
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
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
  themeId: ThemeId;
  handleThemeChange: (theme: ThemeId) => void;
  workspacePanels: WorkspacePanelsId;
  handleWorkspacePanelsChange: (panels: WorkspacePanelsId) => void;
  defaultBaseFolder: string | null;
  setDefaultBaseFolder: Dispatch<SetStateAction<string | null>>;
  extraClusterOptions: KnownClusterOption[] | undefined;
  desktopShell: DesktopShellPreferencesController;
  onRunSetupAgain: () => void;
  /** Bumped when the setup wizard closes so Settings returns to General. */
  landOnGeneralToken: number;
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
