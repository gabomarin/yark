import type { ProcessMetricsUpdatedPush } from "@shared/ipc";
import type {
  AppEvent,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
} from "@shared/types";
import type { ServerLogsFocus } from "@features/logs/ServerLogsPanel";
import type { PlayerListState } from "./components/RconPanel/PlayerListSection";
import type { RconHistoryEntry, WorkspaceTab } from "./serverWorkspaceTypes";

export interface ServerWorkspacePageProps {
  servers: ServerProfile[];
  selectedServerId: string;
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  events: AppEvent[];
  onboarding?: boolean;
  initialTab?: WorkspaceTab;
  logsFocus?: ServerLogsFocus | null;
  rconHistory: RconHistoryEntry[];
  playerList: PlayerListState;
  /** Dedicated-process RAM/CPU sample for Status (#302). */
  processMetrics?: ProcessMetricsUpdatedPush | null;
  onLogsFocusConsumed?: () => void;
  /** SteamCMD is rewriting this server's install (install/update/verify/sync). */
  filesJobActive?: boolean;
  filesJobLabel?: string | null;
  filesJobOperation?: "install-files" | "update" | "verify-files" | null;
  filesJobQueueKind?: "active" | "paused" | "queued" | null;
  /** Safe stop in progress for the selected server (SaveWorld → backup → DoExit). */
  stopProgress?: ServerStopProgress | null;
  /** Optimistic Start/Restart in flight before runtime status updates (#390). */
  startBusy?: boolean;
  onDismissOnboarding?: () => void;
  onSelectServer: (serverId: string) => void;
  onBack: () => void;
  /** Register dirty-leave guard so shell navigation (sidebar) can confirm before closing workspace. */
  onRegisterLeaveGuard?: (guard: ((action: () => void) => void) | null) => void;
  /** Status panel visible (wide always; compact when drawer open) (#302). */
  onStatusPanelVisibleChange?: (visible: boolean) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onKillServer: (serverId: string) => void;
  onToggleServerEnabled?: (serverId: string, enabled: boolean) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onVerifyFiles: (serverId: string) => void;
  onSendRcon: (serverId: string, command: string) => Promise<boolean>;
  onClearRconHistory: (serverId: string) => void;
  onRconTabFocusChanged: (serverId: string, isFocused: boolean) => Promise<void>;
  onRefreshPlayers: (serverId: string) => Promise<void>;
  onKickPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  onBanPlayer: (serverId: string, playerKey: string) => Promise<boolean>;
  onServerUpdated: () => void;
  onCopyConfiguration: (serverId: string) => void;
}
