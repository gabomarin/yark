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
  AppEvent,
  ClusterComplianceReport,
  OfficialNetworkStatus,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
  SessionPortSet,
  SteamCmdCacheKind,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
  StartServerOptions,
} from "@shared/types";
import { EMPTY_WIPE_STALE_MESSAGE } from "@shared/types";
import { createGenerationGate } from "@shared/createGenerationGate";
import { reconcileServerList } from "./shared/reconcileServerList";
import {
  reconcileClusterReports,
  reconcileEvents,
  reconcileInstallationMap,
  reconcileStatusMap,
  reconcileSteamCmdConsole,
  reconcileSteamCmdStatus,
  upsertRuntimeStatus,
  upsertPlayerListState,
} from "./shared/reconcilePollSnapshots";
import { isHostPortBusyError, isHostPortProbeError } from "@shared/host-port-probe-errors";
import {
  getServerUpdateState,
  isServerUpdateAvailable,
} from "@shared/server-update-status";
import { AppRouter } from "@app/AppRouter";
import { AppProviders } from "@app/AppProviders";
import { AppShellLayout } from "@app/AppShellLayout";
import { ClustersPage } from "@features/clusters/ClustersPage";
import { LogsPage } from "@features/logs/LogsPage";
import type { ServerLogsFocus } from "@features/logs/ServerLogsPanel";
import { BackupsPage } from "@features/backups/BackupsPage";
import { OverviewPage } from "@features/overview/OverviewPage";
import { ImportInstallWizard } from "@features/servers/components/ImportInstallWizard/ImportInstallWizard";
import { collectAttentionIssues } from "@features/overview/components/AttentionIssuesPopover/AttentionIssuesPopover";
import {
  ServerWorkspacePage,
  type RconHistoryEntry,
  type WorkspaceTab,
} from "@features/server-workspace/ServerWorkspacePage";
import type { PlayerListState } from "@features/server-workspace/components/RconPanel/PlayerListSection";
import type { OnlinePlayerInfo, PlayerListUpdatedPush } from "@shared/ipc";
import { ServerForm } from "@features/servers/components/ServerForm/ServerForm";
import { CloneServerDialog } from "@features/servers/components/CloneServerDialog/CloneServerDialog";
import { DeleteServerModal } from "@features/servers/components/DeleteServerModal/DeleteServerModal";
import { CopyConfigurationWizard } from "@features/servers/components/CopyConfigurationWizard/CopyConfigurationWizard";
import { openHostPortProbeModal } from "@features/servers/hostPortProbeModal";
import { SteamCmdProgressDock } from "@features/steamcmd/SteamCmdProgressDock";
import { SettingsPage } from "@features/settings/SettingsPage";
import { AppChangelogModal } from "@features/settings/components/AppChangelogModal";
import {
  readDefaultBaseFolderPref,
  readOpenNativeTerminalPref,
  writeDefaultBaseFolderPref,
  writeOpenNativeTerminalPref,
  writeUiDensityPref,
  type UiDensity,
} from "@features/settings/settingsModel";
import type { Route } from "@layout/Sidebar/Sidebar";
import { AppSpotlight } from "@layout/AppSpotlight/AppSpotlight";
import { pushSpotlightRecent } from "@layout/AppSpotlight/appSpotlightRecent";

type Overlay =
  | { kind: "create" }
  | { kind: "edit"; profile: ServerProfile }
  | { kind: "clone"; sourceServerId: string }
  | {
      kind: "workspace";
      serverId: string;
      onboarding?: boolean;
      initialTab?: WorkspaceTab;
      logsFocus?: ServerLogsFocus | null;
    }
  | null;

type CopyConfigSession = {
  sourceServerId: string;
  targetServerId?: string;
};

interface AppProps {
  /** Resolved from `app_settings` (via IPC) before first paint. */
  initialUiDensity?: UiDensity;
}

