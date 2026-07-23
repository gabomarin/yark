import { useEffect, useState } from "react";
import type { ServerOperationalLogs, ServerProfile } from "@shared/types";
import { Icon } from "./Icon";

interface Props {
  server: ServerProfile;
  onBack: () => void;
}

export function LogsViewer(props: Props): JSX.Element {
  const [logs, setLogs] = useState<ServerOperationalLogs | null>(null);
  const [activeSection, setActiveSection] = useState<"events" | "runtime" | "updates" | "backups">("events");
  const [selectedUpdateFile, setSelectedUpdateFile] = useState<string | null>(null);
  const [updateContent, setUpdateContent] = useState<string>("");
  const [eventSeverityFilter, setEventSeverityFilter] = useState<"all" | "info" | "warning" | "error">("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [eventQuery, setEventQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    const result = await window.api.listServerLogs(props.server.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudieron cargar logs");
      return;
    }
    setLogs(result.data);
    if (result.data.updateFiles.length > 0 && selectedUpdateFile === null) {
      const first = result.data.updateFiles[0]?.fileName ?? null;
      if (first !== null) {
        void openUpdateLog(first);
      }
    }
  };

  useEffect(() => {
    setSelectedUpdateFile(null);
    setUpdateContent("");
    setActiveSection("events");
    void load();
  }, [props.server.id]);

  const openUpdateLog = async (fileName: string) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await window.api.readServerUpdateLog(props.server.id, fileName, 300_000);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo abrir log");
      return;
    }
    setSelectedUpdateFile(fileName);
    setUpdateContent(result.data);
  };

  const copyRuntimeLog = async () => {
    if (logs === null || logs.runtimeLogLines.length === 0) {
      return;
    }
    try {
      await navigator.clipboard.writeText(logs.runtimeLogLines.join("\n"));
      setInfo("Runtime copiado al portapapeles.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo copiar al portapapeles");
    }
  };

  const exportLogs = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    const result = await window.api.exportServerLogs(props.server.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo exportar logs");
      return;
    }
    if (result.data !== null) {
      setInfo(`Logs exportados en: ${result.data}`);
    }
  };

  const copyFilteredEvents = async () => {
    if (filteredEvents.length === 0) {
      return;
    }
    const text = filteredEvents
      .map((event) => `${event.createdAt} [${event.severity}] ${event.type} ${event.message}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setInfo("Eventos filtrados copiados al portapapeles.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo copiar eventos");
    }
  };

  const buildQuickDiagnosis = (): string => {
    if (logs === null) {
      return "Sin datos de logs.";
    }

    const lines: string[] = [];
    const recentErrors = logs.events.filter((event) => event.severity === "error").slice(0, 3);
    const runtimeHints = logs.runtimeLogLines
      .filter((line) => /error|failed|timeout|timed out|exception/i.test(line))
      .slice(-3);

    lines.push(`Servidor: ${props.server.name}`);
    lines.push(`Eventos totales: ${logs.events.length}`);
    lines.push(`Eventos filtrados: ${filteredEvents.length}`);

    if (recentErrors.length === 0) {
      lines.push("No se detectaron errores recientes en eventos.");
    } else {
      lines.push("Errores recientes:");
      for (const err of recentErrors) {
        lines.push(`- ${err.createdAt}: ${err.message}`);
      }
    }

    if (runtimeHints.length === 0) {
      lines.push("Sin patrones de error en runtime (última ventana). ");
    } else {
      lines.push("Pistas runtime:");
      for (const hint of runtimeHints) {
        lines.push(`- ${hint}`);
      }
    }

    if (logs.updateFiles.length === 0) {
      lines.push("No hay archivos de update para inspección.");
    } else {
      lines.push(`Último update log: ${logs.updateFiles[0]?.fileName ?? "n/a"}`);
    }

    return lines.join("\n");
  };

  const copyDiagnosis = async () => {
    try {
      await navigator.clipboard.writeText(buildQuickDiagnosis());
      setInfo("Diagnóstico rápido copiado al portapapeles.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo copiar diagnóstico");
    }
  };

  const allEventTypes = logs === null
    ? []
    : [...new Set(logs.events.map((event) => event.type))].sort((a, b) => a.localeCompare(b));

  const filteredEvents =
    logs === null
      ? []
      : logs.events.filter((event) => {
          if (eventSeverityFilter !== "all" && event.severity !== eventSeverityFilter) {
            return false;
          }
          if (eventTypeFilter !== "all" && event.type !== eventTypeFilter) {
            return false;
          }
          if (eventQuery.trim().length > 0) {
            const query = eventQuery.trim().toLowerCase();
            if (!event.message.toLowerCase().includes(query)) {
              return false;
            }
          }
          return true;
        });

  const errorsCount = logs?.events.filter((event) => event.severity === "error").length ?? 0;
  const warningsCount = logs?.events.filter((event) => event.severity === "warning").length ?? 0;

  const renderSection = () => {
    if (logs === null) {
      return null;
    }

    if (activeSection === "events") {
      return (
        <section className="panel logs-content-panel">
          <div className="logs-panel-head">
            <h3>Eventos ({filteredEvents.length}/{logs.events.length})</h3>
            <div className="logs-actions-row">
              <button onClick={() => void copyFilteredEvents()} disabled={filteredEvents.length === 0}>
                Copiar filtrados
              </button>
              <button onClick={() => void copyDiagnosis()}>Copiar diagnóstico</button>
            </div>
          </div>

          <div className="logs-filters logs-filters-inline">
            <select
              aria-label="Filtrar eventos por severidad"
              value={eventSeverityFilter}
              onChange={(e) =>
                setEventSeverityFilter(e.target.value as "all" | "info" | "warning" | "error")
              }
            >
              <option value="all">Todas las severidades</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
            <select
              aria-label="Filtrar eventos por tipo"
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
            >
              <option value="all">Todos los tipos</option>
              {allEventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="Buscar texto en eventos"
              placeholder="Buscar en eventos..."
              value={eventQuery}
              onChange={(e) => setEventQuery(e.target.value)}
            />
          </div>

          {logs.events.length === 0 && <p className="empty">Sin eventos recientes.</p>}
          {logs.events.length > 0 && filteredEvents.length === 0 && (
            <p className="empty">No hay eventos que coincidan con el filtro actual.</p>
          )}
          <ul className="events logs-scroll logs-main-list">
            {filteredEvents.map((event) => (
              <li key={event.id} className={event.severity}>
                <span className="muted">{new Date(event.createdAt).toLocaleString()}</span>{" "}
                {event.message}
              </li>
            ))}
          </ul>
        </section>
      );
    }

    if (activeSection === "runtime") {
      return (
        <section className="panel logs-content-panel">
          <div className="logs-panel-head">
            <h3>Runtime ({logs.runtimeLogLines.length})</h3>
            <button onClick={() => void copyRuntimeLog()} disabled={logs.runtimeLogLines.length === 0}>
              Copiar
            </button>
          </div>
          {logs.runtimeLogLines.length === 0 && (
            <p className="empty">Sin salida runtime capturada todavía.</p>
          )}
          {logs.runtimeLogLines.length > 0 && (
            <pre className="logs-content logs-scroll logs-main-content">
              {logs.runtimeLogLines.join("\n")}
            </pre>
          )}
        </section>
      );
    }

    if (activeSection === "updates") {
      return (
        <section className="panel logs-content-panel">
          <div className="logs-panel-head">
            <h3>Update logs ({logs.updateFiles.length})</h3>
            <span className="muted">Selecciona un archivo para ver detalle</span>
          </div>
          <div className="logs-update-layout">
            <div className="logs-list logs-scroll logs-main-list">
              {logs.updateFiles.length === 0 && <p className="empty">Sin logs de update.</p>}
              {logs.updateFiles.map((file) => (
                <button
                  key={file.fileName}
                  className={`logs-item-button ${selectedUpdateFile === file.fileName ? "active" : ""}`}
                  onClick={() => void openUpdateLog(file.fileName)}
                  disabled={busy}
                >
                  <strong>{file.fileName}</strong>
                  <span className="muted">
                    {new Date(file.modifiedAt).toLocaleString()} | {(file.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                </button>
              ))}
            </div>
            <pre className="logs-content logs-scroll logs-main-content">
              {selectedUpdateFile === null
                ? "Selecciona un log de update para ver su contenido."
                : updateContent}
            </pre>
          </div>
        </section>
      );
    }

    return (
      <section className="panel logs-content-panel">
        <h3>Backups ({logs.backups.length})</h3>
        {logs.backups.length === 0 && <p className="empty">Sin historial de backups.</p>}
        <div className="logs-list logs-scroll logs-main-list">
          {logs.backups.map((backup) => (
            <div key={backup.id} className="logs-item">
              <strong>{backup.type}</strong>
              <span className="muted">
                {new Date(backup.createdAt).toLocaleString()} | {backup.status}
              </span>
              <span className="muted">{backup.path}</span>
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="logs-viewer">
      <div className="logs-header">
        <h2>Logs operativos: {props.server.name}</h2>
        <div className="logs-header-actions">
          <button onClick={() => void exportLogs()} disabled={loading || busy}>
            Exportar
          </button>
          <button onClick={() => void load()} disabled={loading || busy}>
            Recargar
          </button>
          <button onClick={props.onBack}>Volver</button>
        </div>
      </div>

      {info !== null && <p className="muted">{info}</p>}

      {error !== null && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {loading && <p className="muted">Cargando logs...</p>}

      {!loading && logs !== null && (
        <div className="logs-summary-grid">
          <article className="overview-card">
            <h3><Icon name="status" className="card-heading-icon" /> Errores</h3>
            <p>{errorsCount}</p>
            <span className="muted">últimos eventos</span>
          </article>
          <article className="overview-card">
            <h3><Icon name="status" className="card-heading-icon" /> Warnings</h3>
            <p>{warningsCount}</p>
            <span className="muted">a revisar</span>
          </article>
          <article className="overview-card">
            <h3><Icon name="logs" className="card-heading-icon" /> Update Logs</h3>
            <p>{logs.updateFiles.length}</p>
            <span className="muted">archivos detectados</span>
          </article>
        </div>
      )}

      {!loading && logs !== null && (
        <div className="logs-shell">
          <aside className="panel logs-nav" aria-label="Navegación de secciones de logs">
            <button
              className={activeSection === "events" ? "active" : ""}
              onClick={() => setActiveSection("events")}
            >
              <Icon name="logs" className="nav-icon" /> Eventos ({logs.events.length})
            </button>
            <button
              className={activeSection === "runtime" ? "active" : ""}
              onClick={() => setActiveSection("runtime")}
            >
              <Icon name="server" className="nav-icon" /> Runtime ({logs.runtimeLogLines.length})
            </button>
            <button
              className={activeSection === "updates" ? "active" : ""}
              onClick={() => setActiveSection("updates")}
            >
              <Icon name="update" className="nav-icon" /> Update logs ({logs.updateFiles.length})
            </button>
            <button
              className={activeSection === "backups" ? "active" : ""}
              onClick={() => setActiveSection("backups")}
            >
              <Icon name="download" className="nav-icon" /> Backups ({logs.backups.length})
            </button>
            <div className="logs-nav-diagnosis">
              <h4><Icon name="status" className="card-heading-icon" /> Diagnóstico rápido</h4>
              <pre className="logs-content logs-scroll">{buildQuickDiagnosis()}</pre>
            </div>
          </aside>

          {renderSection()}
        </div>
      )}
    </div>
  );
}
