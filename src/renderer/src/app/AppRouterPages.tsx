import { APP_VERSION } from "@shared/app-version";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import type { Overlay } from "@app/model/appOverlay";
import type {
  AppFleetSlice,
  AppLifecycleSlice,
  AppOverviewSlice,
  AppRconSlice,
  AppSettingsSlice,
  AppSteamCmdSlice,
} from "@app/model/appMainRouterSlices";
import type { AppShellChromeProps } from "@app/appShellChrome";
import { AppRouter } from "@app/AppRouter";
import { ClustersPage } from "@features/clusters/ClustersPage";
import { DownloadsPage } from "@features/downloads/DownloadsPage";
import { LogsPage } from "@features/logs/LogsPage";
import { BackupsPage } from "@features/backups/BackupsPage";
import { HostedResourcesPage } from "@features/hosted-resources/HostedResourcesPage";
import { OverviewPage } from "@features/overview/OverviewPage";
import { SettingsPage } from "@features/settings/SettingsPage";
import type { Route } from "@layout/Sidebar/Sidebar";
import type { HostedResourceReferenceDto } from "@shared/ipc";
import { consumerForSetting } from "@shared/settings/hosted-resource-consumers";
import type { WorkspaceTab } from "@features/server-workspace/ServerWorkspacePage";

export interface AppRouterPagesProps {
  shell: AppShellChromeProps;
  route: Route;
  setOverlay: Dispatch<SetStateAction<Overlay>>;
  fleet: AppFleetSlice;
  lifecycle: AppLifecycleSlice;
  steamCmd: AppSteamCmdSlice;
  overview: AppOverviewSlice;
  rcon: AppRconSlice;
  settings: AppSettingsSlice;
}

