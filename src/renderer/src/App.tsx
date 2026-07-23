import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppEvent,
  ClusterComplianceReport,
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
} from "@shared/types";
import { AppRouter } from "@app/AppRouter";
import { LogsPage } from "@features/logs/LogsPage";
import { OverviewPage } from "@features/overview/OverviewPage";
import { ServerForm } from "@features/servers/components/ServerForm/ServerForm";
import { SteamCmdPage } from "@features/steamcmd/SteamCmdPage";
import type { Route } from "@layout/Sidebar/Sidebar";
import { PlaceholderPage } from "@ui/PlaceholderPage/PlaceholderPage";

const APP_VERSION = "0.1.0";
const OPEN_NATIVE_TERMINAL_PREF_KEY = "overview.openNativeTerminalOnStart";

type LogsSection = "events" | "runtime" | "updates" | "backups";

type Overlay =
  | { kind: "create" }
  | { kind: "edit"; profile: ServerProfile }
  | { kind: "ini"; profile: ServerProfile }
  | null;

export function App(): JSX.Element {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [statuses, setStatuses] = useState<Map<string, ServerRuntimeInfo>>(new Map());
  const [installationInfo, setInstallationInfo] = useState<
    Map<string, ServerInstallationInfo>
  >(new Map());
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

  useEffect(() => {
    window.localStorage.setItem(
      OPEN_NATIVE_TERMINAL_PREF_KEY,
      openNativeTerminalOnStart ? "1" : "0",
    );
  }, [openNativeTerminalOnStart]);

  const runningServers = Array.from(statuses.values()).filter(
    (status) => status.status === "running",
  ).length;

  const officialVersion = Array.from(installationInfo.values())
    .map((info) => info.officialVersion)
    .find((value): value is string => value != null && value.trim().length > 0) ?? null;

  const warningsCount = events.filter(
    (event) => event.severity === "warning" || event.severity === "error",
  ).length;

  const okClusters = reports.filter((report) => report.ok).length;

  const updatesAvailableCount = Array.from(installationInfo.values()).filter((info) => {
    const local = info.arkVersion ?? info.build;
    return info.installed && info.officialVersion != null && local != null && info.officialVersion !== local;
  }).length;

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
      window.api.getInstallationInfo(),
      window.api.getSteamCmdStatus(),
      window.api.getSteamCmdConsole(140),
      window.api.checkCluster(),
      window.api.recentEvents(30),
    ]);
    if (serversRes.ok) setServers(serversRes.data);
    if (statusesRes.ok) {
      setStatuses(new Map(statusesRes.data.map((s) => [s.serverId, s])));
    }
    if (installRes.ok) {
      setInstallationInfo(new Map(installRes.data.map((s) => [s.serverId, s])));
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

  useEffect(() => {
    void refresh();
    const unsubscribe = window.api.onServerStatus((info) => {
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(info.serverId, info);
        return next;
      });
    });
    const interval = setInterval(() => void refresh(), 5000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [refresh]);

  const runAction = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>) => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Error desconocido");
      }
      await refresh();
    },
    [refresh],
  );

  const pickSteamCmdPath = useCallback(async () => {
    setError(null);
    const pick = await window.api.pickPath(
      "file",
      steamCmdStatus?.executablePath ?? undefined,
      "Seleccionar steamcmd.exe",
    );
    if (!pick.ok) {
      setError(pick.error ?? "No se pudo abrir selector de archivo");
      return;
    }
    if (pick.data === null) {
      return;
    }

    const setRes = await window.api.setSteamCmdPath(pick.data);
    if (!setRes.ok) {
      setError(setRes.error ?? "No se pudo configurar steamcmd.exe");
      return;
    }
    await refresh();
  }, [refresh, steamCmdStatus?.executablePath]);

  const restartServer = useCallback(
    async (id: string) => {
      setError(null);
      const stopRes = await window.api.stopServer(id);
      if (!stopRes.ok) {
        setError(stopRes.error ?? "No se pudo detener el servidor para reiniciarlo");
        await refresh();
        return;
      }
      const startRes = await window.api.startServer(id);
      if (!startRes.ok) {
        setError(startRes.error ?? "No se pudo reiniciar el servidor");
      }
      await refresh();
    },
    [refresh],
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
      const startRes = await window.api.startServer(id);
      if (!startRes.ok) {
        setError(startRes.error ?? "No se pudo iniciar el servidor");
        await refresh();
        return;
      }
      if (openNativeTerminalOnStart) {
        const terminalRes = await window.api.openServerNativeTerminal(id);
        if (!terminalRes.ok) {
          setError(terminalRes.error ?? "Servidor iniciado, pero no se pudo abrir CMD nativo");
        }
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
    if (overlay?.kind === "ini") {
      return (
        <PlaceholderPage
          title="INI Editor"
          subtitle={`La edición del INI de ${overlay.profile.name} se migrará cuando llegue su diseño dedicado.`}
        />
      );
    }

    if (overlay?.kind === "create" || overlay?.kind === "edit") {
      return (
        <ServerForm
          initial={overlay.kind === "edit" ? overlay.profile : null}
          onCancel={() => setOverlay(null)}
          onSaved={() => {
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
        steamCmdRunning={steamCmdStatus?.running === true}
        onNavigate={navigate}
        error={error}
        onDismissError={() => setError(null)}
        overview={{
          page: (
            <OverviewPage
              search={search}
              onSearchChange={setSearch}
              onCreateServer={() => setOverlay({ kind: "create" })}
              openNativeTerminalOnStart={openNativeTerminalOnStart}
              onOpenNativeTerminalOnStartChange={setOpenNativeTerminalOnStart}
              servers={servers}
              filteredServers={filteredServers}
              runningServers={runningServers}
              okClusters={okClusters}
              warningsCount={warningsCount}
              updatesAvailableCount={updatesAvailableCount}
              reports={reports}
              statuses={statuses}
              installationInfo={installationInfo}
              events={events}
              steamCmdServerId={steamCmdStatus?.serverId ?? null}
              steamCmdRunning={steamCmdStatus?.running === true}
              onEditServer={(server) => setOverlay({ kind: "edit", profile: server })}
              onOpenIni={(server) => setOverlay({ kind: "ini", profile: server })}
              onOpenLogs={(serverId) => openLogsForServer(serverId, "events")}
              onStartServer={(id) => void startServerAndOpenRuntimeLogs(id)}
              onStopServer={(id) => void runAction(() => window.api.stopServer(id))}
              onRestartServer={(id) => void restartServer(id)}
              onKillServer={(id) => void runAction(() => window.api.killServer(id))}
              onOpenFolder={(id) => void runAction(() => window.api.openServerFolder(id))}
              onInstallFiles={(id) => void runAction(() => window.api.installServerFiles(id))}
              onUpdateNow={(id) => void runAction(() => window.api.updateServerNow(id))}
              onCloneServer={(id) => void runAction(() => window.api.cloneServer(id))}
              onDeleteServer={(id) => {
                const server = servers.find((item) => item.id === id);
                const label = server?.name ?? id;
                if (window.confirm(`¿Eliminar el servidor "${label}"?`)) {
                  void runAction(() => window.api.deleteServer(id));
                }
              }}
              onSendRcon={(id, command) =>
                void runAction(() => window.api.sendRconCommand(id, command))
              }
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

  return renderMain();
}

