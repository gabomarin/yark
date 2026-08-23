import type { ReactElement } from "react";
import { APP_VERSION } from "@shared/app-version";
import type { AppUpdateStatus } from "@shared/app-update";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import {
  yarkUpdateToastCopy,
  yarkUpdateToastDedupeKey,
} from "@ui/yarkUpdateOperatorToast";
import type {
  ServerProfile,
} from "@shared/types";
import { EMPTY_WIPE_STALE_MESSAGE } from "@shared/types";
import { AppProviders } from "@app/AppProviders";
import { AppMainRouter } from "@app/AppMainRouter";
import type { CopyConfigSession, Overlay } from "@app/model/appOverlay";
import { steamCmdCardJobsByKind } from "@app/model/steamCmdShellModel";
import { ImportInstallWizard } from "@features/servers/components/ImportInstallWizard/ImportInstallWizard";
import { useAppFleetRefresh } from "@app/hooks/useAppFleetRefresh";
import { useAppRcon } from "@app/hooks/useAppRcon";
import { useAppOnboarding } from "@app/hooks/useAppOnboarding";
import { useAppServerLifecycle } from "@app/hooks/useAppServerLifecycle";
import { useAppServerUpdates } from "@app/hooks/useAppServerUpdates";
import { useAppSteamCmdActions } from "@app/hooks/useAppSteamCmdActions";
import { CloneServerDialog } from "@features/servers/components/CloneServerDialog/CloneServerDialog";
import { DeleteServerModal } from "@features/servers/components/DeleteServerModal/DeleteServerModal";
import { CopyConfigurationWizard } from "@features/servers/components/CopyConfigurationWizard/CopyConfigurationWizard";
import { DownloadsTeaserFooter } from "@features/downloads/DownloadsTeaserFooter";
import {
  buildDownloadRows,
  buildDownloadsTeaser,
  downloadsBadgeCount,
  filesQueueStateByServerId,
  shouldShowDownloadsChrome,
} from "@features/downloads/downloadsModel";
import { AppChangelogModal } from "@features/settings/components/AppChangelogModal";
import { SetupWizard } from "@features/setup-wizard/SetupWizard";
import {
  toSyntheticClusterOption,
} from "@features/setup-wizard/setupWizardModel";
import {
  readDefaultBaseFolderPref,
  writeDefaultBaseFolderPref,
  writeOpenNativeConsolePref,
  writeUiDensityPref,
  type UiDensity,
} from "@features/settings/settingsModel";
import { DEFAULT_OPEN_NATIVE_CONSOLE } from "@shared/open-native-console";
import { useDesktopShellPreferences } from "@features/settings/useDesktopShellPreferences";
import type { Route } from "@layout/Sidebar/Sidebar";
import { AppSpotlight } from "@layout/AppSpotlight/AppSpotlight";
import { pushSpotlightRecent } from "@layout/AppSpotlight/appSpotlightRecent";

interface AppProps {
  /** Resolved from `app_settings` (via IPC) before first paint. */
  initialUiDensity?: UiDensity;
  /** Resolved from `app_settings` (via IPC) before first paint. */
  initialOpenNativeConsole?: boolean;
}