export function AppRouterPages(props: AppRouterPagesProps): ReactElement {
  const { shell, route, setOverlay, fleet, lifecycle, steamCmd, overview, rcon, settings } = props;
  /** Survives Overview unmount when switching sidebar routes (#438). */
  const { search: overviewSearch, setSearch: setOverviewSearch } = overview;
  const { servers, statuses, installationInfo, processMetricsByServer, events, reports, refresh } = fleet;
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
  const { overviewLoading, setImportWizardKey, setImportInstallOpen, installScan, runInstallHealthScan } = overview;
  const {
    focusYarkUpdates,
    setFocusYarkUpdates,
    focusSteamCmd,
    setFocusSteamCmd,
    openNativeTerminalOnStart,
    handleOpenNativeConsoleChange,
    uiDensity,
    handleUiDensityChange,
    themeId,
    handleThemeChange,
    workspacePanels,
    handleWorkspacePanelsChange,
    defaultBaseFolder,
    setDefaultBaseFolder,
    desktopShell,
    onRunSetupAgain,
    landOnGeneralToken,
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
      hostedResourcesHealth={shell.hostedResourcesHealth}
      workspaceFooter={shell.workspaceFooter}
      overview={{
        page: (
          <OverviewPage
            loading={overviewLoading}
            search={overviewSearch}
            onSearchChange={setOverviewSearch}
            onCreateServer={() => setOverlay({ kind: "create" })}
            onImportServer={() => {
              setImportWizardKey((key) => key + 1);
              setImportInstallOpen(true);
            }}
            checkingInstalls={installScan.active}
            onCheckInstalls={() => void runInstallHealthScan("manual")}
            servers={servers}
            statuses={statuses}
            installationInfo={installationInfo}
            playerListsByServer={rcon.playerListsByServer}
            processMetricsByServer={processMetricsByServer}
            officialSteamBuild={officialSteamBuild}
            officialVersion={shell.officialVersion}
            events={events}
            onViewAllActivity={() => shell.navigate("logs")}
            steamCmdStatus={steamCmdStatus}
            steamCmdBusy={steamCmdBusy}
            steamCmdPausedByServerId={steamCmdPausedByServerId}
            steamCmdQueuedByServerId={steamCmdQueuedByServerId}
            stopProgressByServerId={stopProgressByServerId}
            startBusyByServerId={startBusyByServerId}
            refresh={refresh}
            onOpenDownloads={() => {
              setOverlay(null);
              shell.navigate("downloads");
            }}
            onOpenWorkspace={(server) => {
              const updatingThisServer = steamCmdBusy && steamCmdStatus?.serverId === server.id;
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
            onReviewError={(serverId) => actions.openServerLogs(serverId, { section: "runtime" })}
            onStartServer={(id) => void actions.startServer(id)}
            onStopServer={(id) => void actions.runAction(() => window.api.stopServer(id))}
            onRestartServer={(id) => void actions.restartServer(id)}
            onRestartWithWarning={(id) => void actions.restartServerWithWarning(id)}
            onCancelRestartWarning={(id) => void actions.cancelRestartWarning(id)}
            onConfigureRestartWarnings={(id) => actions.openServerMaintenance(id)}
            onKillServer={(id) => actions.confirmKillServer(id)}
            onOpenFolder={(id) => void actions.runAction(() => window.api.openServerFolder(id))}
            onInstallFiles={(id) => startSteamFilesJob(id, "install")}
            onUpdateNow={(id) => startSteamFilesJob(id, "update")}
            onVerifyFiles={(id) => startSteamFilesJob(id, "verify")}
            onCloneServer={(id) => setOverlay({ kind: "clone", sourceServerId: id })}
            onCopyConfiguration={(id) => actions.setCopyConfig({ sourceServerId: id })}
            onDeleteServer={(id) => actions.confirmDeleteServer(id)}
            onToggleServerEnabled={(id, enabled) => void actions.setServerEnabled(id, enabled)}
            onOpenSteamCmdSettings={openSteamCmdSettings}
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
            onOpenServer={(serverId) => setOverlay({ kind: "workspace", serverId })}
          />
        ),
      }}
      logs={{
        page: <LogsPage servers={servers} onOpenServerLogs={actions.openServerLogs} />,
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
      hostedResources={{
        page: (
          <HostedResourcesPage
            onOpenReference={(reference: HostedResourceReferenceDto) => {
              // Where the setting is edited, not where its key name suggests: a reference
              // must never land on a tab that cannot fix it.
              const consumer = consumerForSetting(reference.key);
              const initialTab: WorkspaceTab =
                consumer?.surface === "rcon-admins"
                  ? "rcon"
                  : consumer?.surface === "launch-option"
                    ? "launch"
                    : "iniFiles";
              setOverlay({
                kind: "workspace",
                serverId: reference.serverId,
                initialTab,
                initialRconFocus: consumer?.surface === "rcon-admins" ? "admins" : undefined,
              });
            }}
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
            onOpenServer={(serverId) => setOverlay({ kind: "workspace", serverId, initialTab: "server" })}
            openNativeTerminalOnStart={openNativeTerminalOnStart}
            onOpenNativeTerminalOnStartChange={(enabled) => void handleOpenNativeConsoleChange(enabled)}
            uiDensity={uiDensity}
            onUiDensityChange={(density) => void handleUiDensityChange(density)}
            themeId={themeId}
            onThemeChange={(theme) => void handleThemeChange(theme)}
            workspacePanels={workspacePanels}
            onWorkspacePanelsChange={(panels) => void handleWorkspacePanelsChange(panels)}
            defaultBaseFolder={defaultBaseFolder}
            onDefaultBaseFolderChange={setDefaultBaseFolder}
            onPickSteamCmdPath={() => void pickSteamCmdPath()}
            onInstallSteamCmd={() => void actions.runAction(() => window.api.installSteamCmd())}
            onOpenSteamCmdCache={openSteamCmdCache}
            onClearSteamCmdCache={clearSteamCmdCache}
            desktopShell={desktopShell}
            onRunSetupAgain={onRunSetupAgain}
            landOnGeneralToken={landOnGeneralToken}
          />
        ),
      }}
    />
  );
}
