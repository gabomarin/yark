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
  onOpenDownloads?: (serverId: string) => void;
  onToggleServerEnabled?: (serverId: string, enabled: boolean) => void;
}

export type ServerCardCallbackProps = {
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
  onOpenWorkspace: () => void;
  onOpenLogs: () => void;
  onReviewError: () => void;
  onOpenFolder: () => void;
  onInstallFiles: () => void;
  onUpdateNow: () => void;
  onVerifyFiles: () => void;
  onCheckUpdates: () => void;
  onClone: () => void;
  onCopyConfiguration: () => void;
  onDelete: () => void;
  onOpenDownloads?: () => void;
  onToggleEnabled?: () => void;
};

export function bindServerCardHandlers(
  handlers: ServerCardHandlers,
  server: ServerProfile,
): ServerCardCallbackProps {
  const id = server.id;
  return {
    onStart: () => handlers.onStartServer(id),
    onStop: () => handlers.onStopServer(id),
    onKill: () => handlers.onKillServer(id),
    onRestart: () => handlers.onRestartServer(id),
    onOpenWorkspace: () => handlers.onOpenWorkspace(server),
    onOpenLogs: () => handlers.onOpenLogs(id),
    onReviewError: () => handlers.onReviewError(id),
    onOpenFolder: () => handlers.onOpenFolder(id),
    onInstallFiles: () => handlers.onInstallFiles(id),
    onUpdateNow: () => handlers.onUpdateNow(id),
    onVerifyFiles: () => handlers.onVerifyFiles(id),
    onCheckUpdates: () => handlers.onCheckUpdatesForServer(id),
    onClone: () => handlers.onCloneServer(id),
    onCopyConfiguration: () => handlers.onCopyConfiguration(id),
    onDelete: () => handlers.onDeleteServer(id),
    onOpenDownloads: handlers.onOpenDownloads
      ? () => handlers.onOpenDownloads?.(id)
      : undefined,
    onToggleEnabled: handlers.onToggleServerEnabled
      ? () => handlers.onToggleServerEnabled?.(id, !server.enabled)
      : undefined,
  };
}
