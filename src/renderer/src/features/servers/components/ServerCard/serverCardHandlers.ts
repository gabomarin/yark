import type { ServerProfile } from "@shared/types";

/**
 * Stable Overview/fleet actions for memoized ServerCard (#209).
 * Methods take server id (or profile) so ServerGrid can keep one object identity across polls.
 */
export interface ServerCardHandlers {
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onKillServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onOpenWorkspace: (server: ServerProfile) => void;
  onOpenLogs: (serverId: string) => void;
  onReviewError: (serverId: string) => void;
  onOpenFolder: (serverId: string) => void;
  onInstallFiles: (serverId: string) => void;
  onUpdateNow: (serverId: string) => void;
  onVerifyFiles: (serverId: string) => void;
  onCheckUpdatesForServer: (serverId: string) => void;
  onCloneServer: (serverId: string) => void;
  onCopyConfiguration: (serverId: string) => void;
  onDeleteServer: (serverId: string) => void;
  onCancelSteamCmd: () => void;
  onToggleServerEnabled?: (serverId: string, enabled: boolean) => void;
}
