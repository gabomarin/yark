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
import { IniEditor } from "./components/IniEditor";
import { Icon } from "./components/Icon";
import { LogsViewer } from "./components/LogsViewer";
import { ServerCard } from "./components/ServerCard";
import { ServerForm } from "./components/ServerForm";
import { Sidebar, type Route } from "./components/Sidebar";

const APP_VERSION = "0.1.0";

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
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  const navigate = useCallback((next: Route) => {
    setOverlay(null);
    setRoute(next);
  }, []);

  const openLogsForServer = useCallback((serverId: string, section: LogsSection = "events") => {
    setOverlay(null);
    setLogsServerId(serverId);
    setLogsInitialSection(section);
    setRoute("logs");
  }, []);

  const renderOverviewPage = (): JSX.Element => (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Overview</h1>
          <span className="muted">Monitorea y administra todos tus servidores ARK</span>
        </div>
        <div className="page-header-actions">
          <div className="search-box">
            <Icon name="search" className="search-box-icon" />
            <input
              type="text"
              aria-label="Buscar servidores"
              placeholder="Buscar servidores..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="primary button-icon-left" onClick={() => setOverlay({ kind: "create" })}>
            <Icon name="server" className="button-icon" />
            + Nuevo servidor
          </button>
        </div>
      </header>

      <section className="overview-grid" aria-label="Resumen operativo">
        <article className="overview-card">
          <h2><Icon name="server" className="card-heading-icon" /> Servidores</h2>
          <p>{servers.length}</p>
          <span className="muted">{runningServers} online</span>
        </article>
        <article className="overview-card overview-card-disabled" title="Próximamente">
          <h2><Icon name="players" className="card-heading-icon" /> Jugadores</h2>
          <p>—</p>
          <span className="muted">próximamente</span>
        </article>
        <article className="overview-card">
          <h2><Icon name="cluster" className="card-heading-icon" /> Clusters</h2>
          <p>{reports.length === 0 ? "—" : `${okClusters}/${reports.length}`}</p>
          <span className="muted">{reports.length === 0 ? "sin clusters" : "transferibles"}</span>
        </article>
        <article className="overview-card overview-card-disabled" title="Próximamente">
          <h2><Icon name="download" className="card-heading-icon" /> Backups</h2>
          <p>—</p>
          <span className="muted">próximamente</span>
        </article>
        <article className="overview-card">
          <h2><Icon name="update" className="card-heading-icon" /> Updates</h2>
          <p>{updatesAvailableCount}</p>
          <span className="muted">{updatesAvailableCount > 0 ? "disponibles" : "al día"}</span>
        </article>
        <article className="overview-card">
          <h2><Icon name="warning" className="card-heading-icon" /> Advertencias</h2>
          <p>{warningsCount}</p>
          <span className="muted">{warningsCount > 0 ? "requieren atención" : "sin novedades"}</span>
        </article>
      </section>

      <section className="servers">
        <h2>
          Servidores ({filteredServers.length}
          {filteredServers.length !== servers.length ? ` de ${servers.length}` : ""})
        </h2>
        {servers.length === 0 && (
          <p className="empty">
            No hay servidores configurados. Crea el primero con “Nuevo servidor”.
          </p>
        )}
        {servers.length > 0 && filteredServers.length === 0 && (
          <p className="empty">Ningún servidor coincide con la búsqueda actual.</p>
        )}
        <div className="cards">
          {filteredServers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              runtime={statuses.get(server.id) ?? null}
              installation={installationInfo.get(server.id) ?? null}
              steamCmdBusy={
                steamCmdStatus?.running === true && steamCmdStatus.serverId === server.id
              }
              onStart={() => void runAction(() => window.api.startServer(server.id))}
              onStop={() => void runAction(() => window.api.stopServer(server.id))}
              onKill={() => void runAction(() => window.api.killServer(server.id))}
              onRestart={() => void restartServer(server.id)}
              onEdit={() => setOverlay({ kind: "edit", profile: server })}
              onOpenIni={() => setOverlay({ kind: "ini", profile: server })}
              onOpenLogs={() => openLogsForServer(server.id, "events")}
              onOpenFolder={() =>
                void runAction(() => window.api.openServerFolder(server.id))
              }
              onInstallFiles={() =>
                void runAction(() => window.api.installServerFiles(server.id))
              }
              onUpdateServer={() =>
                void runAction(() => window.api.updateServerNow(server.id))
              }
              onClone={() => void runAction(() => window.api.cloneServer(server.id))}
              onDelete={() => {
                if (window.confirm(`¿Eliminar el servidor "${server.name}"?`)) {
                  void runAction(() => window.api.deleteServer(server.id));
                }
              }}
              onRcon={(command) =>
                void runAction(() => window.api.sendRconCommand(server.id, command))
              }
              onCancelSteamCmd={() => void runAction(() => window.api.cancelSteamCmd())}
            />
          ))}
        </div>
      </section>

      <section className="panel events-panel">
        <h2>Actividad reciente</h2>
        {events.length === 0 && <p className="empty">Sin eventos recientes.</p>}
        <ul className="events events-scroll">
          {events.map((event) => (
            <li key={event.id} className={event.severity}>
              <span className="muted">{new Date(event.createdAt).toLocaleTimeString()}</span>{" "}
              {event.message}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  const renderClustersPage = (): JSX.Element => (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Clusters</h1>
          <span className="muted">Estado de compatibilidad y transferencias entre mapas</span>
        </div>
      </header>
      {reports.length === 0 && <p className="empty">Sin clusters configurados.</p>}
      <div className="cluster-grid">
        {reports.map((report) => (
          <section key={report.clusterId} className="panel cluster">
            <div className="cluster-head">
              <span className={report.ok ? "badge ok" : "badge bad"}>
                {report.ok ? "TRANSFERIBLE" : "CON ERRORES"}
              </span>
              <strong>{report.clusterId}</strong>
              <span className="muted">{report.members.length} mapas</span>
            </div>
            <ul className="issues">
              {report.issues.map((issue, i) => (
                <li key={i} className={issue.severity}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );

  const renderBackupsPage = (): JSX.Element => (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Backups</h1>
          <span className="muted">Historial de backups por servidor</span>
        </div>
      </header>
      {servers.length === 0 && <p className="empty">No hay servidores configurados todavía.</p>}
      <div className="panel backups-list">
        {servers.map((server) => (
          <div key={server.id} className="backups-list-row">
            <div>
              <strong>{server.name}</strong>
              <span className="muted">{server.map}</span>
            </div>
            <button
              className="button-icon-left"
              onClick={() => openLogsForServer(server.id, "backups")}
            >
              <Icon name="download" className="button-icon" />
              Ver backups
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSteamCmdPage = (): JSX.Element => (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>SteamCMD</h1>
          <span className="muted">Instalación, ruta del ejecutable y consola de operaciones</span>
        </div>
        <div className="page-header-actions">
          {steamCmdStatus?.detected === true ? (
            <span className="chip chip-icon" title={steamCmdStatus.executablePath ?? undefined}>
              <Icon name="download" className="chip-icon-svg" />
              SteamCMD detectado
            </span>
          ) : (
            <button
              className="button-icon-left"
              onClick={() => void runAction(() => window.api.installSteamCmd())}
            >
              <Icon name="download" className="button-icon" />
              Instalar SteamCMD
            </button>
          )}
          <button className="button-icon-left" onClick={() => void pickSteamCmdPath()}>
            <Icon name="folder" className="button-icon" />
            Elegir steamcmd.exe
          </button>
          {steamCmdStatus?.running === true && (
            <button
              className="danger button-icon-left"
              onClick={() => void runAction(() => window.api.cancelSteamCmd())}
            >
              <Icon name="stop" className="button-icon" />
              Cancelar operación
            </button>
          )}
        </div>
      </header>

      <section className="overview-grid" aria-label="Resumen SteamCMD">
        <article className="overview-card">
          <h2><Icon name="update" className="card-heading-icon" /> Estado</h2>
          <p>{steamCmdStatus?.running ? "En ejecución" : "En espera"}</p>
          <span className="muted">
            {steamCmdStatus?.operation != null
              ? `Operación: ${steamCmdStatus.operation}`
              : "sin operación activa"}
          </span>
        </article>
        <article className="overview-card">
          <h2><Icon name="server" className="card-heading-icon" /> Versión oficial</h2>
          <p className="overview-card-text">{officialVersion ?? "No detectada"}</p>
        </article>
      </section>

      <section className="panel steamcmd-console-panel">
        <h2>Consola SteamCMD</h2>
        {steamCmdConsole === null || steamCmdConsole.lines.length === 0 ? (
          <p className="empty">Sin salida de SteamCMD todavía.</p>
        ) : (
          <pre className="steamcmd-console" aria-label="Salida de SteamCMD">
            {steamCmdConsole.lines.join("\n")}
          </pre>
        )}
      </section>
    </div>
  );

  const renderLogsPage = (): JSX.Element => {
    const selected = servers.find((server) => server.id === logsServerId) ?? servers[0] ?? null;

    return (
      <div className="content-single">
        <header className="page-header logs-page-header">
          <div>
            <h1>Logs</h1>
            <span className="muted">Eventos, runtime, updates y backups por servidor</span>
          </div>
          {servers.length > 0 && (
            <div className="page-header-actions">
              <select
                aria-label="Seleccionar servidor"
                value={selected?.id ?? ""}
                onChange={(e) => {
                  setLogsServerId(e.target.value);
                  setLogsInitialSection("events");
                }}
              >
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>
        {selected === null ? (
          <p className="empty">No hay servidores configurados todavía.</p>
        ) : (
          <LogsViewer server={selected} initialSection={logsInitialSection} />
        )}
      </div>
    );
  };

  const renderSettingsPage = (): JSX.Element => (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <span className="muted">Información de la aplicación</span>
        </div>
      </header>
      <section className="panel">
        <h2>ARK Server GBO</h2>
        <p className="muted">Versión v{APP_VERSION}</p>
        <p className="muted">Más opciones de configuración estarán disponibles próximamente.</p>
      </section>
    </div>
  );

  const renderMain = (): JSX.Element => {
    if (overlay?.kind === "ini") {
      return (
        <div className="content-single">
          <IniEditor
            server={overlay.profile}
            onBack={() => {
              setOverlay(null);
              void refresh();
            }}
          />
        </div>
      );
    }

    if (overlay?.kind === "create" || overlay?.kind === "edit") {
      return (
        <div className="content-single">
          <ServerForm
            initial={overlay.kind === "edit" ? overlay.profile : null}
            onCancel={() => setOverlay(null)}
            onSaved={() => {
              setOverlay(null);
              void refresh();
            }}
          />
        </div>
      );
    }

    switch (route) {
      case "overview":
        return renderOverviewPage();
      case "clusters":
        return renderClustersPage();
      case "backups":
        return renderBackupsPage();
      case "steamcmd":
        return renderSteamCmdPage();
      case "logs":
        return renderLogsPage();
      case "settings":
        return renderSettingsPage();
      default:
        return renderOverviewPage();
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        route={route}
        onNavigate={navigate}
        steamCmdDetected={steamCmdStatus?.detected === true}
        steamCmdRunning={steamCmdStatus?.running === true}
        officialVersion={officialVersion}
        appVersion={APP_VERSION}
      />
      <div className="app-main">
        {error !== null && (
          <div className="banner error" role="alert">
            {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}
        <div className="app-main-content">{renderMain()}</div>
      </div>
    </div>
  );
}

