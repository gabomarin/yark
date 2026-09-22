import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { Overlay } from "@app/model/appOverlay";
import type { AppFleetSlice, AppLifecycleSlice, AppRconSlice, AppSteamCmdSlice } from "@app/model/appMainRouterSlices";
import { AppShellWithChrome, type AppShellChromeProps } from "@app/appShellChrome";
import { resolveWorkspaceFilesJobState } from "@app/model/workspaceFilesJobState";
import { ServerWorkspacePage } from "@features/server-workspace/ServerWorkspacePage";
import type { HostedResourceReferenceDto } from "@shared/ipc";

type WorkspaceOverlay = Extract<Overlay, { kind: "workspace" }>;

/** Stable identity so a server without references does not re-create the prop on every render. */
const EMPTY_HOSTED_RESOURCE_REFERENCES: HostedResourceReferenceDto[] = [];

export interface AppWorkspaceOverlayProps {
  shell: AppShellChromeProps;
  overlay: WorkspaceOverlay;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  fleet: AppFleetSlice;
  lifecycle: AppLifecycleSlice;
  rcon: AppRconSlice;
  steamCmd: AppSteamCmdSlice;
  registerOverlayLeaveGuard: (guard: ((action: () => void) => void) | null) => void;
  onStatusPanelVisibleChange?: (visible: boolean) => void;
  hostedResourceReferencesByServerId: Map<string, HostedResourceReferenceDto[]>;
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
    onStatusPanelVisibleChange,
  } = props;
  const { servers, statuses, installationInfo, processMetricsByServer, events, refresh } = fleet;
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
  const { filesQueueByServerId, steamCmdStatus, steamCmdBusy, startSteamFilesJob } = steamCmd;

  const filesJob = resolveWorkspaceFilesJobState(overlay.serverId, filesQueueByServerId, steamCmdBusy, steamCmdStatus);

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
        processMetrics={processMetricsByServer.get(overlay.serverId) ?? null}
        onboarding={overlay.onboarding === true}
        initialTab={overlay.initialTab}
        initialRconFocus={overlay.initialRconFocus}
        logsFocus={overlay.logsFocus}
        filesJobActive={filesJob.filesJobActive}
        filesJobOperation={filesJob.filesJobOperation}
        filesJobQueueKind={filesJob.filesJobQueueKind}
        filesJobLabel={filesJob.filesJobLabel}
        stopProgress={stopProgressByServerId.get(overlay.serverId) ?? null}
        startBusy={startBusyByServerId.has(overlay.serverId)}
        onLogsFocusConsumed={() =>
          setOverlay((current) => (current?.kind === "workspace" ? { ...current, logsFocus: null } : current))
        }
        // Clearing the focus once taken mirrors logsFocus, so a remount or a second click on
        // the same reference does not keep re-forcing the RCON players panel.
        onRconFocusConsumed={() =>
          setOverlay((current) =>
            current?.kind === "workspace" ? { ...current, initialRconFocus: undefined } : current,
          )
        }
        onDismissOnboarding={() => setOverlay({ kind: "workspace", serverId: overlay.serverId })}
        onSelectServer={(serverId) =>
          setOverlay({
            kind: "workspace",
            serverId,
            initialTab: overlay.initialTab,
            initialRconFocus: overlay.initialRconFocus,
            logsFocus: null,
          })
        }
        onRegisterLeaveGuard={registerOverlayLeaveGuard}
        onStatusPanelVisibleChange={onStatusPanelVisibleChange}
        hostedResourceReferences={
          props.hostedResourceReferencesByServerId.get(overlay.serverId) ?? EMPTY_HOSTED_RESOURCE_REFERENCES
        }
        onOpenHostedResources={() => props.shell.navigate("hostedResources")}
        onBack={() => setOverlay(null)}
        onStartServer={(id) => void actions.startServer(id)}
        onStopServer={(id) => void actions.runAction(() => window.api.stopServer(id))}
        onRestartServer={(id) => void actions.restartServer(id)}
        onRestartWithWarning={(id) => void actions.restartServerWithWarning(id)}
        onCancelRestartWarning={(id) => void actions.cancelRestartWarning(id)}
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
