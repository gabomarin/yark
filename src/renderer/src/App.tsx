import { APP_VERSION } from "@shared/app-version";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Code, List, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import type {
  AppEvent,
  ClusterComplianceReport,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "@shared/types";
import {
  getServerUpdateState,
  isServerUpdateAvailable,
} from "@shared/server-update-status";
import { AppRouter } from "@app/AppRouter";
import { AppShellLayout } from "@app/AppShellLayout";
import { LogsPage } from "@features/logs/LogsPage";
import { OverviewPage } from "@features/overview/OverviewPage";
import { ServerWorkspacePage } from "@features/server-workspace/ServerWorkspacePage";
import { ServerForm } from "@features/servers/components/ServerForm/ServerForm";
import { SteamCmdPage } from "@features/steamcmd/SteamCmdPage";
import { SteamCmdProgressDock } from "@features/steamcmd/SteamCmdProgressDock";
import type { Route } from "@layout/Sidebar/Sidebar";

const OPEN_NATIVE_TERMINAL_PREF_KEY = "overview.openNativeTerminalOnStart";

type LogsSection = "events" | "runtime" | "updates" | "backups";

type Overlay =
  | { kind: "create" }
  | { kind: "edit"; profile: ServerProfile }
  | { kind: "workspace"; serverId: string; onboarding?: boolean }
  | null;

export function App(): JSX.Element {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [statuses, setStatuses] = useState<Map<string, ServerRuntimeInfo>>(new Map());
  const [installationInfo, setInstallationInfo] = useState<
    Map<string, ServerInstallationInfo>
  >(new Map());
  const [officialVersion, setOfficialVersion] = useState<string | null>(null);
  const [officialSteamBuild, setOfficialSteamBuild] = useState<string | null>(null);
  const [reports, setReports] = useState<ClusterComplianceReport[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [steamCmdStatus, setSteamCmdStatus] = useState<SteamCmdStatus | null>(null);
  const [steamCmdConsole, setSteamCmdConsole] = useState<SteamCmdConsoleSnapshot | null>(null);
  const [route, setRoute] = useState<Route>("overview");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [logsServerId, setLogsServerId] = useState<string | null>(null);
  const [logsInitialSection, setLogsInitialSection] = useState<LogsSection>("events");
  const [openNativeTerminalOnStart, setOpenNativeTerminalOnStart] = useState<boolean>(() => {
    const stored = window.localStorage.getItem(OPEN_NATIVE_TERMINAL_PREF_KEY);
    return stored === "1";
  });
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    window.localStorage.setItem(
      OPEN_NATIVE_TERMINAL_PREF_KEY,
      openNativeTerminalOnStart ? "1" : "0",
    );
  }, [openNativeTerminalOnStart]);

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
  const steamCmdServerName =
    steamCmdStatus?.serverId != null
      ? (servers.find((server) => server.id === steamCmdStatus.serverId)?.name ?? null)
      : null;

  const refresh = useCallback(async () => {
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
      window.api.getInstallationInfo(false),
      window.api.getSteamCmdStatus(),
      window.api.getSteamCmdConsole(140),
      window.api.checkCluster(),
      window.api.recentEvents(100),
    ]);
    if (serversRes.ok) setServers(serversRes.data);
    if (statusesRes.ok) {
      setStatuses(new Map(statusesRes.data.map((s) => [s.serverId, s])));
    }
    if (installRes.ok) {
      setOfficialVersion(installRes.data.officialVersion);
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
        setInstallationInfo(next);
        setOfficialSteamBuild(installRes.data.officialSteamBuild);

        const officialBuild = installRes.data.officialSteamBuild;

        if (serverId !== undefined) {
          const info = next.get(serverId);
          const name = servers.find((s) => s.id === serverId)?.name ?? serverId;
          if (info === undefined || !info.installed) {
            notifications.show({
              title: "Not installed",
              message: `"${name}" does not have installed files yet.`,
              color: "yellow",
            });
            return;
          }
          if (officialBuild == null) {
            notifications.show({
              title: "Could not query",
              message: "Could not fetch the public Steam build. Check your connection.",
              color: "red",
            });
            return;
          }
          if (info.steamBuild == null) {
            notifications.show({
              title: "Could not verify",
              message: `Local appmanifest not found for "${name}".`,
              color: "yellow",
            });
            return;
          }
          if (isServerUpdateAvailable(info, officialBuild)) {
            notifications.show({
              title: "Update available",
              message: `"${name}": ${info.steamBuild} → ${officialBuild}`,
              color: "orange",
              autoClose: 8000,
            });
          } else {
            notifications.show({
              title: "Up to date",
              message: `"${name}" is up to date (${info.steamBuild}).`,
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
        const official = officialBuild ?? "unknown";
        if (outdated.length === 0) {
          if (unverified.length > 0) {
            notifications.show({
              title: "Incomplete check",
              message: `${unverified.length} server(s) do not have a comparable local build. Public build: ${official}.`,
              color: "yellow",
            });
          } else {
            notifications.show({
              title: "No updates",
              message: `All installed servers are up to date. Public build: ${official}`,
              color: "teal",
            });
          }
        } else {
          const lines = outdated
            .map((info) => {
              const name = servers.find((s) => s.id === info.serverId)?.name ?? info.serverId;
              return `${name}: ${info.steamBuild ?? "—"} → ${official}`;
            })
            .join("\n");
          notifications.show({
            title: `${outdated.length} update(s) available`,
            message: `Public build: ${official}\n${lines}`,
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
    const intervalMs = steamCmdBusy ? 500 : 5000;
    const interval = setInterval(() => void refresh(), intervalMs);
    return () => {
      active = false;
      unsubscribeStatus();
      unsubscribeProgress();
      clearInterval(interval);
    };
  }, [refresh, steamCmdBusy]);

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

  const restartServer = useCallback(
    async (id: string) => {
      setError(null);
      const stopRes = await window.api.stopServer(id);
      if (!stopRes.ok) {
        setError(stopRes.error ?? "Could not stop the server for restart");
        await refresh();
        return;
      }
      const startRes = await window.api.startServer(id, {
        openNativeConsole: openNativeTerminalOnStart,
      });
      if (!startRes.ok) {
        setError(startRes.error ?? "Could not restart the server");
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
            Kills the process immediately. This can corrupt the world if it was not saved first.
            Prefer Stop when possible.
          </Alert>
        ),
        labels: { confirm: "Kill process", cancel: "Cancel" },
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
              This action cannot be undone. The manager profile and all on-disk content
              (world, configs, mods, and other files) will be deleted.
            </Alert>
            <div>
              <Text size="xs" c="dimmed" mb={4}>
                Folder that will be deleted:
              </Text>
              <Code block>{installDir}</Code>
            </div>
            <List size="sm" spacing={4}>
              <List.Item>Manager profile</List.Item>
              <List.Item>SavedArks / world</List.Item>
              <List.Item>INI configs and server data</List.Item>
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

  const openLogsForServer = useCallback((serverId: string, section: LogsSection = "events") => {
    setOverlay(null);
    setLogsServerId(serverId);
    setLogsInitialSection(section);
    setRoute("logs");
  }, []);

  const startServerAndOpenRuntimeLogs = useCallback(
    async (id: string) => {
      setError(null);
      const startRes = await window.api.startServer(id, {
        openNativeConsole: openNativeTerminalOnStart,
      });
      if (!startRes.ok) {
        setError(startRes.error ?? "Could not start the server");
        await refresh();
        return;
      }
      openLogsForServer(id, "runtime");
      await refresh();
    },
    [openLogsForServer, openNativeTerminalOnStart, refresh],
  );

  const navigate = useCallback((next: Route) => {
    setOverlay(null);
    setRoute(next);
  }, []);

  const renderMain = (): JSX.Element => {
    if (overlay?.kind === "workspace") {
      return (
        <AppShellLayout
          route="overview"
          onNavigate={navigate}
          steamCmdDetected={steamCmdStatus?.detected === true}
          steamCmdRunning={steamCmdBusy}
          officialVersion={officialVersion}
          appVersion={APP_VERSION}
          openNativeTerminalOnStart={openNativeTerminalOnStart}
          onOpenNativeTerminalOnStartChange={setOpenNativeTerminalOnStart}
          error={error}
          onDismissError={() => setError(null)}
        >
          <ServerWorkspacePage
            servers={servers}
            selectedServerId={overlay.serverId}
            statuses={statuses}
            installationInfo={installationInfo}
            clusterReports={reports}
            onboarding={overlay.onboarding === true}
            onDismissOnboarding={() =>
              setOverlay({ kind: "workspace", serverId: overlay.serverId })
            }
            onSelectServer={(serverId) => setOverlay({ kind: "workspace", serverId })}
            onBack={() => setOverlay(null)}
            onCreateServer={() => setOverlay({ kind: "create" })}
            onStartServer={(id) =>
              void runAction(() =>
                window.api.startServer(id, {
                  openNativeConsole: openNativeTerminalOnStart,
                }),
              )
            }
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
        steamCmdDetected={steamCmdStatus?.detected === true}
        steamCmdRunning={steamCmdBusy}
        openNativeTerminalOnStart={openNativeTerminalOnStart}
        onOpenNativeTerminalOnStartChange={setOpenNativeTerminalOnStart}
        onNavigate={navigate}
        error={error}
        onDismissError={() => setError(null)}
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
              onOpenWorkspace={(server) => setOverlay({ kind: "workspace", serverId: server.id })}
              onOpenLogs={(serverId) => openLogsForServer(serverId, "events")}
              onStartServer={(id) => void startServerAndOpenRuntimeLogs(id)}
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
        steamcmd={{
          page: (
            <SteamCmdPage
              steamCmdStatus={steamCmdStatus}
              steamCmdConsole={steamCmdConsole}
              officialVersion={officialVersion}
              onInstallSteamCmd={() => void runAction(() => window.api.installSteamCmd())}
              onPickSteamCmdPath={() => void pickSteamCmdPath()}
              onCancelSteamCmd={() => void runAction(() => window.api.cancelSteamCmd())}
            />
          ),
        }}
        logs={{
          page: (
            <LogsPage
              servers={servers}
              selectedServerId={logsServerId}
              onSelectedServerChange={setLogsServerId}
              initialSection={logsInitialSection}
            />
          ),
        }}
      />
    );
  };

  return (
    <>
      {renderMain()}
      {steamCmdBusy && steamCmdStatus !== null && route !== "steamcmd" && (
        <SteamCmdProgressDock
          status={steamCmdStatus}
          console={steamCmdConsole}
          serverName={steamCmdServerName}
          onCancel={() => void runAction(() => window.api.cancelSteamCmd())}
          onOpenSteamCmdPage={() => navigate("steamcmd")}
        />
      )}
    </>
  );
}
