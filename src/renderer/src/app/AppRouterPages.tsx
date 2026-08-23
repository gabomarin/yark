import { APP_VERSION } from "@shared/app-version";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import type {
  AppEvent,
  ClusterComplianceReport,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
  SteamCmdCacheKind,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "@shared/types";
import type { CopyConfigSession, Overlay } from "@app/model/appOverlay";
import type { AppShellChromeProps } from "@app/appShellChrome";
import type { SteamCmdCardJobRef } from "@app/model/steamCmdShellModel";
import { AppRouter } from "@app/AppRouter";
import { ClustersPage } from "@features/clusters/ClustersPage";
import { DownloadsPage } from "@features/downloads/DownloadsPage";
import { LogsPage } from "@features/logs/LogsPage";
import type { ServerLogsFocus } from "@features/logs/ServerLogsPanel";
import { BackupsPage } from "@features/backups/BackupsPage";
import { OverviewPage } from "@features/overview/OverviewPage";
import type { UpdateAllOutdatedPlan } from "@features/overview/updateAllOutdatedModel";
import { SettingsPage } from "@features/settings/SettingsPage";
import type { DesktopShellPreferencesController } from "@features/settings/hooks/useDesktopShellPreferences";
import type { UiDensity } from "@features/settings/settingsModel";
import type { Route } from "@layout/Sidebar/Sidebar";

export interface AppRouterPagesProps {
  shell: AppShellChromeProps;
  route: Route;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  servers: ServerProfile[];
  statuses: Map<string, ServerRuntimeInfo>;
  installationInfo: Map<string, ServerInstallationInfo>;
  events: AppEvent[];
  steamCmdStatus: SteamCmdStatus | null;
  steamCmdConsole: SteamCmdConsoleSnapshot | null;
  steamCmdBusy: boolean;
  officialSteamBuild: string | null;
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
  stopProgressByServerId: Map<string, ServerStopProgress>;
  startBusyByServerId: Set<string>;
  openServerLogs: (serverId: string, focus?: ServerLogsFocus) => void;
  confirmDeleteServer: (id: string) => void;
  runAction: (action: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;
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
  startServer: (id: string) => void;
  restartServer: (id: string) => void;
  confirmKillServer: (id: string) => void;
  setServerEnabled: (id: string, enabled: boolean) => void;
  startSteamFilesJob: (serverId: string, kind: "install" | "update" | "verify") => void;
  setCopyConfig: Dispatch<SetStateAction<CopyConfigSession | null>>;
  defaultBaseFolder: string | null;
  refresh: (options?: {
    includeInstallation?: boolean;
    includeServerList?: boolean;
    forceOfficialCheck?: boolean;
    serversMode?: import("@shared/types").InstallationServersMode;
  }) => Promise<unknown>;
}

export function AppRouterPages(props: AppRouterPagesProps): ReactElement {
  const {
    shell,
    route,
    setOverlay,
    servers,
    statuses,
    installationInfo,
    events,
    steamCmdStatus,
    steamCmdConsole,
    steamCmdBusy,
    officialSteamBuild,
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
    stopProgressByServerId,
    startBusyByServerId,
    openServerLogs,
    confirmDeleteServer,
    runAction,
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
    startServer,
    restartServer,
    confirmKillServer,
    setServerEnabled,
    startSteamFilesJob,
    setCopyConfig,
    defaultBaseFolder,
    refresh,
  } = props;

  return (
    <AppRouter
      route={route}
      appVersion={APP_VERSION}
      officialVersion={shell.officialVersion}
      officialNetworkStatus={shell.officialNetworkStatus}
      steamCmdDetected={shell.steamCmdDetected}
      steamCmdRunning={shell.steamCmdRunning}
      onNavigate={shell.navigate}
      yarkUpdateAvailableVersion={shell.yarkUpdateAvailableVersion}
      onWhatsNewClick={shell.onWhatsNewClick}
      onYarkUpdateClick={shell.onYarkUpdateClick}
      busyOverlay={shell.busyOverlay}
      downloadCount={shell.downloadCount}
      workspaceFooter={shell.workspaceFooter}
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
            officialVersion={shell.officialVersion}
            events={events}
            onViewAllActivity={() => shell.navigate("logs")}
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
            onCopyConfiguration={(id) => setCopyConfig({ sourceServerId: id })}
            onDeleteServer={(id) => confirmDeleteServer(id)}
            onToggleServerEnabled={(id, enabled) => void setServerEnabled(id, enabled)}
            onOpenDownloads={() => {
              setOverlay(null);
              shell.navigate("downloads");
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
