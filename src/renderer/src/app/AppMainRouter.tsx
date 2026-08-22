import { APP_VERSION } from "@shared/app-version";
import type { Dispatch, ReactElement, ReactNode, SetStateAction } from "react";
import { isFilesJobOperation } from "@shared/files-job-priority";
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
import { AppRouter } from "@app/AppRouter";
import { AppShellLayout } from "@app/AppShellLayout";
import type { CopyConfigSession, Overlay } from "@app/appOverlay";
import type { SteamCmdCardJobRef } from "@app/steamCmdShellModel";
import { ClustersPage } from "@features/clusters/ClustersPage";
import type { KnownClusterOption } from "@features/clusters/knownClusterOptions";
import type { ServerFilesQueueState } from "@features/downloads/downloadsModel";
import { DownloadsPage } from "@features/downloads/DownloadsPage";
import { LogsPage } from "@features/logs/LogsPage";
import { BackupsPage } from "@features/backups/BackupsPage";
import { OverviewPage } from "@features/overview/OverviewPage";
import type { UpdateAllOutdatedPlan } from "@features/overview/updateAllOutdatedModel";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import {
  ServerWorkspacePage,
  type RconHistoryEntry,
} from "@features/server-workspace/ServerWorkspacePage";
import { ServerForm } from "@features/servers/components/ServerForm/ServerForm";
import { SettingsPage } from "@features/settings/SettingsPage";
import type { DesktopShellPreferencesController } from "@features/settings/useDesktopShellPreferences";
import type { UiDensity } from "@features/settings/settingsModel";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { AppBusyOverlayContent } from "@ui/AppBusyOverlay/AppBusyOverlay";

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

