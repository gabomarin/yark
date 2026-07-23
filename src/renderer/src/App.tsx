import { useCallback, useEffect, useState } from "react";
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
import { LogsViewer } from "./components/LogsViewer";
import { ServerCard } from "./components/ServerCard";
import { ServerForm } from "./components/ServerForm";

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; profile: ServerProfile }
  | { kind: "ini"; profile: ServerProfile }
  | { kind: "logs"; profile: ServerProfile };

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
  const [view, setView] = useState<View>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);

  const officialVersion = Array.from(installationInfo.values())
    .map((info) => info.officialVersion)
    .find((value): value is string => value != null && value.trim().length > 0) ?? null;

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

  if (view.kind === "ini") {
    return (
      <div className="app">
        <header className="topbar">
          <h1>ARK Server GBO</h1>
        </header>
        <main className="content">
          <IniEditor
            server={view.profile}
            onBack={() => {
              setView({ kind: "list" });
              void refresh();
            }}
          />
        </main>
      </div>
    );
  }

  if (view.kind === "logs") {
    return (
      <div className="app">
        <header className="topbar">
          <h1>ARK Server GBO</h1>
        </header>
        <main className="content">
          <LogsViewer
            server={view.profile}
            onBack={() => {
              setView({ kind: "list" });
              void refresh();
            }}
          />
        </main>
      </div>
    );
  }

  if (view.kind === "create" || view.kind === "edit") {
    return (
      <div className="app">
        <header className="topbar">
          <h1>ARK Server GBO</h1>
        </header>
        <main className="content">
          <ServerForm
            initial={view.kind === "edit" ? view.profile : null}
            onCancel={() => setView({ kind: "list" })}
            onSaved={() => {
              setView({ kind: "list" });
              void refresh();
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>ARK Server GBO</h1>
        <span className="muted">Official Version: {officialVersion ?? "No detectada"}</span>
        {steamCmdStatus?.detected === true ? (
          <span className="muted" title={steamCmdStatus.executablePath ?? undefined}>
            SteamCMD detectado
          </span>
        ) : (
          <button onClick={() => void runAction(() => window.api.installSteamCmd())}>
            Instalar SteamCMD
          </button>
        )}
        <button onClick={() => void pickSteamCmdPath()}>Elegir steamcmd.exe</button>
        <button className="primary" onClick={() => setView({ kind: "create" })}>
          + Nuevo servidor
        </button>
      </header>

      {error !== null && (
        <div className="banner error" role="alert">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <main className="content">
        <section className="servers">
          <h2>Servidores ({servers.length})</h2>
          {servers.length === 0 && (
            <p className="empty">
              No hay servidores configurados. Crea el primero con “Nuevo servidor”.
            </p>
          )}
          <div className="cards">
            {servers.map((server) => (
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
                onEdit={() => setView({ kind: "edit", profile: server })}
                onOpenIni={() => setView({ kind: "ini", profile: server })}
                onOpenLogs={() => setView({ kind: "logs", profile: server })}
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
                onCancelSteamCmd={() =>
                  void runAction(() => window.api.cancelSteamCmd())
                }
              />
            ))}
          </div>
        </section>

        <aside className="sidebar">
          <section className="panel">
            <h2>Clusters</h2>
            {reports.length === 0 && <p className="empty">Sin clusters configurados.</p>}
            {reports.map((report) => (
              <div key={report.clusterId} className="cluster">
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
              </div>
            ))}
          </section>

          <section className="panel events-panel">
            <h2>Eventos recientes</h2>
            <ul className="events events-scroll">
              {events.map((event) => (
                <li key={event.id} className={event.severity}>
                  <span className="muted">
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </span>{" "}
                  {event.message}
                </li>
              ))}
            </ul>
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
        </aside>
      </main>
    </div>
  );
}
