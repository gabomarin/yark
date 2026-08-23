import { APP_VERSION } from "@shared/app-version";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { Overlay } from "@app/model/appOverlay";
import type {
  AppFleetSlice,
  AppLifecycleSlice,
  AppOverviewSlice,
  AppSettingsSlice,
  AppSteamCmdSlice,
} from "@app/model/appMainRouterSlices";
import type { AppShellChromeProps } from "@app/appShellChrome";
import { AppRouter } from "@app/AppRouter";
import { ClustersPage } from "@features/clusters/ClustersPage";
import { DownloadsPage } from "@features/downloads/DownloadsPage";
import { LogsPage } from "@features/logs/LogsPage";
import { BackupsPage } from "@features/backups/BackupsPage";
import { OverviewPage } from "@features/overview/OverviewPage";
import { SettingsPage } from "@features/settings/SettingsPage";
import type { Route } from "@layout/Sidebar/Sidebar";

export interface AppRouterPagesProps {
  shell: AppShellChromeProps;
  route: Route;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  fleet: AppFleetSlice;
  lifecycle: AppLifecycleSlice;
  steamCmd: AppSteamCmdSlice;
  overview: AppOverviewSlice;
  settings: AppSettingsSlice;
}

export function AppRouterPages(props: AppRouterPagesProps): ReactElement {
  const { shell, route, setOverlay, fleet, lifecycle, steamCmd, overview, settings } =
    props;
  const { servers, statuses, installationInfo, events, reports, refresh } = fleet;
  const { stopProgressByServerId, startBusyByServerId, actions } = lifecycle;
  const {
    steamCmdStatus,
    steamCmdConsole,
    steamCmdBusy,
    officialSteamBuild,
    steamCmdPausedByServerId,
    steamCmdQueuedByServerId,
    startSteamFilesJob,
    runPauseSteamCmd,
    openSteamCmdSettings,
    pickSteamCmdPath,
    openSteamCmdCache,
    clearSteamCmdCache,
  } = steamCmd;
  const {
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
  } = overview;
  const {
    focusYarkUpdates,
    setFocusYarkUpdates,
    focusSteamCmd,
    setFocusSteamCmd,
    openNativeTerminalOnStart,
    handleOpenNativeConsoleChange,
    uiDensity,
    handleUiDensityChange,
    defaultBaseFolder,
    setDefaultBaseFolder,
    desktopShell,
    onRunSetupAgain,
  } = settings;

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
            onOpenLogs={(serverId) => actions.openServerLogs(serverId, { section: "events" })}
            onReviewError={(serverId) =>
              actions.openServerLogs(serverId, { section: "runtime" })
            }
            onStartServer={(id) => void actions.startServer(id)}
            onStopServer={(id) => void actions.runAction(() => window.api.stopServer(id))}
            onRestartServer={(id) => void actions.restartServer(id)}
            onKillServer={(id) => actions.confirmKillServer(id)}
            onOpenFolder={(id) => void actions.runAction(() => window.api.openServerFolder(id))}
            onInstallFiles={(id) => startSteamFilesJob(id, "install")}
            onUpdateNow={(id) => startSteamFilesJob(id, "update")}
            onVerifyFiles={(id) => startSteamFilesJob(id, "verify")}
            onCheckUpdatesForServer={(id) => void checkForUpdates(id)}
            onCloneServer={(id) => setOverlay({ kind: "clone", sourceServerId: id })}
            onCopyConfiguration={(id) => actions.setCopyConfig({ sourceServerId: id })}
            onDeleteServer={(id) => actions.confirmDeleteServer(id)}
            onToggleServerEnabled={(id, enabled) => void actions.setServerEnabled(id, enabled)}
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
              onCancelLive={() => void actions.runAction(() => window.api.cancelSteamCmd())}
              onPauseLive={() => void runPauseSteamCmd()}
              onCancelJob={(id) => void actions.runAction(() => window.api.cancelCriticalJob(id))}
              onRetryJob={(id) => void actions.runAction(() => window.api.retryCriticalJob(id))}
              onResumeJob={(id) => void actions.runAction(() => window.api.resumeCriticalJob(id))}
              onDismissJob={(id) => void actions.runAction(() => window.api.dismissCriticalJob(id))}
              onReorderJob={(id, direction) =>
                void actions.runAction(() => window.api.reorderCriticalJob(id, direction))
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
            onOpenServerLogs={actions.openServerLogs}
          />
        ),
      }}
      backups={{
        page: (
          <BackupsPage
            servers={servers}
            onOpenServerBackups={actions.openServerBackups}
            onOpenFailedBackupLogs={({ serverId, backupId }) =>
              actions.openServerLogs(serverId, {
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
            onInstallSteamCmd={() => void actions.runAction(() => window.api.installSteamCmd())}
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
