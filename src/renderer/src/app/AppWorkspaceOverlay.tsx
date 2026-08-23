import type { Dispatch, ReactElement, SetStateAction } from "react";
import type {
  AppEvent,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
  SteamCmdStatus,
} from "@shared/types";
import type { CopyConfigSession, Overlay } from "@app/model/appOverlay";
import { AppShellWithChrome, type AppShellChromeProps } from "@app/appShellChrome";
import { resolveWorkspaceFilesJobState } from "@app/model/workspaceFilesJobState";
import type { ServerFilesQueueState } from "@features/downloads/downloadsModel";
import {
  ServerWorkspacePage,
  type RconHistoryEntry,
} from "@features/server-workspace/ServerWorkspacePage";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
type WorkspaceOverlay = Extract<Overlay, { kind: "workspace" }>;

export interface AppWorkspaceOverlayProps {
  shell: AppShellChromeProps;
  overlay: WorkspaceOverlay;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  events: AppEvent[];
  rconHistoryByServer: Map<string, RconHistoryEntry[]>;
  playerListsByServer: Map<string, PlayerListState>;
  filesQueueByServerId: Map<string, ServerFilesQueueState>;
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdBusy: boolean;
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
}

export function AppWorkspaceOverlay(props: AppWorkspaceOverlayProps): ReactElement {
  const {
    shell,
    overlay,
    setOverlay,
    servers,
    statuses,
    installationInfo,
    events,
    rconHistoryByServer,
    playerListsByServer,
    filesQueueByServerId,
    steamCmdStatus,
    steamCmdBusy,
    stopProgressByServerId,
    startBusyByServerId,
    registerOverlayLeaveGuard,
    startServer,
    runAction,
    restartServer,
    confirmKillServer,
    setServerEnabled,
    startSteamFilesJob,
    sendRconCommand,
    clearRconHistory,
    onRconTabFocusChanged,
    onRefreshPlayers,
    onKickPlayer,
    onBanPlayer,
    refresh,
    setCopyConfig,
  } = props;

  const filesJob = resolveWorkspaceFilesJobState(
    overlay.serverId,
    filesQueueByServerId,
    steamCmdBusy,
    steamCmdStatus,
  );

  return (
    <AppShellWithChrome shell={shell}>
      <ServerWorkspacePage
        servers={servers}
        selectedServerId={overlay.serverId}
        statuses={statuses}
        installationInfo={installationInfo}
        events={events}
        rconHistory={rconHistoryByServer.get(overlay.serverId) ?? []}
        playerList={
          playerListsByServer.get(overlay.serverId) ?? {
            players: [],
            error: null,
            loading: false,
          }
        }
        onboarding={overlay.onboarding === true}
        initialTab={overlay.initialTab}
        logsFocus={overlay.logsFocus}
        filesJobActive={filesJob.filesJobActive}
        filesJobOperation={filesJob.filesJobOperation}
        filesJobQueueKind={filesJob.filesJobQueueKind}
        filesJobLabel={filesJob.filesJobLabel}
        stopProgress={stopProgressByServerId.get(overlay.serverId) ?? null}
        startBusy={startBusyByServerId.has(overlay.serverId)}
        onLogsFocusConsumed={() =>
          setOverlay((current) =>
            current?.kind === "workspace"
              ? { ...current, logsFocus: null }
              : current,
          )
        }
        onDismissOnboarding={() =>
          setOverlay({ kind: "workspace", serverId: overlay.serverId })
        }
        onSelectServer={(serverId) =>
          setOverlay({
            kind: "workspace",
            serverId,
            initialTab: overlay.initialTab,
            logsFocus: null,
          })
        }
        onRegisterLeaveGuard={registerOverlayLeaveGuard}
        onBack={() => setOverlay(null)}
        onStartServer={(id) => void startServer(id)}
        onStopServer={(id) => void runAction(() => window.api.stopServer(id))}
        onRestartServer={(id) => void restartServer(id)}
        onKillServer={(id) => confirmKillServer(id)}
        onToggleServerEnabled={(id, enabled) => void setServerEnabled(id, enabled)}
        onOpenFolder={(id) => void runAction(() => window.api.openServerFolder(id))}
        onInstallFiles={(id) => startSteamFilesJob(id, "install")}
        onUpdateNow={(id) => startSteamFilesJob(id, "update")}
        onVerifyFiles={(id) => startSteamFilesJob(id, "verify")}
        onSendRcon={(id, command) => sendRconCommand(id, command)}
        onClearRconHistory={clearRconHistory}
        onRconTabFocusChanged={onRconTabFocusChanged}
        onRefreshPlayers={onRefreshPlayers}
        onKickPlayer={onKickPlayer}
        onBanPlayer={onBanPlayer}
        onServerUpdated={() => void refresh()}
        onCopyConfiguration={(id) => setCopyConfig({ sourceServerId: id })}
      />
    </AppShellWithChrome>
  );
}
