import type { ReactElement } from "react";
import { APP_VERSION } from "@shared/app-version";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Code, List, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import type {
  AppEvent,
  ClusterComplianceReport,
  OfficialNetworkStatus,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  ServerStopProgress,
  SteamCmdCacheKind,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "@shared/types";
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
import {
  ServerWorkspacePage,
  type WorkspaceTab,
} from "@features/server-workspace/ServerWorkspacePage";
import { ServerForm } from "@features/servers/components/ServerForm/ServerForm";
import { SteamCmdProgressDock } from "@features/steamcmd/SteamCmdProgressDock";
import { SettingsPage } from "@features/settings/SettingsPage";
import {
  readDefaultBaseFolderPref,
  readOpenNativeTerminalPref,
  writeDefaultBaseFolderPref,
  writeOpenNativeTerminalPref,
  writeUiDensityPref,
  type UiDensity,
} from "@features/settings/settingsModel";
import type { Route } from "@layout/Sidebar/Sidebar";

type Overlay =
  | { kind: "create" }
  | { kind: "edit"; profile: ServerProfile }
  | {
      kind: "workspace";
      serverId: string;
      onboarding?: boolean;
      initialTab?: WorkspaceTab;
      logsFocus?: ServerLogsFocus | null;
    }
  | null;

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
  const [steamCmdStatus, setSteamCmdStatus] = useState<SteamCmdStatus | null>(null);
  const [steamCmdConsole, setSteamCmdConsole] = useState<SteamCmdConsoleSnapshot | null>(null);
  const [stopProgressByServerId, setStopProgressByServerId] = useState<
    Map<string, ServerStopProgress>
  >(new Map());
  const [route, setRoute] = useState<Route>("overview");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [openNativeTerminalOnStart, setOpenNativeTerminalOnStart] = useState(
    readOpenNativeTerminalPref,
  );
  const [uiDensity, setUiDensity] = useState<UiDensity>(initialUiDensity);
  const [defaultBaseFolder, setDefaultBaseFolder] = useState<string | null>(
    readDefaultBaseFolderPref,
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);

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

  const filteredServers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) {
      return servers;
    }
    return servers.filter((server) =>
      [server.name, server.map, server.clusterId ?? ""].some((field) =>
        field.toLowerCase().includes(query),
      ),
    );
  }, [servers, search]);

  const steamCmdBusy = steamCmdStatus?.busy === true;
  const steamCmdBusyRef = useRef(steamCmdBusy);

  const stopBusyOverlay = useMemo(() => {
    const active = [...stopProgressByServerId.values()].filter(
      (progress) => progress.active,
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
  steamCmdBusyRef.current = steamCmdBusy;
  const steamCmdServerName =
    steamCmdStatus?.serverId != null
      ? (servers.find((server) => server.id === steamCmdStatus.serverId)?.name ?? null)
      : null;

  const refresh = useCallback(async (options?: {
    includeInstallation?: boolean;
    forceOfficialCheck?: boolean;
    serversMode?: import("@shared/types").InstallationServersMode;
  }) => {
    const includeInstallation = options?.includeInstallation !== false;
    const forceOfficialCheck = options?.forceOfficialCheck === true;
    const serversMode = options?.serversMode ?? true;
    const [
      serversRes,
      statusesRes,
      installRes,
      steamCmdRes,
      steamCmdConsoleRes,
      clusterRes,
      eventsRes,
    ] = await Promise.all([
      window.api.listServers(),
      window.api.getStatuses(),
      includeInstallation
        ? window.api.getInstallationInfo(forceOfficialCheck, serversMode)
        : Promise.resolve(null),
      window.api.getSteamCmdStatus(),
      window.api.getSteamCmdConsole(140),
      window.api.checkCluster(),
      window.api.recentEvents(100),
    ]);
    if (serversRes.ok) setServers(serversRes.data);
    if (statusesRes.ok) {
      setStatuses(new Map(statusesRes.data.map((s) => [s.serverId, s])));
    }
    if (installRes !== null && installRes.ok) {
      setOfficialVersion(installRes.data.officialVersion);
      setOfficialNetworkStatus(installRes.data.officialNetworkStatus);
      setOfficialSteamBuild(installRes.data.officialSteamBuild);
      setInstallationInfo(
        new Map(installRes.data.servers.map((s) => [s.serverId, s])),
      );
    }
    if (steamCmdRes.ok) {
      setSteamCmdStatus(steamCmdRes.data);
    }
    if (steamCmdConsoleRes.ok) {
      setSteamCmdConsole(steamCmdConsoleRes.data);
    }

    if (clusterRes.ok) setReports(clusterRes.data);
    if (eventsRes.ok) setEvents(eventsRes.data);
  }, []);

  const checkForUpdates = useCallback(
    async (serverId?: string) => {
      setError(null);
      setCheckingUpdates(true);
      try {
        const installRes = await window.api.getInstallationInfo(true);
        if (!installRes.ok) {
          setError(installRes.error ?? "Could not check for updates");
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
    void refresh().finally(() => {
      if (active) {
        setOverviewLoading(false);
      }
    });
    const unsubscribeStatus = window.api.onServerStatus((info) => {
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(info.serverId, info);
        return next;
      });
    });
    const unsubscribeProgress = window.api.onSteamCmdProgress((payload) => {
      setSteamCmdStatus(payload.status);
      setSteamCmdConsole(payload.console);
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
    return () => {
      active = false;
      unsubscribeStatus();
      unsubscribeProgress();
      unsubscribeStopProgress();
    };
  }, [refresh]);

  useEffect(() => {
    // Progress arrives via push. Keep the heartbeat light: statuses/events only.
    // Full install snapshots (PowerShell VersionInfo + ASA log reads) are expensive
    // on the main process and freeze hover/click for ~1s when polled too often.
    const syncing = steamCmdStatus?.operation === "sync-files";
    const intervalMs = syncing ? 5_000 : steamCmdBusy ? 2_500 : 5_000;
    const interval = setInterval(() => {
      void refresh({ includeInstallation: false });
    }, intervalMs);
    return () => {
      clearInterval(interval);
    };
  }, [refresh, steamCmdBusy, steamCmdStatus?.operation]);

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
    async (action: () => Promise<{ ok: boolean; error?: string }>) => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Unknown error");
      }
      await refresh();
    },
    [refresh],
  );

  const startSteamFilesJob = useCallback(
    (serverId: string, kind: "install" | "update" | "verify") => {
      setError(null);
      void (async () => {
        const result =
          kind === "install"
            ? await window.api.installServerFiles(serverId)
            : kind === "verify"
              ? await window.api.verifyServerFiles(serverId)
              : await window.api.updateServerNow(serverId);
        if (!result.ok) {
          const message = result.error ?? "Unknown error";
          // Deliberate cancellation: do not show as a red error.
          if (!/cancelad/i.test(message)) {
            setError(message);
          }
        }
        await refresh();
      })();
    },
    [refresh],
  );

  const pickSteamCmdPath = useCallback(async () => {
    setError(null);
    const pick = await window.api.pickPath(
      "file",
      steamCmdStatus?.executablePath ?? undefined,
      "Select steamcmd.exe",
    );
    if (!pick.ok) {
      setError(pick.error ?? "Could not open file picker");
      return;
    }
    if (pick.data === null) {
      return;
    }

    const setRes = await window.api.setSteamCmdPath(pick.data);
    if (!setRes.ok) {
      setError(setRes.error ?? "Could not configure steamcmd.exe");
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
            setError(null);
            const result = await window.api.clearSteamCmdCache(kind);
            if (!result.ok) {
              setError(result.error ?? `Could not clear ${label}`);
              return;
            }
            notifications.show({
              title: `${label.charAt(0).toUpperCase()}${label.slice(1)} cleared`,
              message:
                "Removed. The next install or update will download what it needs.",
              color: "teal",
            });
            await refresh();
          })();
        },
      });
    },
    [refresh],
  );

  const restartServer = useCallback(
    async (id: string) => {
      setError(null);
      const res = await window.api.restartServer(id, {
        openNativeConsole: openNativeTerminalOnStart,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not restart the server");
      }
      await refresh();
    },
    [openNativeTerminalOnStart, refresh],
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

  const confirmDeleteServer = useCallback(
    (id: string) => {
      const server = servers.find((item) => item.id === id);
      const label = server?.name ?? id;
      const installDir = server?.installDir ?? "(unknown path)";
      modals.openConfirmModal({
        title: `Delete server "${label}"`,
        centered: true,
        children: (
          <Stack gap="sm">
            <Alert color="red" title="Everything will be deleted" variant="light">
              This action cannot be undone. This server in YARK and all on-disk content
              (world, configs, mods, and other files) will be deleted.
            </Alert>
            <div>
              <Text size="xs" c="dimmed" mb={4}>
                Folder that will be deleted:
              </Text>
              <Code block>{installDir}</Code>
            </div>
            <List size="sm" spacing={4}>
              <List.Item>This server in YARK</List.Item>
              <List.Item>World save</List.Item>
              <List.Item>Settings and other server files</List.Item>
            </List>
          </Stack>
        ),
        labels: { confirm: "Delete everything", cancel: "Cancel" },
        confirmProps: { color: "red" },
        onConfirm: () => {
          void runAction(() => window.api.deleteServer(id));
        },
      });
    },
    [runAction, servers],
  );

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

  const startServer = useCallback(
    (id: string) =>
      runAction(() =>
        window.api.startServer(id, {
          openNativeConsole: openNativeTerminalOnStart,
        }),
      ),
    [openNativeTerminalOnStart, runAction],
  );

  const navigate = useCallback((next: Route) => {
    setOverlay(null);
    setRoute(next);
  }, []);

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
          error={error}
          onDismissError={() => setError(null)}
          busyOverlay={stopBusyOverlay}
        >
          <ServerWorkspacePage
            servers={servers}
            selectedServerId={overlay.serverId}
            statuses={statuses}
            installationInfo={installationInfo}
            clusterReports={reports}
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
            onBack={() => setOverlay(null)}
            onCreateServer={() => setOverlay({ kind: "create" })}
            onStartServer={(id) => void startServer(id)}
            onStopServer={(id) => void runAction(() => window.api.stopServer(id))}
            onRestartServer={(id) => void restartServer(id)}
            onKillServer={(id) => confirmKillServer(id)}
            onOpenFolder={(id) => void runAction(() => window.api.openServerFolder(id))}
            onInstallFiles={(id) => startSteamFilesJob(id, "install")}
            onUpdateNow={(id) => startSteamFilesJob(id, "update")}
            onVerifyFiles={(id) => startSteamFilesJob(id, "verify")}
            onSendRcon={(id, command) =>
              void runAction(() => window.api.sendRconCommand(id, command))
            }
            onServerUpdated={() => void refresh()}
          />
        </AppShellLayout>
      );
    }

    if (overlay?.kind === "create" || overlay?.kind === "edit") {
      return (
        <ServerForm
          initial={overlay.kind === "edit" ? overlay.profile : null}
          defaultBaseFolder={defaultBaseFolder}
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
        error={error}
        onDismissError={() => setError(null)}
        busyOverlay={stopBusyOverlay}
        overview={{
          page: (
            <OverviewPage
              search={search}
              onSearchChange={setSearch}
              loading={overviewLoading}
              onCreateServer={() => setOverlay({ kind: "create" })}
              checkingUpdates={checkingUpdates}
              onCheckUpdates={() => void checkForUpdates()}
              servers={servers}
              filteredServers={filteredServers}
              runningServers={runningServers}
              statuses={statuses}
              installationInfo={installationInfo}
              officialSteamBuild={officialSteamBuild}
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
              onCloneServer={(id) => void runAction(() => window.api.cloneServer(id))}
              onDeleteServer={(id) => confirmDeleteServer(id)}
              onCancelSteamCmd={() => void runAction(() => window.api.cancelSteamCmd())}
            />
          ),
        }}
        clusters={{
          page: (
            <ClustersPage
              servers={servers}
              reports={reports}
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
              onOpenServerLogs={(serverId) =>
                openServerLogs(serverId, { section: "backups" })
              }
            />
          ),
        }}
        settings={{
          page: (
            <SettingsPage
              appVersion={APP_VERSION}
              steamCmdStatus={steamCmdStatus}
              steamCmdBusy={steamCmdBusy}
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
      {renderMain()}
      {steamCmdBusy && steamCmdStatus !== null && (
        <SteamCmdProgressDock
          status={steamCmdStatus}
          console={steamCmdConsole}
          serverName={steamCmdServerName}
          onCancel={() => void runAction(() => window.api.cancelSteamCmd())}
        />
      )}
    </AppProviders>
  );
}
