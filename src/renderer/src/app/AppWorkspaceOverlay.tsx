import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { Overlay } from "@app/model/appOverlay";
import type {
  AppFleetSlice,
  AppLifecycleSlice,
  AppRconSlice,
  AppSteamCmdSlice,
} from "@app/model/appMainRouterSlices";
import { AppShellWithChrome, type AppShellChromeProps } from "@app/appShellChrome";
import { resolveWorkspaceFilesJobState } from "@app/model/workspaceFilesJobState";
import { ServerWorkspacePage } from "@features/server-workspace/ServerWorkspacePage";

type WorkspaceOverlay = Extract<Overlay, { kind: "workspace" }>;

export interface AppWorkspaceOverlayProps {
  shell: AppShellChromeProps;
  overlay: WorkspaceOverlay;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  fleet: AppFleetSlice;
  lifecycle: AppLifecycleSlice;
  rcon: AppRconSlice;
  steamCmd: AppSteamCmdSlice;
  registerOverlayLeaveGuard: (guard: ((action: () => void) => void) | null) => void;
}

export function AppWorkspaceOverlay(props: AppWorkspaceOverlayProps): ReactElement {
  const {
    shell,
    overlay,
    setOverlay,
    fleet,
    lifecycle,
    rcon,
    steamCmd,
    registerOverlayLeaveGuard,
  } = props;
  const { servers, statuses, installationInfo, events, refresh } = fleet;
  const { stopProgressByServerId, startBusyByServerId, actions } = lifecycle;
  const {
    rconHistoryByServer,
    playerListsByServer,
    sendRconCommand,
    clearRconHistory,
    onRconTabFocusChanged,
    onRefreshPlayers,
    onKickPlayer,
    onBanPlayer,
  } = rcon;
  const {
    filesQueueByServerId,
    steamCmdStatus,
    steamCmdBusy,
    startSteamFilesJob,
  } = steamCmd;

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
        onStartServer={(id) => void actions.startServer(id)}
        onStopServer={(id) => void actions.runAction(() => window.api.stopServer(id))}
        onRestartServer={(id) => void actions.restartServer(id)}
        onKillServer={(id) => actions.confirmKillServer(id)}
        onToggleServerEnabled={(id, enabled) => void actions.setServerEnabled(id, enabled)}
        onOpenFolder={(id) => void actions.runAction(() => window.api.openServerFolder(id))}
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
        onCopyConfiguration={(id) => actions.setCopyConfig({ sourceServerId: id })}
      />
    </AppShellWithChrome>
  );
}