export function AppMainRouter(props: AppMainRouterProps): ReactElement {
  const {
    overlay,
    setOverlay,
    route,
    navigate,
    servers,
    statuses,
    installationInfo,
    events,
    rconHistoryByServer,
    playerListsByServer,
    steamCmdStatus,
    steamCmdConsole,
    steamCmdBusy,
    officialVersion,
    officialNetworkStatus,
    officialSteamBuild,
    yarkUpdateAvailableVersion,
    onWhatsNewClick,
    onYarkUpdateClick,
    stopBusyOverlay,
    downloadCount,
    downloadsWorkspaceFooter,
    filesQueueByServerId,
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
    defaultBaseFolder,
    extraClusterOptions,
    runWithOverlayLeaveGuard,
    consumePendingSetupCluster,
    search,
    setSearch,
    overviewLoading,
    setImportWizardKey,
    setImportInstallOpen,
    checkingUpdates,
    checkForUpdates,
    installScan,
    runInstallHealthScan,
    canUpdateAllOutdated,
    updateAllOutdatedLoading,
    openUpdateAllOutdated,
    updateAllOutdatedOpen,
    updateAllOutdatedModalPlan,
    updateAllOutdatedQueueing,
    closeUpdateAllOutdated,
    confirmUpdateAllOutdated,
    filteredServers,
    filteredDisabledServers,
    runningServers,
    steamCmdPausedByServerId,
    steamCmdQueuedByServerId,
    openServerLogs,
    confirmDeleteServer,
    runPauseSteamCmd,
    openSteamCmdSettings,
    reports,
    openServerBackups,
    focusYarkUpdates,
    setFocusYarkUpdates,
    focusSteamCmd,
    setFocusSteamCmd,
    openNativeTerminalOnStart,
    handleOpenNativeConsoleChange,
    uiDensity,
    handleUiDensityChange,
    setDefaultBaseFolder,
    pickSteamCmdPath,
    openSteamCmdCache,
    clearSteamCmdCache,
    desktopShell,
    onRunSetupAgain,
  } = props;

  if (overlay?.kind === "workspace") {
    return (
      <AppShellLayout
        route="overview"
        onNavigate={navigate}
        steamCmdDetected={steamCmdStatus?.detected === true}
        steamCmdRunning={steamCmdBusy}
        officialVersion={officialVersion}
        officialNetworkStatus={officialNetworkStatus}
        appVersion={APP_VERSION}
        yarkUpdateAvailableVersion={yarkUpdateAvailableVersion}
        onWhatsNewClick={onWhatsNewClick}
        onYarkUpdateClick={onYarkUpdateClick}
        busyOverlay={stopBusyOverlay}
        downloadCount={downloadCount}
        workspaceFooter={downloadsWorkspaceFooter}
      >
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
          filesJobActive={
            filesQueueByServerId.has(overlay.serverId)
            || (steamCmdBusy && steamCmdStatus?.serverId === overlay.serverId)
          }
          filesJobOperation={
            (() => {
              const queued = filesQueueByServerId.get(overlay.serverId);
              if (queued !== undefined && isFilesJobOperation(queued.operation)) {
                return queued.operation;
              }
              const liveOp = steamCmdStatus?.operation;
              if (
                steamCmdBusy
                && steamCmdStatus?.serverId === overlay.serverId
                && isFilesJobOperation(liveOp)
              ) {
                return liveOp;
              }
              return null;
            })()
          }
          filesJobQueueKind={
            filesQueueByServerId.get(overlay.serverId)?.kind
            ?? (steamCmdBusy && steamCmdStatus?.serverId === overlay.serverId
              ? "active"
              : null)
          }
          filesJobLabel={
            filesQueueByServerId.get(overlay.serverId)?.kind === "queued"
              ? filesQueueByServerId.get(overlay.serverId)?.label ?? "Queued in Downloads"
              : steamCmdBusy && steamCmdStatus?.serverId === overlay.serverId
              ? steamCmdStatus.operation === "update"
                ? "Updating server files"
                : steamCmdStatus.operation === "verify-files"
                  ? "Verifying server files"
                  : steamCmdStatus.operation === "install-files"
                    ? "Installing server files"
                    : steamCmdStatus.operation === "sync-files"
                      ? "Copying files to this server"
                      : "Updating server files"
              : filesQueueByServerId.get(overlay.serverId)?.label ?? null
          }
          stopProgress={
            stopProgressByServerId.get(overlay.serverId) ?? null
          }
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
              // Drop one-shot deep links so they cannot apply to another server.
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
          onCopyConfiguration={(id) =>
            setCopyConfig({ sourceServerId: id })
          }
        />
      </AppShellLayout>
    );
  }

  if (overlay?.kind === "create") {
    return (
      <AppShellLayout
        route="overview"
        onNavigate={navigate}
        steamCmdDetected={steamCmdStatus?.detected === true}
        steamCmdRunning={steamCmdBusy}
        officialVersion={officialVersion}
        officialNetworkStatus={officialNetworkStatus}
        appVersion={APP_VERSION}
        yarkUpdateAvailableVersion={yarkUpdateAvailableVersion}
        onWhatsNewClick={onWhatsNewClick}
        onYarkUpdateClick={onYarkUpdateClick}
        busyOverlay={stopBusyOverlay}
        downloadCount={downloadCount}
        workspaceFooter={downloadsWorkspaceFooter}
      >
        <ServerForm
          initial={null}
          defaultBaseFolder={defaultBaseFolder}
          servers={servers}
          extraClusterOptions={extraClusterOptions}
          onRegisterLeaveGuard={registerOverlayLeaveGuard}
          onOpenClusters={() => navigate("clusters")}
          onCancel={() => runWithOverlayLeaveGuard(() => setOverlay(null))}
          onSaved={(created) => {
            consumePendingSetupCluster();
            if (created !== undefined) {
              setOverlay({ kind: "workspace", serverId: created.id, onboarding: true });
              void refresh();
              return;
            }
            setOverlay(null);
            void refresh();
          }}
        />
      </AppShellLayout>
    );
  }

  if (overlay?.kind === "edit") {
    return (
      <AppShellLayout
        route="overview"
        onNavigate={navigate}
        steamCmdDetected={steamCmdStatus?.detected === true}
        steamCmdRunning={steamCmdBusy}
        officialVersion={officialVersion}
        officialNetworkStatus={officialNetworkStatus}
        appVersion={APP_VERSION}
        yarkUpdateAvailableVersion={yarkUpdateAvailableVersion}
        onWhatsNewClick={onWhatsNewClick}
        onYarkUpdateClick={onYarkUpdateClick}
        busyOverlay={stopBusyOverlay}
        downloadCount={downloadCount}
        workspaceFooter={downloadsWorkspaceFooter}
      >
        <ServerForm
          initial={overlay.profile}
          defaultBaseFolder={defaultBaseFolder}
          servers={servers}
          onRegisterLeaveGuard={registerOverlayLeaveGuard}
          onOpenClusters={() => navigate("clusters")}
          onCancel={() => runWithOverlayLeaveGuard(() => setOverlay(null))}
          onSaved={() => {
            setOverlay(null);
            void refresh();
          }}
        />
      </AppShellLayout>
    );
  }

  return (
    <AppRouter
      route={route}
      appVersion={APP_VERSION}
      officialVersion={officialVersion}
      officialNetworkStatus={officialNetworkStatus}
      steamCmdDetected={steamCmdStatus?.detected === true}
      steamCmdRunning={steamCmdBusy}
      onNavigate={navigate}
      yarkUpdateAvailableVersion={yarkUpdateAvailableVersion}
      onWhatsNewClick={onWhatsNewClick}
      onYarkUpdateClick={onYarkUpdateClick}
      busyOverlay={stopBusyOverlay}
      downloadCount={downloadCount}
      workspaceFooter={downloadsWorkspaceFooter}
      overview={{
        page: (
          <OverviewPage
            search={search}
            onSearchChange={setSearch}
            loading={overviewLoading}
            onCreateServer={() => setOverlay({ kind: "create" })}
            onImportServer={() => {
              setImportWizardKey((key) => key + 1);
              setImportInstallOpen(true);
            }}
            checkingUpdates={checkingUpdates}
            onCheckUpdates={() => void checkForUpdates()}
            checkingInstalls={installScan.active}
            onCheckInstalls={() => void runInstallHealthScan("manual")}
            canUpdateAllOutdated={canUpdateAllOutdated}
            openingUpdateAllOutdated={updateAllOutdatedLoading}
            onOpenUpdateAllOutdated={() => void openUpdateAllOutdated()}
            updateAllOutdatedOpen={updateAllOutdatedOpen}
            updateAllOutdatedPlan={updateAllOutdatedModalPlan}
            updateAllOutdatedLoading={updateAllOutdatedLoading}
            updateAllOutdatedQueueing={updateAllOutdatedQueueing}
            onCloseUpdateAllOutdated={closeUpdateAllOutdated}
            onConfirmUpdateAllOutdated={() => void confirmUpdateAllOutdated()}
            servers={servers}
            filteredServers={filteredServers}
            disabledServers={filteredDisabledServers}
            runningServers={runningServers}
            statuses={statuses}
            installationInfo={installationInfo}
            officialSteamBuild={officialSteamBuild}
            officialVersion={officialVersion}
            events={events}
            onViewAllActivity={() => navigate("logs")}
            steamCmdServerId={steamCmdStatus?.serverId ?? null}
            steamCmdRunning={steamCmdStatus?.running === true}
            steamCmdBusy={steamCmdBusy}
            steamCmdPausedByServerId={steamCmdPausedByServerId}
            steamCmdQueuedByServerId={steamCmdQueuedByServerId}
            steamCmdProgressPercent={steamCmdStatus?.progressPercent ?? null}
            steamCmdProgressLabel={steamCmdStatus?.progressLabel ?? null}
            steamCmdProgressBytesDownloaded={steamCmdStatus?.progressBytesDownloaded ?? null}
            steamCmdProgressBytesTotal={steamCmdStatus?.progressBytesTotal ?? null}
            steamCmdOperation={steamCmdStatus?.operation ?? null}
            stopProgressByServerId={stopProgressByServerId}
            startBusyByServerId={startBusyByServerId}
            onOpenWorkspace={(server) => {
              const updatingThisServer =
                steamCmdBusy && steamCmdStatus?.serverId === server.id;
              setOverlay({
                kind: "workspace",
                serverId: server.id,
                ...(updatingThisServer
                  ? {
                      initialTab: "logs" as const,
                      logsFocus: { section: "updates" as const },
                    }
                  : {}),
              });
            }}
            onOpenLogs={(serverId) => openServerLogs(serverId, { section: "events" })}
            onReviewError={(serverId) =>
              openServerLogs(serverId, { section: "runtime" })
            }
            onStartServer={(id) => void startServer(id)}
            onStopServer={(id) => void runAction(() => window.api.stopServer(id))}
            onRestartServer={(id) => void restartServer(id)}
            onKillServer={(id) => confirmKillServer(id)}
            onOpenFolder={(id) => void runAction(() => window.api.openServerFolder(id))}
            onInstallFiles={(id) => startSteamFilesJob(id, "install")}
            onUpdateNow={(id) => startSteamFilesJob(id, "update")}
            onVerifyFiles={(id) => startSteamFilesJob(id, "verify")}
            onCheckUpdatesForServer={(id) => void checkForUpdates(id)}
            onCloneServer={(id) => setOverlay({ kind: "clone", sourceServerId: id })}
            onCopyConfiguration={(id) =>
              setCopyConfig({ sourceServerId: id })
            }
            onDeleteServer={(id) => confirmDeleteServer(id)}
            onToggleServerEnabled={(id, enabled) => void setServerEnabled(id, enabled)}
            onOpenDownloads={() => {
              setOverlay(null);
              navigate("downloads");
            }}
          />
        ),
      }}
      downloads={{
        page:
          steamCmdStatus !== null ? (
            <DownloadsPage
              status={steamCmdStatus}
              console={steamCmdConsole}
              servers={servers}
              onCancelLive={() => void runAction(() => window.api.cancelSteamCmd())}
              onPauseLive={() => void runPauseSteamCmd()}
              onCancelJob={(id) => void runAction(() => window.api.cancelCriticalJob(id))}
              onRetryJob={(id) => void runAction(() => window.api.retryCriticalJob(id))}
              onResumeJob={(id) => void runAction(() => window.api.resumeCriticalJob(id))}
              onDismissJob={(id) => void runAction(() => window.api.dismissCriticalJob(id))}
              onReorderJob={(id, direction) =>
                void runAction(() => window.api.reorderCriticalJob(id, direction))
              }
              onOpenSettings={openSteamCmdSettings}
            />
          ) : null,
      }}
      clusters={{
        page: (
          <ClustersPage
            servers={servers}
            reports={reports}
            statuses={statuses}
            onRefresh={() => void refresh()}
            onOpenServer={(serverId) =>
              setOverlay({ kind: "workspace", serverId })
            }
          />
        ),
      }}
      logs={{
        page: (
          <LogsPage
            servers={servers}
            onOpenServerLogs={openServerLogs}
          />
        ),
      }}
      backups={{
        page: (
          <BackupsPage
            servers={servers}
            onOpenServerBackups={openServerBackups}
            onOpenFailedBackupLogs={({ serverId, backupId }) =>
              openServerLogs(serverId, {
                section: "backups",
                backupId: backupId ?? undefined,
              })
            }
          />
        ),
      }}
      settings={{
        page: (
          <SettingsPage
            appVersion={APP_VERSION}
            focusYarkUpdates={focusYarkUpdates}
            onYarkUpdatesFocused={() => setFocusYarkUpdates(false)}
            focusSteamCmd={focusSteamCmd}
            onSteamCmdFocused={() => setFocusSteamCmd(false)}
            steamCmdStatus={steamCmdStatus}
            steamCmdBusy={steamCmdBusy}
            servers={servers}
            installationInfo={installationInfo}
            onOpenServer={(serverId) =>
              setOverlay({ kind: "workspace", serverId, initialTab: "server" })
            }
            openNativeTerminalOnStart={openNativeTerminalOnStart}
            onOpenNativeTerminalOnStartChange={(enabled) =>
              void handleOpenNativeConsoleChange(enabled)
            }
            uiDensity={uiDensity}
            onUiDensityChange={(density) => void handleUiDensityChange(density)}
            defaultBaseFolder={defaultBaseFolder}
            onDefaultBaseFolderChange={setDefaultBaseFolder}
            onPickSteamCmdPath={() => void pickSteamCmdPath()}
            onInstallSteamCmd={() => void runAction(() => window.api.installSteamCmd())}
            onOpenSteamCmdCache={openSteamCmdCache}
            onClearSteamCmdCache={clearSteamCmdCache}
            desktopShell={desktopShell}
            onRunSetupAgain={onRunSetupAgain}
          />
        ),
      }}
    />
  );
}
