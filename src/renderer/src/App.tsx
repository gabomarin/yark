import { runWithFinally } from "@renderer/shared/async/runWithFinally";
import type { ReactElement } from "react";
import { APP_VERSION } from "@shared/app-version";
import { shouldShowWhatsNewForVersion } from "@shared/changelog";
import type { AppUpdateStatus } from "@shared/app-update";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { showOperatorError, showOperatorToast } from "@ui/operatorToast";
import {
  yarkUpdateToastCopy,
  yarkUpdateToastDedupeKey,
} from "@ui/yarkUpdateOperatorToast";
import type {
  ServerProfile,
  SessionPortSet,
  SteamCmdCacheKind,
  StartServerOptions,
} from "@shared/types";
import { EMPTY_WIPE_STALE_MESSAGE } from "@shared/types";
import {
  decideFilesJobEnqueue,
  filesJobEnqueueCopy,
  occupyingFilesJobForServer,
} from "@shared/files-job-priority";
import { isHostPortBusyError, isHostPortProbeError } from "@shared/host-port-probe-errors";
import {
  getServerUpdateState,
  isServerUpdateAvailable,
} from "@shared/server-update-status";
import { AppProviders } from "@app/AppProviders";
import { AppMainRouter } from "@app/AppMainRouter";
import type { CopyConfigSession, Overlay } from "@app/appOverlay";
import { steamCmdCardJobsByKind } from "@app/steamCmdShellModel";
import { claimStartBusy, releaseStartBusy } from "@app/startBusyGuard";
import {
  buildUpdateAllOutdatedPlan,
  canOpenUpdateAllOutdated,
  classifyUpdateAllOutdatedQueueResult,
  summarizeUpdateAllOutdatedQueue,
  type UpdateAllOutdatedPlan,
} from "@features/overview/updateAllOutdatedModel";
import { ImportInstallWizard } from "@features/servers/components/ImportInstallWizard/ImportInstallWizard";
import { useAppFleetRefresh } from "@app/useAppFleetRefresh";
import { useAppRcon } from "@app/useAppRcon";
import type { OsNotificationOpenPush } from "@shared/ipc";
import { CloneServerDialog } from "@features/servers/components/CloneServerDialog/CloneServerDialog";
import { DeleteServerModal } from "@features/servers/components/DeleteServerModal/DeleteServerModal";
import { CopyConfigurationWizard } from "@features/servers/components/CopyConfigurationWizard/CopyConfigurationWizard";
import { openHostPortProbeModal } from "@features/servers/hostPortProbeModal";
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
  type PendingSetupCluster,
  type SetupWizardMode,
} from "@features/setup-wizard/setupWizardModel";
import {
  createOnboardingRecord,
  shouldAutoShowSetupWizard,
  type OnboardingRecord,
} from "@shared/onboarding";
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
import type { ServerLogsFocus } from "@features/logs/ServerLogsPanel";

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
  /** Optimistic Start/Restart busy until IPC returns (#390). */
  const [startBusyByServerId, setStartBusyByServerId] = useState<Set<string>>(
    () => new Set(),
  );
  const startBusyByServerIdRef = useRef<Set<string>>(new Set());
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
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateAllOutdatedOpen, setUpdateAllOutdatedOpen] = useState(false);
  const [updateAllOutdatedModalPlan, setUpdateAllOutdatedModalPlan] =
    useState<UpdateAllOutdatedPlan | null>(null);
  const [updateAllOutdatedLoading, setUpdateAllOutdatedLoading] = useState(false);
  const [updateAllOutdatedQueueing, setUpdateAllOutdatedQueueing] = useState(false);
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [focusYarkUpdates, setFocusYarkUpdates] = useState(false);
  const [focusSteamCmd, setFocusSteamCmd] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogInitialTab, setChangelogInitialTab] = useState<"current" | "recent">(
    "current",
  );
  /** Blocks a late getLastSeen result from reopening after manual open/dismiss. */
  const changelogPromptSettledRef = useRef(false);
  const [setupWizardMode, setSetupWizardMode] = useState<SetupWizardMode | null>(null);
  const [setupWizardBusy, setSetupWizardBusy] = useState(false);
  const [pendingSetupCluster, setPendingSetupCluster] =
    useState<PendingSetupCluster | null>(null);
  const setupWizardPromptSettledRef = useRef(false);
  const setupWizardBusyRef = useRef(false);
  const onboardingRecordRef = useRef<OnboardingRecord | null>(null);
  const desktopShell = useDesktopShellPreferences();

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

  const persistOnboardingStatus = useCallback(
    async (
      status: "completed" | "skipped",
      cluster: PendingSetupCluster | null,
    ): Promise<boolean> => {
      if (typeof window.api.setOnboarding !== "function") {
        showOperatorError("Onboarding settings are unavailable. Try restarting YARK.");
        return false;
      }
      const record = createOnboardingRecord(status, new Date(), cluster);
      try {
        const result = await window.api.setOnboarding(record);
        if (!result.ok) {
          showOperatorError(result.error ?? "Could not save setup progress");
          return false;
        }
        onboardingRecordRef.current = result.data ?? record;
        return true;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        showOperatorError(detail, "Could not save setup progress");
        return false;
      }
    },
    [],
  );

  const closeSetupWizard = useCallback(() => {
    setSetupWizardMode(null);
  }, []);

  const finishSetupWizard = useCallback(
    async (
      status: "completed" | "skipped",
      cluster: PendingSetupCluster | null,
    ): Promise<boolean> => {
      if (setupWizardBusyRef.current) {
        return false;
      }
      setupWizardBusyRef.current = true;
      setSetupWizardBusy(true);
      return runWithFinally(async () => {
        const saved = await persistOnboardingStatus(status, cluster);
        if (!saved) {
          return false;
        }
        setPendingSetupCluster(cluster);
        closeSetupWizard();
        return true;
      }, () => {
        setupWizardBusyRef.current = false;
        setSetupWizardBusy(false);
      });
    },
    [closeSetupWizard, persistOnboardingStatus],
  );

  const consumePendingSetupCluster = useCallback(() => {
    setPendingSetupCluster(null);
    const current = onboardingRecordRef.current;
    if (current?.pendingCluster === undefined || typeof window.api.setOnboarding !== "function") {
      return;
    }
    const { pendingCluster: _pendingCluster, ...next } = current;
    void (async () => {
      try {
        const result = await window.api.setOnboarding(next);
        if (result.ok) {
          onboardingRecordRef.current = result.data ?? next;
        }
      } catch {
        // The created/imported server now owns the cluster; fleet dedupe prevents a duplicate option.
      }
    })();
  }, []);

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

  const updateAllOutdatedPlan = useMemo(
    () =>
      buildUpdateAllOutdatedPlan({
        servers,
        installationInfo,
        statuses,
        officialSteamBuild,
        criticalJobs: steamCmdStatus?.criticalJobs,
      }),
    [servers, installationInfo, statuses, officialSteamBuild, steamCmdStatus?.criticalJobs],
  );
  const canUpdateAllOutdated = canOpenUpdateAllOutdated(updateAllOutdatedPlan);

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

  const markChangelogSeen = useCallback(() => {
    changelogPromptSettledRef.current = true;
    void window.api.setLastSeenChangelogVersion(APP_VERSION);
  }, []);

  const openWhatsNew = useCallback((tab: "current" | "recent" = "current") => {
    changelogPromptSettledRef.current = true;
    setChangelogInitialTab(tab);
    setChangelogOpen(true);
  }, []);

  const onWhatsNewClick = useCallback(() => {
    openWhatsNew("current");
  }, [openWhatsNew]);

  const retryOnboardingReadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (overviewLoading) {
      return;
    }
    let cancelled = false;

    const loadOnboardingAndMaybeOpen = async (): Promise<boolean> => {
      if (
        typeof window.api.getOnboarding !== "function" ||
        setupWizardPromptSettledRef.current
      ) {
        return false;
      }
      let onboardingRes: Awaited<ReturnType<typeof window.api.getOnboarding>>;
      try {
        onboardingRes = await window.api.getOnboarding();
      } catch (error: unknown) {
        onboardingRes = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      if (cancelled) {
        return true;
      }
      if (!onboardingRes.ok) {
        showOperatorToast({
          id: "onboarding-load-failed",
          title: "Could not load setup status",
          message: `${onboardingRes.error ?? "Setup progress could not be read."} Click this message to retry.`,
          color: "red",
          autoClose: false,
          onClick: () => {
            retryOnboardingReadRef.current?.();
          },
        });
        return false;
      }
      notifications.hide("onboarding-load-failed");
      const record = onboardingRes.data;
      onboardingRecordRef.current = record;
      setPendingSetupCluster(record?.pendingCluster ?? null);
      setupWizardPromptSettledRef.current = true;
      if (
        shouldAutoShowSetupWizard({
          record,
          serverCount: servers.length,
          readOk: true,
        })
      ) {
        changelogPromptSettledRef.current = true;
        setSetupWizardMode("first-run");
        return true;
      }
      return false;
    };

    retryOnboardingReadRef.current = () => {
      void loadOnboardingAndMaybeOpen();
    };

    void (async () => {
      const openedWizard = await loadOnboardingAndMaybeOpen();
      if (openedWizard || cancelled) {
        return;
      }
      if (typeof window.api.getLastSeenChangelogVersion !== "function") {
        return;
      }
      const result = await window.api.getLastSeenChangelogVersion();
      if (cancelled || !result.ok || changelogPromptSettledRef.current) {
        return;
      }
      if (!shouldShowWhatsNewForVersion(APP_VERSION, result.data)) {
        return;
      }
      const latest = await window.api.getLastSeenChangelogVersion();
      if (cancelled || !latest.ok || changelogPromptSettledRef.current) {
        return;
      }
      if (!shouldShowWhatsNewForVersion(APP_VERSION, latest.data)) {
        return;
      }
      changelogPromptSettledRef.current = true;
      setChangelogInitialTab("current");
      setChangelogOpen(true);
    })();
    return () => {
      cancelled = true;
      retryOnboardingReadRef.current = null;
    };
  }, [overviewLoading, servers.length]);

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

  const checkForUpdates = useCallback(
    async (serverId?: string) => {
      setCheckingUpdates(true);
      await runWithFinally(
        async () => {
          const snapshot = await refresh({
            includeInstallation: true,
            forceOfficialCheck: true,
            includeServerList: false,
          });
          if (snapshot.installationInfo === null) {
            showOperatorError(
              "Could not check for updates",
              "Could not check for updates",
            );
            return;
          }
          const next = snapshot.installationInfo;
          const officialBuild = snapshot.officialSteamBuild;

        if (serverId !== undefined) {
          const info = next.get(serverId);
          const name = servers.find((s) => s.id === serverId)?.name ?? serverId;
          if (info === undefined || !info.installed) {
            notifications.show({
              title: "Not installed yet",
              message: `Install files for "${name}" before checking for updates.`,
              color: "yellow",
            });
            return;
          }
          if (officialBuild == null) {
            notifications.show({
              title: "Couldn't check",
              message: "Couldn't reach Steam right now. Check your internet and try again.",
              color: "red",
            });
            return;
          }
          if (info.steamBuild == null) {
            notifications.show({
              title: "Couldn't check",
              message: `Couldn't read the installed version for "${name}". Try Install or Verify files first.`,
              color: "yellow",
            });
            return;
          }
          if (isServerUpdateAvailable(info, officialBuild)) {
            notifications.show({
              title: "Update available",
              message: `"${name}" has a newer version. Use Update on the server card when you're ready.`,
              color: "orange",
              autoClose: 8000,
            });
          } else {
            notifications.show({
              title: "Up to date",
              message: `"${name}" is already on the latest version.`,
              color: "teal",
            });
          }
          return;
        }

        const serversInfo = [...next.values()];
        const outdated = serversInfo.filter((info) =>
          isServerUpdateAvailable(info, officialBuild),
        );
        const unverified = serversInfo.filter(
          (info) =>
            info.installed
            && getServerUpdateState(info, officialBuild) === "unknown",
        );
        if (outdated.length === 0) {
          if (unverified.length > 0) {
            notifications.show({
              title: "Couldn't check every server",
              message: `${unverified.length} server${unverified.length === 1 ? "" : "s"} don't have a version to compare. Try Install or Verify on ${unverified.length === 1 ? "that server" : "those servers"}.`,
              color: "yellow",
            });
          } else {
            notifications.show({
              title: "You're up to date",
              message: "All installed servers are on the latest version.",
              color: "teal",
            });
          }
        } else {
          const names = outdated
            .map((info) => {
              const name = servers.find((s) => s.id === info.serverId)?.name ?? info.serverId;
              return `"${name}"`;
            })
            .join(", ");
          notifications.show({
            title:
              outdated.length === 1
                ? "Update available"
                : `${outdated.length} updates available`,
            message:
              outdated.length === 1
                ? `${names} has a newer version. Use Update on the server card when you're ready.`
                : `${names} have newer versions. Use Update on each server card when you're ready.`,
            color: "orange",
            autoClose: 10000,
          });
        }
        },
        () => {
          setCheckingUpdates(false);
        },
      );
    },
    [refresh, servers],
  );

  const openUpdateAllOutdated = useCallback(async () => {
    setUpdateAllOutdatedLoading(true);
    setUpdateAllOutdatedModalPlan(null);
    await runWithFinally(
      async () => {
        const snapshot = await refresh({
          includeInstallation: true,
          forceOfficialCheck: true,
          includeServerList: false,
        });
        if (snapshot.installationInfo === null) {
          showOperatorError(
            "Could not refresh update status",
            "Could not refresh update status",
          );
          return;
        }
        const nextInstallation = snapshot.installationInfo;
        const nextPlan = buildUpdateAllOutdatedPlan({
          servers,
          installationInfo: nextInstallation,
          statuses,
          officialSteamBuild: snapshot.officialSteamBuild,
          criticalJobs: steamCmdStatus?.criticalJobs,
        });
        if (nextPlan.rows.length === 0) {
          showOperatorToast({
            title: "No outdated servers",
            message: "Every installed server is already on the latest Steam build.",
            color: "teal",
          });
          return;
        }
        setUpdateAllOutdatedModalPlan(nextPlan);
        setUpdateAllOutdatedOpen(true);
      },
      () => {
        setUpdateAllOutdatedLoading(false);
      },
    );
  }, [refresh, servers, statuses, steamCmdStatus?.criticalJobs]);

  const closeUpdateAllOutdated = useCallback(() => {
    setUpdateAllOutdatedOpen(false);
    setUpdateAllOutdatedModalPlan(null);
  }, []);

  const confirmUpdateAllOutdated = useCallback(async () => {
    setUpdateAllOutdatedQueueing(true);
    await runWithFinally(
      async () => {
        try {
          const plan = buildUpdateAllOutdatedPlan({
            servers,
            installationInfo,
            statuses,
            officialSteamBuild,
            criticalJobs: steamCmdStatus?.criticalJobs,
          });
          let queuedCount = 0;
          let replacedCount = 0;
          let failedCount = 0;
          let alreadyQueuedCount = 0;

          for (const row of plan.eligible) {
            const result = await window.api.enqueueUpdateServer(row.serverId);
            const classified = classifyUpdateAllOutdatedQueueResult({
              ok: result.ok,
              error: result.ok ? undefined : result.error,
            });
            switch (classified.action) {
              case "queued":
                queuedCount += 1;
                break;
              case "replaced-verify":
                replacedCount += 1;
                break;
              case "already-in-downloads":
                alreadyQueuedCount += 1;
                break;
              case "failed":
                failedCount += 1;
                break;
            }
          }

          // Refresh happens asynchronously; closing the modal should not wait
          // for SteamCMD/IPC updates to fully propagate.
          void refresh().catch(() => undefined);

          const summary = summarizeUpdateAllOutdatedQueue({
            queuedCount,
            replacedCount: replacedCount + alreadyQueuedCount,
            failedCount,
            skippedCount: plan.skipped.length,
          });
          showOperatorToast({
            title: summary.title,
            message: summary.message,
            color: summary.color,
            autoClose: 10000,
            onClick: () => {
              setOverlay(null);
              setRoute("downloads");
            },
          });
        } catch (err) {
          showOperatorError(
            err instanceof Error ? err.message : "Something went wrong queueing updates.",
            "Could not queue updates",
          );
        }
      },
      () => {
        setUpdateAllOutdatedQueueing(false);
        setUpdateAllOutdatedOpen(false);
        setUpdateAllOutdatedModalPlan(null);
      },
    );
  }, [
    installationInfo,
    officialSteamBuild,
    refresh,
    servers,
    statuses,
    steamCmdStatus?.criticalJobs,
  ]);

  const runAction = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> => {
      const result = await action();
      if (!result.ok) {
        showOperatorError(result.error ?? "Unknown error");
      }
      await refresh();
      return result.ok;
    },
    [refresh],
  );

  const runPauseSteamCmd = useCallback(async (): Promise<boolean> => {
    const result = await window.api.pauseSteamCmd();
    if (!result.ok) {
      const message = result.error ?? "Unknown error";
      if (/not available during rollback|cannot pause/i.test(message)) {
        showOperatorToast({
          title: "Pause unavailable",
          message,
          color: "yellow",
        });
      } else {
        showOperatorError(message);
      }
    }
    await refresh();
    return result.ok;
  }, [refresh]);

  const startSteamFilesJob = useCallback(
    (serverId: string, kind: "install" | "update" | "verify") => {
      const serverName = servers.find((server) => server.id === serverId)?.name ?? serverId;
      const operation =
        kind === "install" ? "install-files" : kind === "verify" ? "verify-files" : "update";
      const actionLabel =
        kind === "install" ? "Install" : kind === "verify" ? "Verify" : "Update";
      const occupant = occupyingFilesJobForServer(
        steamCmdStatus?.criticalJobs ?? [],
        serverId,
      );
      const decision = decideFilesJobEnqueue(operation, occupant);
      if (decision.action !== "enqueue" && decision.action !== "replace") {
        const copy = filesJobEnqueueCopy(operation, decision, serverName);
        showOperatorToast({
          id: `files-job-${decision.occupant.id}`,
          title: copy.title,
          message: copy.message,
          color: "gray",
          onClick: () => {
            setOverlay(null);
            setRoute("downloads");
          },
        });
        return;
      }
      if (decision.action === "replace") {
        const copy = filesJobEnqueueCopy(operation, decision, serverName);
        showOperatorToast({
          id: `files-replaced-${serverId}-${kind}`,
          title: copy.title,
          message: copy.message,
          color: "blue",
          onClick: () => {
            setOverlay(null);
            setRoute("downloads");
          },
        });
      } else if (steamCmdBusy) {
        showOperatorToast({
          id: `files-queued-${serverId}-${kind}`,
          title: "Added to Downloads",
          message: `${actionLabel} for "${serverName}" will start after the current SteamCMD job.`,
          color: "blue",
          onClick: () => {
            setOverlay(null);
            setRoute("downloads");
          },
        });
      }
      const labels = {
        install: {
          doneTitle: "Install finished",
          doneMessage: `Server files for "${serverName}" are ready.`,
          failTitle: "Install failed",
          cancelMessage: `Install for "${serverName}" was cancelled.`,
          pauseMessage: `Install for "${serverName}" was paused.`,
        },
        update: {
          doneTitle: "Update finished",
          doneMessage: `"${serverName}" is on the latest files.`,
          failTitle: "Update failed",
          cancelMessage: `Update for "${serverName}" was cancelled.`,
          pauseMessage: `Update for "${serverName}" was paused.`,
        },
        verify: {
          doneTitle: "Verification complete",
          doneMessage: `Integrity check for "${serverName}" finished.`,
          failTitle: "Verification failed",
          cancelMessage: `Integrity check for "${serverName}" was cancelled.`,
          pauseMessage: `Integrity check for "${serverName}" was paused.`,
        },
      } as const;
      const copy = labels[kind];
      void (async () => {
        const result =
          kind === "install"
            ? await window.api.installServerFiles(serverId)
            : kind === "verify"
              ? await window.api.verifyServerFiles(serverId)
              : await window.api.updateServerNow(serverId);
        if (!result.ok) {
          const message = result.error ?? "Unknown error";
          if (/Replaced by .+ in the Downloads queue/i.test(message)) {
            await refresh();
            return;
          }
          // Deliberate cancellation: toast, not a red global banner.
          if (
            /already in the Downloads queue|already in Downloads|Resume it from Downloads|Cancel it first, or wait/i.test(
              message,
            )
          ) {
            showOperatorToast({
              title: "Already in Downloads",
              message,
              color: "gray",
              onClick: () => {
                setOverlay(null);
                setRoute("downloads");
              },
            });
          } else if (/paused/i.test(message)) {
            showOperatorToast({
              title: "Paused",
              message: copy.pauseMessage,
              color: "yellow",
            });
          } else if (/cancell?ed|cancelad/i.test(message)) {
            showOperatorToast({
              title: "Cancelled",
              message: copy.cancelMessage,
              color: "gray",
            });
          } else {
            showOperatorError(message, copy.failTitle);
          }
        } else {
          showOperatorToast({
            title: copy.doneTitle,
            message: copy.doneMessage,
          });
        }
        await refresh();
      })();
    },
    [refresh, servers, steamCmdBusy, steamCmdStatus],
  );

  const pickSteamCmdPath = useCallback(async () => {
    const pick = await window.api.pickPath(
      "file",
      steamCmdStatus?.executablePath ?? undefined,
      "Select steamcmd.exe",
    );
    if (!pick.ok) {
      showOperatorError(pick.error ?? "Could not open file picker");
      return;
    }
    if (pick.data === null) {
      return;
    }

    const setRes = await window.api.setSteamCmdPath(pick.data);
    if (!setRes.ok) {
      showOperatorError(setRes.error ?? "Could not configure steamcmd.exe");
      return;
    }
    await refresh();
  }, [refresh, steamCmdStatus?.executablePath]);

  const openSteamCmdCache = useCallback(
    (kind: SteamCmdCacheKind) => {
      void runAction(() => window.api.openSteamCmdCache(kind));
    },
    [runAction],
  );

  const clearSteamCmdCache = useCallback(
    (kind: SteamCmdCacheKind) => {
      const label = kind === "depot" ? "download cache" : "shared server files";
      const detail =
        kind === "depot"
          ? "Removes temporary files Steam already downloaded. The next install or update will download them again."
          : "Removes the ready-made ARK server copy used to set up new servers faster. The next install will rebuild it first.";
      modals.openConfirmModal({
        title: `Clear ${label}?`,
        children: (
          <Alert color="orange" variant="light" title="Cannot be undone">
            {detail}
          </Alert>
        ),
        labels: { confirm: "Clear cache", cancel: "Cancel" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          void (async () => {
            const result = await window.api.clearSteamCmdCache(kind);
            if (!result.ok) {
              showOperatorError(result.error ?? `Could not clear ${label}`);
              return;
            }
            showOperatorToast({
              title: `${label.charAt(0).toUpperCase()}${label.slice(1)} cleared`,
              message:
                "Removed. The next install or update will download what it needs.",
            });
            await refresh();
          })();
        },
      });
    },
    [refresh],
  );

  const startServer = useCallback(
    async (id: string, options?: StartServerOptions) => {
      if (!claimStartBusy(startBusyByServerIdRef, id)) {
        return;
      }
      setStartBusyByServerId(new Set(startBusyByServerIdRef.current));
      await runWithFinally(
        async () => {
          const result = await window.api.startServer(id, {
            openNativeConsole: openNativeTerminalOnStart,
            ...options,
          });
          if (!result.ok) {
            const message = result.error ?? "Unknown error";
            if (isHostPortProbeError(message)) {
              const server = servers.find((item) => item.id === id);
              openHostPortProbeModal({
                serverName: server?.name ?? id,
                message,
                onEditPorts: () => {
                  setRoute("overview");
                  setOverlay({ kind: "workspace", serverId: id, initialTab: "server" });
                },
                onStartThisSession: (ports: SessionPortSet) => {
                  void startServer(id, { sessionPorts: ports });
                },
                onStartAnyway: isHostPortBusyError(message)
                  ? undefined
                  : () => {
                      void startServer(id, { skipPortValidation: true });
                    },
              });
            } else {
              showOperatorError(message, "Could not start server");
            }
          } else if (options?.sessionPorts != null) {
            const ports = options.sessionPorts;
            showOperatorToast({
              title: "Started with session ports",
              message: `Running on game ${ports.gamePort} / query ${ports.queryPort} / RCON ${ports.rconPort}. Saved profile ports are unchanged.`,
            });
          }
          await refresh();
        },
        () => {
          releaseStartBusy(startBusyByServerIdRef, id);
          setStartBusyByServerId(new Set(startBusyByServerIdRef.current));
        },
      );
    },
    [openNativeTerminalOnStart, refresh, servers],
  );

  const restartServer = useCallback(
    async (id: string, options?: StartServerOptions) => {
      if (!claimStartBusy(startBusyByServerIdRef, id)) {
        return;
      }
      setStartBusyByServerId(new Set(startBusyByServerIdRef.current));
      await runWithFinally(
        async () => {
          const res = await window.api.restartServer(id, {
            openNativeConsole: openNativeTerminalOnStart,
            ...options,
          });
          if (!res.ok) {
            const message = res.error ?? "Could not restart the server";
            if (isHostPortProbeError(message)) {
              const server = servers.find((item) => item.id === id);
              // Restart already stopped the process before the probe; recover via start.
              openHostPortProbeModal({
                serverName: server?.name ?? id,
                message,
                onEditPorts: () => {
                  setRoute("overview");
                  setOverlay({ kind: "workspace", serverId: id, initialTab: "server" });
                },
                onStartThisSession: (ports: SessionPortSet) => {
                  void startServer(id, { sessionPorts: ports });
                },
                onStartAnyway: isHostPortBusyError(message)
                  ? undefined
                  : () => {
                      void startServer(id, { skipPortValidation: true });
                    },
              });
            } else {
              showOperatorError(message, "Could not restart server");
            }
          } else if (options?.sessionPorts != null) {
            const ports = options.sessionPorts;
            showOperatorToast({
              title: "Restarted with session ports",
              message: `Running on game ${ports.gamePort} / query ${ports.queryPort} / RCON ${ports.rconPort}. Saved profile ports are unchanged.`,
            });
          }
          await refresh();
        },
        () => {
          releaseStartBusy(startBusyByServerIdRef, id);
          setStartBusyByServerId(new Set(startBusyByServerIdRef.current));
        },
      );
    },
    [openNativeTerminalOnStart, refresh, servers, startServer],
  );

  const confirmKillServer = useCallback(
    (id: string) => {
      const server = servers.find((item) => item.id === id);
      const label = server?.name ?? id;
      modals.openConfirmModal({
        title: `Force close "${label}"`,
        children: (
          <Alert color="red" title="No save" variant="light">
            Closes the server immediately without saving. This can corrupt the world if it was
            not saved first. Prefer Stop when possible.
          </Alert>
        ),
        labels: { confirm: "Force close", cancel: "Cancel" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          void runAction(() => window.api.killServer(id));
        },
      });
    },
    [runAction, servers],
  );

  const confirmDeleteServer = useCallback((id: string) => {
    setDeleteServerId(id);
  }, []);

  const openServerLogs = useCallback(
    (serverId: string, focus?: ServerLogsFocus) => {
      setRoute("overview");
      setOverlay({
        kind: "workspace",
        serverId,
        initialTab: "logs",
        logsFocus: focus ?? { section: "events" },
      });
    },
    [],
  );

  useEffect(() => {
    if (typeof window.api.onOsNotificationOpen !== "function") {
      return;
    }
    return window.api.onOsNotificationOpen((payload: OsNotificationOpenPush) => {
      if (payload.kind === "crash") {
        openServerLogs(payload.serverId, {
          section: "events",
          eventId: payload.eventId,
        });
        return;
      }
      if (payload.kind === "yarkUpdate") {
        openYarkUpdateSettings();
        return;
      }
      setOverlay(null);
      setRoute("downloads");
    });
  }, [openServerLogs, openYarkUpdateSettings]);

  const openServerBackups = useCallback((serverId: string) => {
    setRoute("overview");
    setOverlay({ kind: "workspace", serverId, initialTab: "backups" });
  }, []);

  const setServerEnabled = useCallback(
    (id: string, enabled: boolean) =>
      runAction(() => window.api.setServerEnabled(id, enabled)),
    [runAction],
  );

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

  const onRunSetupAgain = useCallback(() => {
    if (servers.length === 0) {
      void (async () => {
        if (typeof window.api.setOnboarding !== "function") {
          showOperatorError("Onboarding settings are unavailable. Try restarting YARK.");
          return;
        }
        try {
          const result = await window.api.setOnboarding(null);
          if (!result.ok) {
            showOperatorError(result.error ?? "Could not reset setup progress");
            return;
          }
          onboardingRecordRef.current = null;
          setPendingSetupCluster(null);
          setupWizardPromptSettledRef.current = true;
          setSetupWizardMode("first-run");
        } catch (error: unknown) {
          const detail = error instanceof Error ? error.message : String(error);
          showOperatorError(detail, "Could not reset setup progress");
        }
      })();
      return;
    }
    setSetupWizardMode("paths-shell");
  }, [servers.length]);


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
