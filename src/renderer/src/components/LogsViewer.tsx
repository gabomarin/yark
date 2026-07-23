import { useEffect, useState } from "react";
import type { ServerOperationalLogs, ServerProfile } from "@shared/types";

interface Props {
  server: ServerProfile;
  onBack: () => void;
}

export function LogsViewer(props: Props): JSX.Element {
  const [logs, setLogs] = useState<ServerOperationalLogs | null>(null);
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
  };

  useEffect(() => {
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
        <div className="logs-grid">
          <section className="panel logs-panel">
            <h3>Update logs ({logs.updateFiles.length})</h3>
            {logs.updateFiles.length === 0 && <p className="empty">Sin logs de update.</p>}
            <div className="logs-list logs-scroll">
              {logs.updateFiles.map((file) => (
                <div key={file.fileName} className="logs-item">
                  <strong>{file.fileName}</strong>
                  <span className="muted">
                    {new Date(file.modifiedAt).toLocaleString()} | {(file.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                  <button onClick={() => void openUpdateLog(file.fileName)} disabled={busy}>
                    Ver contenido
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="panel logs-panel">
            <h3>Backups ({logs.backups.length})</h3>
            {logs.backups.length === 0 && <p className="empty">Sin historial de backups.</p>}
            <div className="logs-list logs-scroll">
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

          <section className="panel logs-panel">
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
              <pre className="logs-content logs-scroll">
                {logs.runtimeLogLines.join("\n")}
              </pre>
            )}
          </section>

          <section className="panel logs-panel">
            <h3>Eventos ({filteredEvents.length}/{logs.events.length})</h3>
            <div className="logs-filters">
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
            <div className="logs-actions-row">
              <button onClick={() => void copyFilteredEvents()} disabled={filteredEvents.length === 0}>
                Copiar filtrados
              </button>
              <button onClick={() => void copyDiagnosis()}>Copiar diagnóstico</button>
            </div>
            <ul className="events logs-scroll">
              {filteredEvents.map((event) => (
                <li key={event.id} className={event.severity}>
                  <span className="muted">{new Date(event.createdAt).toLocaleString()}</span>{" "}
                  {event.message}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {!loading && logs !== null && (
        <section className="panel logs-content-panel">
          <h3>Diagnóstico rápido</h3>
          <pre className="logs-content logs-scroll">{buildQuickDiagnosis()}</pre>
        </section>
      )}

      {selectedUpdateFile !== null && (
        <section className="panel logs-content-panel">
          <h3>Contenido: {selectedUpdateFile}</h3>
          <pre className="logs-content logs-scroll">{updateContent}</pre>
        </section>
      )}
    </div>
  );
}