export function App({
  initialUiDensity = "compact",
  initialOpenNativeConsole = DEFAULT_OPEN_NATIVE_CONSOLE,
}: AppProps): ReactElement {
  const [route, setRoute] = useState<Route>("overview");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const {
    servers,
    statuses,
    installationInfo,
    officialVersion,
    officialNetworkStatus,
    officialSteamBuild,
    reports,
    events,
    steamCmdStatus,
    steamCmdConsole,
    overviewLoading,
    installScan,
    stopProgressByServerId,
    steamCmdBusy,
    refresh,
    runInstallHealthScan,
  } = useAppFleetRefresh({ route, overlay });
  const {
    rconHistoryByServer,
    playerListsByServer,
    sendRconCommand,
    clearRconHistory,
    onRconTabFocusChanged,
    onRefreshPlayers,
    onKickPlayer,
    onBanPlayer,
  } = useAppRcon({ refresh });
  const [importInstallOpen, setImportInstallOpen] = useState(false);
  /** Remount Import wizard on each open so step/probe state resets without adjust-on-prop effects. */
  const [importWizardKey, setImportWizardKey] = useState(0);
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null);
  /** Dirty-leave guard registered by the active workspace or form overlay. */
  const overlayLeaveGuardRef = useRef<((action: () => void) => void) | null>(null);
  const runWithOverlayLeaveGuard = useCallback((action: () => void) => {
    const guard = overlayLeaveGuardRef.current;
    if (guard !== null) {
      guard(action);
      return;
    }
    action();
  }, []);
  const [copyConfig, setCopyConfig] = useState<CopyConfigSession | null>(null);
  const [openNativeTerminalOnStart, setOpenNativeTerminalOnStart] = useState(
    initialOpenNativeConsole,
  );
  const [uiDensity, setUiDensity] = useState<UiDensity>(initialUiDensity);
  const [defaultBaseFolder, setDefaultBaseFolder] = useState<string | null>(
    readDefaultBaseFolderPref,
  );
  const [search, setSearch] = useState("");
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [focusYarkUpdates, setFocusYarkUpdates] = useState(false);
  const [focusSteamCmd, setFocusSteamCmd] = useState(false);
  const desktopShell = useDesktopShellPreferences();
  const {
    changelogOpen,
    setChangelogOpen,
    changelogInitialTab,
    markChangelogSeen,
    onWhatsNewClick,
    setupWizardMode,
    setupWizardBusy,
    pendingSetupCluster,
    closeSetupWizard,
    finishSetupWizard,
    consumePendingSetupCluster,
    onRunSetupAgain,
  } = useAppOnboarding({ overviewLoading, serverCount: servers.length });

  useEffect(() => {
    writeDefaultBaseFolderPref(defaultBaseFolder);
  }, [defaultBaseFolder]);

  const handleOpenNativeConsoleChange = useCallback(async (enabled: boolean) => {
    const saved = await writeOpenNativeConsolePref(enabled);
    if (!saved) {
      notifications.show({
        color: "red",
        title: "Could not save console preference",
        message: "Your selection was not stored. Try again.",
      });
      return;
    }
    setOpenNativeTerminalOnStart(enabled);
  }, []);

  const handleUiDensityChange = useCallback(async (density: UiDensity) => {
    const saved = await writeUiDensityPref(density);
    if (!saved) {
      notifications.show({
        color: "red",
        title: "Could not save display size",
        message: "Your selection was not stored. Try again.",
      });
      return;
    }
    setUiDensity(density);
  }, []);

  const runningServers = Array.from(statuses.values()).filter(
    (status) => status.status === "running",
  ).length;

  const enabledServers = useMemo(
    () => servers.filter((server) => server.enabled),
    [servers],
  );
  const disabledServers = useMemo(
    () => servers.filter((server) => !server.enabled),
    [servers],
  );
  const extraClusterOptions = useMemo(
    () =>
      pendingSetupCluster === null
        ? undefined
        : [toSyntheticClusterOption(pendingSetupCluster)],
    [pendingSetupCluster],
  );

  const filterServers = useCallback(
    (input: ServerProfile[]) => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) {
        return input;
    }
      return input.filter((server) =>
      [server.name, server.map, server.clusterId ?? ""].some((field) =>
        field.toLowerCase().includes(query),
      ),
    );
    },
    [search],
  );

  const filteredServers = useMemo(
    () => filterServers(enabledServers),
    [enabledServers, filterServers],
  );
  const filteredDisabledServers = useMemo(
    () => filterServers(disabledServers),
    [disabledServers, filterServers],
  );

  const stopBusyOverlay = useMemo(() => {
    const active = [...stopProgressByServerId.values()].filter(
      (progress) => progress.active && progress.reason === "quit",
    );
    if (active.length === 0) {
      return null;
    }
    if (active.length === 1) {
      const progress = active[0]!;
      const name =
        servers.find((server) => server.id === progress.serverId)?.name ??
        "Server";
      return {
        title: "Stopping server",
        message: `${name}: ${progress.label.trim() || "Stopping…"}`,
        percent: progress.percent,
      };
    }
    const percentValues = active
      .map((progress) => progress.percent)
      .filter((value): value is number => value != null);
    const percent =
      percentValues.length > 0
        ? Math.round(
            percentValues.reduce((sum, value) => sum + value, 0) /
              percentValues.length,
          )
        : null;
    return {
      title: "Stopping servers",
      message: `Save and backup in progress for ${active.length} servers…`,
      percent,
    };
  }, [servers, stopProgressByServerId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await window.api.getAppUpdateStatus();
      if (cancelled || !result.ok) return;
      setAppUpdateStatus(result.data);
    })();
    const unsubscribe = window.api.onAppUpdate((status) => {
      setAppUpdateStatus(status);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const yarkUpdateAvailableVersion =
    appUpdateStatus !== null
    && (appUpdateStatus.phase === "available"
      || appUpdateStatus.phase === "downloading"
      || appUpdateStatus.phase === "ready")
    && appUpdateStatus.availableVersion !== null
    && appUpdateStatus.availableVersion.length > 0
      ? appUpdateStatus.availableVersion
      : null;

  const openYarkUpdateSettings = useCallback(() => {
    runWithOverlayLeaveGuard(() => {
      setOverlay(null);
      setRoute("settings");
      setFocusYarkUpdates(true);
    });
  }, [runWithOverlayLeaveGuard]);

  const openSteamCmdSettings = useCallback(() => {
    runWithOverlayLeaveGuard(() => {
      setOverlay(null);
      setRoute("settings");
      setFocusSteamCmd(true);
    });
  }, [runWithOverlayLeaveGuard]);

  const {
    runAction,
    runPauseSteamCmd,
    startSteamFilesJob,
    pickSteamCmdPath,
    openSteamCmdCache,
    clearSteamCmdCache,
  } = useAppSteamCmdActions({
    servers,
    steamCmdStatus,
    steamCmdBusy,
    refresh,
    setOverlay,
    setRoute,
  });
  const {
    checkingUpdates,
    checkForUpdates,
    canUpdateAllOutdated,
    updateAllOutdatedLoading,
    openUpdateAllOutdated,
    updateAllOutdatedOpen,
    updateAllOutdatedModalPlan,
    updateAllOutdatedQueueing,
    closeUpdateAllOutdated,
    confirmUpdateAllOutdated,
  } = useAppServerUpdates({
    servers,
    installationInfo,
    statuses,
    officialSteamBuild,
    steamCmdStatus,
    refresh,
    setOverlay,
    setRoute,
  });
  const {
    startBusyByServerId,
    startServer,
    restartServer,
    confirmKillServer,
    openServerLogs,
    openServerBackups,
    setServerEnabled,
  } = useAppServerLifecycle({
    servers,
    openNativeTerminalOnStart,
    refresh,
    runAction,
    setOverlay,
    setRoute,
    openYarkUpdateSettings,
  });

  /** Quiet check (~60s) and Settings Check now only accented the sidebar before — toast once. */
  const yarkUpdateToastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (appUpdateStatus === null) return;
    const key = yarkUpdateToastDedupeKey(appUpdateStatus);
    const copy = yarkUpdateToastCopy(appUpdateStatus);
    if (key === null || copy === null) return;
    if (yarkUpdateToastKeyRef.current === key) return;
    yarkUpdateToastKeyRef.current = key;
    showOperatorToast({
      id: "yark-update-operator",
      title: copy.title,
      message: copy.message,
      color: "orange",
      autoClose: 12_000,
      onClick: openYarkUpdateSettings,
    });
  }, [appUpdateStatus, openYarkUpdateSettings]);

  const downloadRows = useMemo(
    () =>
      steamCmdStatus !== null
        ? buildDownloadRows(steamCmdStatus, {
            activeServer:
              steamCmdStatus.serverId !== null
                ? (servers.find((server) => server.id === steamCmdStatus.serverId) ?? null)
                : null,
            serversById: new Map(servers.map((server) => [server.id, server] as const)),
          })
        : [],
    [servers, steamCmdStatus],
  );
  const downloadTeaser = useMemo(
    () =>
      steamCmdStatus !== null
        ? buildDownloadsTeaser(steamCmdStatus, downloadRows)
        : {
            visible: false,
            title: "",
            detail: "",
            percent: null,
            attention: false,
            canCancel: false,
            canResume: false,
            canPause: false,
            canRetry: false,
            usesLiveCancel: false,
            selectedJobId: null,
          },
    [downloadRows, steamCmdStatus],
  );
  const downloadCount = downloadsBadgeCount(downloadRows);
  const filesQueueByServerId = useMemo(
    () => filesQueueStateByServerId(steamCmdStatus?.criticalJobs),
    [steamCmdStatus],
  );
  const steamCmdPausedByServerId = useMemo(
    () => steamCmdCardJobsByKind(filesQueueByServerId, "paused"),
    [filesQueueByServerId],
  );
  const steamCmdQueuedByServerId = useMemo(
    () => steamCmdCardJobsByKind(filesQueueByServerId, "queued"),
    [filesQueueByServerId],
  );
  const showDownloadsTeaserFooter =
    route !== "downloads" && shouldShowDownloadsChrome(steamCmdStatus);

  const confirmDeleteServer = useCallback((id: string) => {
    setDeleteServerId(id);
  }, []);

  const navigate = useCallback(
    (next: Route) => {
      runWithOverlayLeaveGuard(() => {
        setOverlay(null);
        setRoute(next);
        // Only after leave-guard confirms — cancelled jumps must not hit Recent.
        pushSpotlightRecent({ kind: "nav", route: next });
      });
    },
    [runWithOverlayLeaveGuard],
  );

  const downloadsWorkspaceFooter = useMemo(() => {
    if (!showDownloadsTeaserFooter) {
      return null;
    }
    return (
      <DownloadsTeaserFooter
        model={downloadTeaser}
        onOpenDownloads={() => navigate("downloads")}
      />
    );
  }, [downloadTeaser, navigate, showDownloadsTeaserFooter]);

  const openServerFromSpotlight = useCallback(
    (serverId: string) => {
      runWithOverlayLeaveGuard(() => {
        setRoute("overview");
        setOverlay({ kind: "workspace", serverId, initialTab: "server" });
      });
    },
    [runWithOverlayLeaveGuard],
  );

  // Feed Spotlight "Recent" from normal workspace opens (not only palette picks).
  const workspaceServerId =
    overlay?.kind === "workspace" ? overlay.serverId : null;
  useEffect(() => {
    if (workspaceServerId === null) {
      return;
    }
    pushSpotlightRecent({ kind: "server", serverId: workspaceServerId });
  }, [workspaceServerId]);

  const registerOverlayLeaveGuard = useCallback(
    (guard: ((action: () => void) => void) | null) => {
      overlayLeaveGuardRef.current = guard;
    },
    [],
  );

  return (
    <AppProviders density={uiDensity}>
      <AppSpotlight
        servers={servers}
        onNavigate={navigate}
        onOpenServer={openServerFromSpotlight}
      />
      <AppChangelogModal
        opened={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        onDismiss={markChangelogSeen}
        appVersion={APP_VERSION}
        initialTab={changelogInitialTab}
      />
      <SetupWizard
        opened={setupWizardMode !== null}
        mode={setupWizardMode ?? "first-run"}
        servers={servers}
        steamCmdStatus={steamCmdStatus}
        steamCmdBusy={steamCmdBusy}
        defaultBaseFolder={defaultBaseFolder}
        uiDensity={uiDensity}
        openNativeTerminalOnStart={openNativeTerminalOnStart}
        desktopShell={desktopShell}
        busy={setupWizardBusy}
        onPickSteamCmdPath={() => void pickSteamCmdPath()}
        onInstallSteamCmd={() => void runAction(() => window.api.installSteamCmd())}
        onDefaultBaseFolderChange={setDefaultBaseFolder}
        onUiDensityChange={(density) => void handleUiDensityChange(density)}
        onOpenNativeTerminalOnStartChange={(enabled) =>
          void handleOpenNativeConsoleChange(enabled)
        }
        onSkip={async () => {
          await finishSetupWizard("skipped", null);
        }}
        onDismiss={closeSetupWizard}
        onPathsShellDone={closeSetupWizard}
        onCreateServer={async (cluster) => {
          if (!(await finishSetupWizard("completed", cluster))) {
            return;
          }
          setOverlay({ kind: "create" });
        }}
        onImport={async (cluster) => {
          if (!(await finishSetupWizard("completed", cluster))) {
            return;
          }
          setImportWizardKey((key) => key + 1);
          setImportInstallOpen(true);
        }}
        onExplore={async (cluster) => {
          await finishSetupWizard("completed", cluster);
        }}
      />
      <AppMainRouter
        overlay={overlay}
        setOverlay={setOverlay}
        route={route}
        navigate={navigate}
        servers={servers}
        statuses={statuses}
        installationInfo={installationInfo}
        events={events}
        rconHistoryByServer={rconHistoryByServer}
        playerListsByServer={playerListsByServer}
        steamCmdStatus={steamCmdStatus}
        steamCmdConsole={steamCmdConsole}
        steamCmdBusy={steamCmdBusy}
        officialVersion={officialVersion}
        officialNetworkStatus={officialNetworkStatus}
        officialSteamBuild={officialSteamBuild}
        yarkUpdateAvailableVersion={yarkUpdateAvailableVersion}
        onWhatsNewClick={onWhatsNewClick}
        onYarkUpdateClick={openYarkUpdateSettings}
        stopBusyOverlay={stopBusyOverlay}
        downloadCount={downloadCount}
        downloadsWorkspaceFooter={downloadsWorkspaceFooter}
        filesQueueByServerId={filesQueueByServerId}
        stopProgressByServerId={stopProgressByServerId}
        startBusyByServerId={startBusyByServerId}
        registerOverlayLeaveGuard={registerOverlayLeaveGuard}
        startServer={(id) => void startServer(id)}
        runAction={runAction}
        restartServer={(id) => void restartServer(id)}
        confirmKillServer={confirmKillServer}
        setServerEnabled={setServerEnabled}
        startSteamFilesJob={startSteamFilesJob}
        sendRconCommand={sendRconCommand}
        clearRconHistory={clearRconHistory}
        onRconTabFocusChanged={onRconTabFocusChanged}
        onRefreshPlayers={onRefreshPlayers}
        onKickPlayer={onKickPlayer}
        onBanPlayer={onBanPlayer}
        refresh={refresh}
        setCopyConfig={setCopyConfig}
        defaultBaseFolder={defaultBaseFolder}
        extraClusterOptions={extraClusterOptions}
        runWithOverlayLeaveGuard={runWithOverlayLeaveGuard}
        consumePendingSetupCluster={consumePendingSetupCluster}
        search={search}
        setSearch={setSearch}
        overviewLoading={overviewLoading}
        setImportWizardKey={setImportWizardKey}
        setImportInstallOpen={setImportInstallOpen}
        checkingUpdates={checkingUpdates}
        checkForUpdates={checkForUpdates}
        installScan={installScan}
        runInstallHealthScan={runInstallHealthScan}
        canUpdateAllOutdated={canUpdateAllOutdated}
        updateAllOutdatedLoading={updateAllOutdatedLoading}
        openUpdateAllOutdated={openUpdateAllOutdated}
        updateAllOutdatedOpen={updateAllOutdatedOpen}
        updateAllOutdatedModalPlan={updateAllOutdatedModalPlan}
        updateAllOutdatedQueueing={updateAllOutdatedQueueing}
        closeUpdateAllOutdated={closeUpdateAllOutdated}
        confirmUpdateAllOutdated={confirmUpdateAllOutdated}
        filteredServers={filteredServers}
        filteredDisabledServers={filteredDisabledServers}
        runningServers={runningServers}
        steamCmdPausedByServerId={steamCmdPausedByServerId}
        steamCmdQueuedByServerId={steamCmdQueuedByServerId}
        openServerLogs={openServerLogs}
        confirmDeleteServer={confirmDeleteServer}
        runPauseSteamCmd={runPauseSteamCmd}
        openSteamCmdSettings={openSteamCmdSettings}
        reports={reports}
        openServerBackups={openServerBackups}
        focusYarkUpdates={focusYarkUpdates}
        setFocusYarkUpdates={setFocusYarkUpdates}
        focusSteamCmd={focusSteamCmd}
        setFocusSteamCmd={setFocusSteamCmd}
        openNativeTerminalOnStart={openNativeTerminalOnStart}
        handleOpenNativeConsoleChange={handleOpenNativeConsoleChange}
        uiDensity={uiDensity}
        handleUiDensityChange={handleUiDensityChange}
        setDefaultBaseFolder={setDefaultBaseFolder}
        pickSteamCmdPath={() => void pickSteamCmdPath()}
        openSteamCmdCache={openSteamCmdCache}
        clearSteamCmdCache={clearSteamCmdCache}
        desktopShell={desktopShell}
        onRunSetupAgain={onRunSetupAgain}
      />
      <CloneServerDialog
        opened={overlay?.kind === "clone"}
        sourceServer={
          overlay?.kind === "clone"
            ? servers.find((s) => s.id === overlay.sourceServerId) ?? null
            : null
        }
        sourceBusy={
          overlay?.kind === "clone"
            ? statuses.get(overlay.sourceServerId)?.processLive === true
            : false
        }
        sourceHealth={
          overlay?.kind === "clone"
            ? (installationInfo.get(overlay.sourceServerId)?.health ?? null)
            : null
        }
        onClose={() => setOverlay(null)}
        onClone={async (params) =>
          runAction(() =>
            window.api.cloneServerWithParams(
              overlay?.kind === "clone" ? overlay.sourceServerId : "",
              params,
            ),
          )
        }
      />
      <DeleteServerModal
        key={deleteServerId ?? "closed"}
        opened={deleteServerId !== null}
        serverId={deleteServerId ?? ""}
        serverName={
          deleteServerId !== null
            ? (servers.find((s) => s.id === deleteServerId)?.name ?? deleteServerId)
            : ""
        }
        installDir={
          deleteServerId !== null
            ? (servers.find((s) => s.id === deleteServerId)?.installDir ?? "(unknown path)")
            : ""
        }
        installHealth={
          deleteServerId !== null
            ? (installationInfo.get(deleteServerId)?.health ?? null)
            : null
        }
        onClose={() => setDeleteServerId(null)}
        onConfirm={async (options) => {
          if (deleteServerId === null) return { ok: false };
          const targetId = deleteServerId;
          const result = await window.api.deleteServer(targetId, options);
          if (!result.ok) {
            const message = result.error ?? "Unknown error";
            const emptyWipeStale = message === EMPTY_WIPE_STALE_MESSAGE;
            if (!emptyWipeStale) {
              showOperatorError(message);
            }
            await refresh({ includeInstallation: true });
            return { ok: false, emptyWipeStale };
          }
          await refresh({ includeInstallation: true });
          return { ok: true };
        }}
      />
      {copyConfig !== null && (
        <CopyConfigurationWizard
          opened
          initialSourceId={copyConfig.sourceServerId}
          initialTargetId={copyConfig.targetServerId ?? null}
          servers={servers}
          statuses={statuses}
          onClose={() => setCopyConfig(null)}
          onCompleted={(targetIds) => {
            void refresh();
            setCopyConfig(null);
            if (targetIds.length === 1) {
              setOverlay({
                kind: "workspace",
                serverId: targetIds[0]!,
              });
            }
          }}
        />
      )}
      <ImportInstallWizard
        key={importWizardKey}
        opened={importInstallOpen}
        servers={servers}
        extraClusterOptions={extraClusterOptions}
        onClose={() => setImportInstallOpen(false)}
        onOpenClusters={() => {
          setImportInstallOpen(false);
          setOverlay(null);
          navigate("clusters");
        }}
        onImported={(profile) => {
          consumePendingSetupCluster();
          setImportInstallOpen(false);
          // Skip first-steps onboarding — imported installs already have INI/world (#254).
          setOverlay({
            kind: "workspace",
            serverId: profile.id,
          });
          void refresh();
        }}
      />
    </AppProviders>
  );
}