export function App({ initialUiDensity = "compact" }: AppProps): ReactElement {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [statuses, setStatuses] = useState<Map<string, ServerRuntimeInfo>>(new Map());
  const [installationInfo, setInstallationInfo] = useState<
    Map<string, ServerInstallationInfo>
  >(new Map());
  const [officialVersion, setOfficialVersion] = useState<string | null>(null);
  const [officialNetworkStatus, setOfficialNetworkStatus] =
    useState<OfficialNetworkStatus>("unknown");
  const [officialSteamBuild, setOfficialSteamBuild] = useState<string | null>(null);
  const [reports, setReports] = useState<ClusterComplianceReport[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [rconHistoryByServer, setRconHistoryByServer] = useState<
    Map<string, RconHistoryEntry[]>
  >(new Map());
  const rconHistoryByServerRef = useRef(rconHistoryByServer);
  useEffect(() => {
    rconHistoryByServerRef.current = rconHistoryByServer;
  }, [rconHistoryByServer]);
  const [playerListsByServer, setPlayerListsByServer] = useState<
    Map<string, PlayerListState>
  >(new Map());
  const [steamCmdStatus, setSteamCmdStatus] = useState<SteamCmdStatus | null>(null);
  const [steamCmdConsole, setSteamCmdConsole] = useState<SteamCmdConsoleSnapshot | null>(null);
  const [stopProgressByServerId, setStopProgressByServerId] = useState<
    Map<string, ServerStopProgress>
  >(new Map());
  const [route, setRoute] = useState<Route>("overview");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [importInstallOpen, setImportInstallOpen] = useState(false);
  /** Remount Import wizard on each open so step/probe state resets without adjust-on-prop effects. */
  const [importWizardKey, setImportWizardKey] = useState(0);
  const [deleteServerId, setDeleteServerId] = useState<string | null>(null);
  /** Dirty-leave guard registered by ServerWorkspacePage while the overlay is open. */
  const workspaceLeaveGuardRef = useRef<((action: () => void) => void) | null>(null);
  const [copyConfig, setCopyConfig] = useState<CopyConfigSession | null>(null);
  const [openNativeTerminalOnStart, setOpenNativeTerminalOnStart] = useState(
    readOpenNativeTerminalPref,
  );
  const [uiDensity, setUiDensity] = useState<UiDensity>(initialUiDensity);
  const [defaultBaseFolder, setDefaultBaseFolder] = useState<string | null>(
    readDefaultBaseFolderPref,
  );
  const [search, setSearch] = useState("");
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  /** Shared install-health scan job (startup + Check Servers Health). */
  const [installScan, setInstallScan] = useState<{
    active: boolean;
    reason: "startup" | "manual" | null;
  }>({ active: false, reason: null });
  const installScanInFlightRef = useRef<Promise<void> | null>(null);
  /** Bumps on each refresh start; stale overlapping polls must not apply setState. */
  const refreshGenerationGateRef = useRef(createGenerationGate());
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [focusYarkUpdates, setFocusYarkUpdates] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogInitialTab, setChangelogInitialTab] = useState<"current" | "recent">(
    "current",
  );
  /** Blocks a late getLastSeen result from reopening after manual open/dismiss. */
  const changelogPromptSettledRef = useRef(false);

  useEffect(() => {
    writeOpenNativeTerminalPref(openNativeTerminalOnStart);
  }, [openNativeTerminalOnStart]);

  useEffect(() => {
    writeDefaultBaseFolderPref(defaultBaseFolder);
  }, [defaultBaseFolder]);

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

  const steamCmdBusy = steamCmdStatus?.busy === true;
  const steamCmdBusyRef = useRef(steamCmdBusy);

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
    steamCmdBusyRef.current = steamCmdBusy;
  }, [steamCmdBusy]);

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
    setOverlay(null);
    setRoute("settings");
    setFocusYarkUpdates(true);
  }, []);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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
      // Re-check after await: Settings/manual dismiss may have persisted seen meanwhile.
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
    };
  }, []);

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

  const steamCmdServerName =
    steamCmdStatus?.serverId != null
      ? (servers.find((server) => server.id === steamCmdStatus.serverId)?.name ?? null)
      : null;

  const refresh = useCallback(async (options?: {
    includeInstallation?: boolean;
    /** When false, skip listServers (status/SteamCMD/events poll only). Default true. */
    includeServerList?: boolean;
    forceOfficialCheck?: boolean;
    serversMode?: import("@shared/types").InstallationServersMode;
  }) => {
    const includeInstallation = options?.includeInstallation !== false;
    const includeServerList = options?.includeServerList !== false;
    const forceOfficialCheck = options?.forceOfficialCheck === true;
    const serversMode = options?.serversMode ?? true;
    const generation = refreshGenerationGateRef.current.begin();
    const [
      serversRes,
      statusesRes,
      installRes,
      steamCmdRes,
      steamCmdConsoleRes,
      clusterRes,
      eventsRes,
    ] = await Promise.all([
      includeServerList
        ? window.api.listServers()
        : Promise.resolve(null),
      window.api.getStatuses(),
      includeInstallation
        ? window.api.getInstallationInfo(forceOfficialCheck, serversMode)
        : Promise.resolve(null),
      window.api.getSteamCmdStatus(),
      window.api.getSteamCmdConsole(140),
      window.api.checkCluster(),
      window.api.recentEvents(100),
    ]);
    if (!refreshGenerationGateRef.current.isCurrent(generation)) {
      return {
        servers: null,
        statuses: null,
        installationInfo: null,
        officialSteamBuild: null,
      };
    }
    if (serversRes !== null && serversRes.ok) {
      setServers((previous) =>
        reconcileServerList(previous, serversRes.data),
      );
    }
    if (statusesRes.ok) {
      setStatuses((previous) =>
        reconcileStatusMap(previous, statusesRes.data),
      );
    }
    if (installRes !== null && installRes.ok) {
      setOfficialVersion((previous) =>
        previous === installRes.data.officialVersion
          ? previous
          : installRes.data.officialVersion,
      );
      setOfficialNetworkStatus((previous) =>
        previous === installRes.data.officialNetworkStatus
          ? previous
          : installRes.data.officialNetworkStatus,
      );
      setOfficialSteamBuild((previous) =>
        previous === installRes.data.officialSteamBuild
          ? previous
          : installRes.data.officialSteamBuild,
      );
      setInstallationInfo((previous) =>
        reconcileInstallationMap(previous, installRes.data.servers),
      );
    }
    if (steamCmdRes.ok) {
      setSteamCmdStatus((previous) =>
        reconcileSteamCmdStatus(previous, steamCmdRes.data),
      );
    }
    if (steamCmdConsoleRes.ok) {
      setSteamCmdConsole((previous) =>
        reconcileSteamCmdConsole(previous, steamCmdConsoleRes.data),
      );
    }

    if (clusterRes.ok) {
      setReports((previous) =>
        reconcileClusterReports(previous, clusterRes.data),
      );
    }
    if (eventsRes.ok) {
      setEvents((previous) => reconcileEvents(previous, eventsRes.data));
    }

    return {
      servers:
        serversRes !== null && serversRes.ok ? serversRes.data : null,
      statuses: statusesRes.ok
        ? new Map(statusesRes.data.map((s) => [s.serverId, s]))
        : null,
      installationInfo:
        installRes !== null && installRes.ok
          ? new Map(installRes.data.servers.map((s) => [s.serverId, s]))
          : null,
      officialSteamBuild:
        installRes !== null && installRes.ok
          ? installRes.data.officialSteamBuild
          : null,
    };
  }, []);

  const runInstallHealthScan = useCallback(
    async (reason: "startup" | "manual") => {
      if (installScanInFlightRef.current !== null) {
        await installScanInFlightRef.current;
        return;
      }

      setInstallScan({ active: true, reason });
      const job = (async () => {
        try {
          const snapshot = await refresh({
            includeInstallation: true,
            forceOfficialCheck: reason === "manual",
          });
          if (reason !== "manual") {
            return;
          }
          if (
            snapshot.servers === null
            || snapshot.statuses === null
            || snapshot.installationInfo === null
          ) {
            showOperatorError(
              "Try Check Servers Health again in a moment.",
              "Could not finish health check",
            );
            return;
          }
          if (snapshot.servers.length === 0) {
            showOperatorToast({
              title: "No servers to check",
              message: "Add a server first, then run Check Servers Health again.",
              color: "gray",
            });
            return;
          }
          const issues = collectAttentionIssues({
            servers: snapshot.servers,
            statuses: snapshot.statuses,
            installationInfo: snapshot.installationInfo,
            officialSteamBuild: snapshot.officialSteamBuild,
          });
          if (issues.length > 0) {
            showOperatorToast({
              title:
                issues.length === 1
                  ? "1 server needs attention"
                  : `${issues.length} servers need attention`,
              message: "Open the attention badge above the server list for details.",
              color: "orange",
              autoClose: 8000,
            });
            return;
          }
          const unverifiedInstalls = [...snapshot.installationInfo.values()].filter(
            (info) =>
              info.installed
              && getServerUpdateState(info, snapshot.officialSteamBuild) === "unknown",
          ).length;
          if (unverifiedInstalls > 0) {
            showOperatorToast({
              title: "Installs look OK; updates unverified",
              message:
                "Couldn't confirm Steam update status for every server. Try Check for updates.",
              color: "yellow",
            });
            return;
          }
          showOperatorToast({
            title: "All servers look healthy",
            message: "Install folders look good.",
          });
        } finally {
          setInstallScan({ active: false, reason: null });
        }
      })();
      installScanInFlightRef.current = job;
      try {
        await job;
      } finally {
        if (installScanInFlightRef.current === job) {
          installScanInFlightRef.current = null;
        }
      }
    },
    [refresh],
  );

  const checkForUpdates = useCallback(
    async (serverId?: string) => {
      setCheckingUpdates(true);
      try {
        const installRes = await window.api.getInstallationInfo(true);
        if (!installRes.ok) {
          showOperatorError(
            installRes.error ?? "Could not check for updates",
            "Could not check for updates",
          );
          return;
        }
        const next = new Map(
          installRes.data.servers.map((info) => [info.serverId, info]),
        );
        setOfficialVersion(installRes.data.officialVersion);
        setOfficialNetworkStatus(installRes.data.officialNetworkStatus);
        setInstallationInfo(next);
        setOfficialSteamBuild(installRes.data.officialSteamBuild);

        const officialBuild = installRes.data.officialSteamBuild;

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

        const serversInfo = installRes.data.servers;
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
      } finally {
        setCheckingUpdates(false);
      }
    },
    [servers],
  );

  useEffect(() => {
    let active = true;
    void refresh({ includeInstallation: false })
      .finally(() => {
        if (active) {
          setOverviewLoading(false);
        }
      })
      .then(() => {
        if (!active) {
          return;
        }
        // One-shot startup install-health scan — shared job with Check Servers Health (#57).
        return runInstallHealthScan("startup");
      });
    const unsubscribeStatus = window.api.onServerStatus((info) => {
      setStatuses((prev) => upsertRuntimeStatus(prev, info));
    });
    const unsubscribeProgress = window.api.onSteamCmdProgress((payload) => {
      setSteamCmdStatus((previous) =>
        reconcileSteamCmdStatus(previous, payload.status),
      );
      setSteamCmdConsole((previous) =>
        reconcileSteamCmdConsole(previous, payload.console),
      );
    });
    const unsubscribeStopProgress = window.api.onServerStopProgress((payload) => {
      setStopProgressByServerId((prev) => {
        const next = new Map(prev);
        if (payload.active) {
          next.set(payload.serverId, payload);
        } else {
          next.delete(payload.serverId);
        }
        return next;
      });
    });
    const unsubscribePlayers =
      typeof window.api.onPlayerListUpdated === "function"
        ? window.api.onPlayerListUpdated((payload: PlayerListUpdatedPush) => {
            setPlayerListsByServer((prev) =>
              upsertPlayerListState(prev, payload.serverId, {
                players: payload.players,
                error: payload.error,
                loading: false,
              }),
            );
          })
        : () => undefined;
    return () => {
      active = false;
      unsubscribeStatus();
      unsubscribeProgress();
      unsubscribeStopProgress();
      unsubscribePlayers();
    };
  }, [refresh, runInstallHealthScan]);

  useEffect(() => {
    // Overview heartbeat: statuses / SteamCMD / events only — not listServers.
    // Profiles refresh on mutation, explicit Refresh, and the slower CDN timer.
    // See docs/agent-context.md § App refresh contract (#163).
    const onServerList = route === "overview" && overlay === null;
    if (!onServerList) {
      return;
    }
    const syncing = steamCmdStatus?.operation === "sync-files";
    const intervalMs = syncing ? 5_000 : steamCmdBusy ? 2_500 : 5_000;
    const interval = setInterval(() => {
      void refresh({
        includeInstallation: false,
        includeServerList: false,
      });
    }, intervalMs);
    return () => {
      clearInterval(interval);
    };
  }, [
    refresh,
    steamCmdBusy,
    steamCmdStatus?.operation,
    route,
    overlay,
  ]);

  useEffect(() => {
    // Probe official CDN metadata periodically. Re-read local installs only when
    // official version/build changes (or the server set changes) — disk inspect is
    // expensive on the Electron main process.
    const interval = setInterval(() => {
      if (steamCmdBusyRef.current) {
        return;
      }
      void refresh({
        includeInstallation: true,
        serversMode: "when-official-changed",
      });
    }, 5 * 60_000);
    return () => {
      clearInterval(interval);
    };
  }, [refresh]);

  // After a SteamCMD/sync job finishes, refresh install snapshots once (binary + build).
  const wasSteamCmdBusyRef = useRef(false);
  useEffect(() => {
    if (steamCmdBusy) {
      wasSteamCmdBusyRef.current = true;
      return;
    }
    if (!wasSteamCmdBusyRef.current) {
      return;
    }
    wasSteamCmdBusyRef.current = false;
    void refresh({ includeInstallation: true, forceOfficialCheck: true });
  }, [steamCmdBusy, refresh]);

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

  const appendRconHistory = useCallback((serverId: string, entry: RconHistoryEntry) => {
    setRconHistoryByServer((prev) => {
      const next = new Map(prev);
      const current = next.get(serverId) ?? [];
      next.set(serverId, [entry, ...current].slice(0, 100));
      return next;
    });
  }, []);

  const patchRconHistory = useCallback(
    (
      serverId: string,
      entryId: string,
      patch: Partial<Pick<RconHistoryEntry, "status" | "response" | "error">>,
    ) => {
      setRconHistoryByServer((prev) => {
        const next = new Map(prev);
        const current = next.get(serverId) ?? [];
        next.set(
          serverId,
          current.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  ...patch,
                }
              : entry,
          ),
        );
        return next;
      });
    },
    [],
  );

  const sendRconCommand = useCallback(
    async (serverId: string, command: string): Promise<boolean> => {
      const trimmed = command.trim();
      if (trimmed.length === 0) {
        return false;
      }
      // Survive RCON tab remounts: pending lives in App-level history.
      // Ticket: only block an identical command that is already pending.
      const existing = rconHistoryByServerRef.current.get(serverId) ?? [];
      if (
        existing.some(
          (entry) =>
            entry.status === "pending" && entry.command === trimmed,
        )
      ) {
        return false;
      }

      const createdAt = new Date().toISOString();
      const entryId =
        globalThis.crypto?.randomUUID?.() ??
        `${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
      appendRconHistory(serverId, {
        id: entryId,
        command: trimmed,
        createdAt,
        status: "pending",
        response: null,
        error: null,
      });

      const result = await window.api.sendRconCommand(serverId, trimmed);
      await refresh();
      patchRconHistory(serverId, entryId, {
        status: result.ok ? "success" : "error",
        response: result.ok
          ? result.data.trim().length > 0
            ? result.data
            : null
          : null,
        error: result.ok ? null : (result.error ?? "Unknown error"),
      });

      if (!result.ok) {
        showOperatorError(result.error ?? "Unknown error", "RCON command failed");
      }
      return result.ok;
    },
    [appendRconHistory, patchRconHistory, refresh],
  );

  const clearRconHistory = useCallback((serverId: string): void => {
    setRconHistoryByServer((prev) => {
      const next = new Map(prev);
      const current = next.get(serverId) ?? [];
      // Keep in-flight commands so their result can still patch history and
      // identical-submit gating stays correct.
      next.set(
        serverId,
        current.filter((entry) => entry.status === "pending"),
      );
      return next;
    });
  }, []);

  const applyPlayerList = useCallback(
    (serverId: string, players: OnlinePlayerInfo[], error: string | null = null) => {
      setPlayerListsByServer((prev) =>
        upsertPlayerListState(prev, serverId, { players, error, loading: false }),
      );
    },
    [],
  );

  const setPlayerListLoading = useCallback((serverId: string, loading: boolean) => {
    setPlayerListsByServer((prev) => {
      const current = prev.get(serverId) ?? {
        players: [],
        error: null,
        loading: false,
      };
      return upsertPlayerListState(prev, serverId, { ...current, loading });
    });
  }, []);

  const onRconTabFocusChanged = useCallback(
    async (serverId: string, isFocused: boolean): Promise<void> => {
      if (!isFocused) return;
      setPlayerListLoading(serverId, true);
      const result = await window.api.notifyRconTabFocus(serverId, true);
      if (result.ok) {
        applyPlayerList(serverId, result.data, null);
        return;
      }
      setPlayerListsByServer((prev) => {
        const next = new Map(prev);
        const current = next.get(serverId) ?? {
          players: [],
          error: null,
          loading: false,
        };
        next.set(serverId, {
          players: current.players,
          error: result.error ?? "Could not refresh players",
          loading: false,
        });
        return next;
      });
    },
    [applyPlayerList, setPlayerListLoading],
  );

  const onRefreshPlayers = useCallback(
    async (serverId: string): Promise<void> => {
      setPlayerListLoading(serverId, true);
      const result = await window.api.refreshPlayerList(serverId);
      if (result.ok) {
        applyPlayerList(serverId, result.data, null);
        return;
      }
      setPlayerListsByServer((prev) => {
        const next = new Map(prev);
        const current = next.get(serverId) ?? {
          players: [],
          error: null,
          loading: false,
        };
        next.set(serverId, {
          players: current.players,
          error: result.error ?? "Could not refresh players",
          loading: false,
        });
        return next;
      });
    },
    [applyPlayerList, setPlayerListLoading],
  );

  const onKickPlayer = useCallback(
    async (serverId: string, playerKey: string): Promise<boolean> => {
      const command = `KickPlayer ${playerKey}`;
      const createdAt = new Date().toISOString();
      const entryId =
        globalThis.crypto?.randomUUID?.() ?? `${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
      appendRconHistory(serverId, {
        id: entryId,
        command,
        createdAt,
        status: "pending",
        response: null,
        error: null,
      });
      const result = await window.api.kickPlayer(serverId, playerKey);
      await refresh();
      patchRconHistory(serverId, entryId, {
        status: result.ok ? "success" : "error",
        response: result.ok
          ? result.data.trim().length > 0
            ? result.data
            : null
          : null,
        error: result.ok ? null : result.error ?? "Kick failed",
      });
      if (!result.ok) {
        showOperatorError(result.error ?? "Kick failed", "Kick failed");
        return false;
      }
      return true;
    },
    [appendRconHistory, patchRconHistory, refresh],
  );

  const onBanPlayer = useCallback(
    async (serverId: string, playerKey: string): Promise<boolean> => {
      const command = `BanPlayer ${playerKey}`;
      const createdAt = new Date().toISOString();
      const entryId =
        globalThis.crypto?.randomUUID?.() ?? `${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
      appendRconHistory(serverId, {
        id: entryId,
        command,
        createdAt,
        status: "pending",
        response: null,
        error: null,
      });
      const result = await window.api.banPlayer(serverId, playerKey);
      await refresh();
      patchRconHistory(serverId, entryId, {
        status: result.ok ? "success" : "error",
        response: result.ok
          ? result.data.trim().length > 0
            ? result.data
            : null
          : null,
        error: result.ok ? null : result.error ?? "Ban failed",
      });
      if (!result.ok) {
        showOperatorError(result.error ?? "Ban failed", "Ban failed");
        return false;
      }
      return true;
    },
    [appendRconHistory, patchRconHistory, refresh],
  );

  const startSteamFilesJob = useCallback(
    (serverId: string, kind: "install" | "update" | "verify") => {
      const serverName = servers.find((server) => server.id === serverId)?.name ?? serverId;
      const labels = {
        install: {
          doneTitle: "Install finished",
          doneMessage: `Server files for "${serverName}" are ready.`,
          failTitle: "Install failed",
          cancelMessage: `Install for "${serverName}" was cancelled.`,
        },
        update: {
          doneTitle: "Update finished",
          doneMessage: `"${serverName}" is on the latest files.`,
          failTitle: "Update failed",
          cancelMessage: `Update for "${serverName}" was cancelled.`,
        },
        verify: {
          doneTitle: "Verification complete",
          doneMessage: `Integrity check for "${serverName}" finished.`,
          failTitle: "Verification failed",
          cancelMessage: `Integrity check for "${serverName}" was cancelled.`,
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
          // Deliberate cancellation: toast, not a red global banner.
          if (/cancell?ed|cancelad/i.test(message)) {
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
    [refresh, servers],
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
    [openNativeTerminalOnStart, refresh, servers],
  );

  const restartServer = useCallback(
    async (id: string, options?: StartServerOptions) => {
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

  const openServerBackups = useCallback((serverId: string) => {
    setRoute("overview");
    setOverlay({ kind: "workspace", serverId, initialTab: "backups" });
  }, []);

  const setServerEnabled = useCallback(
    (id: string, enabled: boolean) =>
      runAction(() => window.api.setServerEnabled(id, enabled)),
    [runAction],
  );

  const runWithWorkspaceLeaveGuard = useCallback((action: () => void) => {
    const guard = workspaceLeaveGuardRef.current;
    if (guard !== null) {
      guard(action);
      return;
    }
    action();
  }, []);

  const navigate = useCallback(
    (next: Route) => {
      runWithWorkspaceLeaveGuard(() => {
        setOverlay(null);
        setRoute(next);
        // Only after leave-guard confirms — cancelled jumps must not hit Recent.
        pushSpotlightRecent({ kind: "nav", route: next });
      });
    },
    [runWithWorkspaceLeaveGuard],
  );

  const openServerFromSpotlight = useCallback(
    (serverId: string) => {
      runWithWorkspaceLeaveGuard(() => {
        setRoute("overview");
        setOverlay({ kind: "workspace", serverId, initialTab: "server" });
      });
    },
    [runWithWorkspaceLeaveGuard],
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

  const registerWorkspaceLeaveGuard = useCallback(
    (guard: ((action: () => void) => void) | null) => {
      workspaceLeaveGuardRef.current = guard;
    },
    [],
  );

  const renderMain = (): ReactElement => {
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
          onYarkUpdateClick={openYarkUpdateSettings}
          busyOverlay={stopBusyOverlay}
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
              steamCmdBusy && steamCmdStatus?.serverId === overlay.serverId
            }
            filesJobLabel={
              steamCmdBusy && steamCmdStatus?.serverId === overlay.serverId
                ? steamCmdStatus.operation === "update"
                  ? "Updating server files"
                  : steamCmdStatus.operation === "verify-files"
                    ? "Verifying server files"
                    : steamCmdStatus.operation === "install-files"
                      ? "Installing server files"
                      : steamCmdStatus.operation === "sync-files"
                        ? "Copying files to this server"
                        : "Updating server files"
                : null
            }
            stopProgress={
              stopProgressByServerId.get(overlay.serverId) ?? null
            }
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
            onRegisterLeaveGuard={registerWorkspaceLeaveGuard}
            onBack={() => setOverlay(null)}
            onCreateServer={() => setOverlay({ kind: "create" })}
            onImportServer={() => {
              setImportWizardKey((key) => key + 1);
              setImportInstallOpen(true);
            }}
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

    if (overlay?.kind === "create" || overlay?.kind === "edit") {
      return (
        <ServerForm
          initial={overlay.kind === "edit" ? overlay.profile : null}
          defaultBaseFolder={defaultBaseFolder}
          servers={servers}
          onOpenClusters={() => {
            setOverlay(null);
            navigate("clusters");
          }}
          onCancel={() => setOverlay(null)}
          onSaved={(created) => {
            if (overlay.kind === "create" && created !== undefined) {
              setOverlay({ kind: "workspace", serverId: created.id, onboarding: true });
              void refresh();
              return;
            }
            setOverlay(null);
            void refresh();
          }}
        />
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
        onYarkUpdateClick={openYarkUpdateSettings}
        busyOverlay={stopBusyOverlay}
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
              steamCmdProgressPercent={steamCmdStatus?.progressPercent ?? null}
              steamCmdProgressLabel={steamCmdStatus?.progressLabel ?? null}
              steamCmdProgressBytesDownloaded={steamCmdStatus?.progressBytesDownloaded ?? null}
              steamCmdProgressBytesTotal={steamCmdStatus?.progressBytesTotal ?? null}
              steamCmdOperation={steamCmdStatus?.operation ?? null}
              stopProgressByServerId={stopProgressByServerId}
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
            onCancelSteamCmd={() => void runAction(() => window.api.cancelSteamCmd())}
            />
          ),
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
              steamCmdStatus={steamCmdStatus}
              steamCmdBusy={steamCmdBusy}
              servers={servers}
              installationInfo={installationInfo}
              onOpenServer={(serverId) =>
                setOverlay({ kind: "workspace", serverId, initialTab: "server" })
              }
              openNativeTerminalOnStart={openNativeTerminalOnStart}
              onOpenNativeTerminalOnStartChange={setOpenNativeTerminalOnStart}
              uiDensity={uiDensity}
              onUiDensityChange={(density) => void handleUiDensityChange(density)}
              defaultBaseFolder={defaultBaseFolder}
              onDefaultBaseFolderChange={setDefaultBaseFolder}
              onPickSteamCmdPath={() => void pickSteamCmdPath()}
              onInstallSteamCmd={() => void runAction(() => window.api.installSteamCmd())}
              onOpenSteamCmdCache={openSteamCmdCache}
              onClearSteamCmdCache={clearSteamCmdCache}
            />
          ),
        }}
      />
    );
  };

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
      {renderMain()}
      {steamCmdStatus !== null
        && (steamCmdBusy || (steamCmdStatus.criticalJobs?.length ?? 0) > 0)
        && (
        <SteamCmdProgressDock
          status={steamCmdStatus}
          console={steamCmdConsole}
          serverName={steamCmdServerName}
          onCancel={() => void runAction(() => window.api.cancelSteamCmd())}
          onRetryJob={(id) => void runAction(() => window.api.retryCriticalJob(id))}
          onDismissJob={(id) => void runAction(() => window.api.dismissCriticalJob(id))}
          onCancelJob={(id) => void runAction(() => window.api.cancelCriticalJob(id))}
        />
      )}
      <CloneServerDialog
        opened={overlay?.kind === "clone"}
        sourceServer={
          overlay?.kind === "clone"
            ? servers.find((s) => s.id === overlay.sourceServerId) ?? null
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
        onClose={() => setImportInstallOpen(false)}
        onOpenClusters={() => {
          setImportInstallOpen(false);
          setOverlay(null);
          navigate("clusters");
        }}
        onImported={(profile) => {
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
