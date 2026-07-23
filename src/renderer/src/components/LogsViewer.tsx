import { useEffect, useMemo, useState } from "react";
import type { ServerOperationalLogs, ServerProfile, ServerUpdateLogFile } from "@shared/types";
import { Icon } from "./Icon";

interface Props {
  server: ServerProfile;
  onBack?: () => void;
  initialSection?: "events" | "runtime" | "updates" | "backups";
}

const UPDATE_PAGE_SIZE = 8;

const STATUS_PILL_LABEL: Record<ServerUpdateLogFile["status"], string> = {
  success: "Success",
  failed: "Failed",
  unknown: "Desconocido",
};

function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) {
    return "—";
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function formatRelativeDateTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) {
    return `Hoy, ${time}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Ayer, ${time}`;
  }
  return `${date.toLocaleDateString()}, ${time}`;
}

function classifyLogLine(line: string): "success" | "error" | "neutral" {
  if (/error|failed|exception|fatal/i.test(line)) {
    return "error";
  }
  if (/success|completed successfully|started successfully|instalados|completado/i.test(line)) {
    return "success";
  }
  return "neutral";
}

export function LogsViewer(props: Props): JSX.Element {
  const [logs, setLogs] = useState<ServerOperationalLogs | null>(null);
  const [activeSection, setActiveSection] = useState<"events" | "runtime" | "updates" | "backups">("events");
  const [selectedUpdateFile, setSelectedUpdateFile] = useState<string | null>(null);
  const [updateContent, setUpdateContent] = useState<string>("");
  const [updateStatusFilter, setUpdateStatusFilter] = useState<"all" | "success" | "failed">("all");
  const [updatePage, setUpdatePage] = useState(1);
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
    setUpdateStatusFilter("all");
    setUpdatePage(1);
    setActiveSection(props.initialSection ?? "events");
    void load();
  }, [props.server.id]);

  useEffect(() => {
    if (props.initialSection !== undefined) {
      setActiveSection(props.initialSection);
    }
  }, [props.initialSection]);

  useEffect(() => {
    setUpdatePage(1);
  }, [updateStatusFilter]);

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

  const openUpdateLogExternally = async () => {
    if (selectedUpdateFile === null) {
      return;
    }
    setError(null);
    setInfo(null);
    const result = await window.api.openServerUpdateLogFile(props.server.id, selectedUpdateFile);
    if (!result.ok) {
      setError(result.error ?? "No se pudo abrir el log en un visor externo");
    }
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

  const filteredUpdateFiles = useMemo(() => {
    if (logs === null) {
      return [];
    }
    if (updateStatusFilter === "all") {
      return logs.updateFiles;
    }
    return logs.updateFiles.filter((file) => file.status === updateStatusFilter);
  }, [logs, updateStatusFilter]);

  const updateTotalPages = Math.max(1, Math.ceil(filteredUpdateFiles.length / UPDATE_PAGE_SIZE));
  const safeUpdatePage = Math.min(updatePage, updateTotalPages);
  const updateRangeStart =
    filteredUpdateFiles.length === 0 ? 0 : (safeUpdatePage - 1) * UPDATE_PAGE_SIZE + 1;
  const updateRangeEnd = Math.min(safeUpdatePage * UPDATE_PAGE_SIZE, filteredUpdateFiles.length);
  const pagedUpdateFiles = filteredUpdateFiles.slice(
    (safeUpdatePage - 1) * UPDATE_PAGE_SIZE,
    safeUpdatePage * UPDATE_PAGE_SIZE,
  );

  const selectedUpdateFileInfo =
    logs === null
      ? null
      : logs.updateFiles.find((file) => file.fileName === selectedUpdateFile) ?? null;

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
        <section className="logs-updates-shell">
          <div className="panel logs-update-history">
            <div className="logs-panel-head">
              <h3>Update History</h3>
            </div>
            <div className="logs-filters logs-filters-inline">
              <select
                aria-label="Filtrar updates por estado"
                value={updateStatusFilter}
                onChange={(e) => setUpdateStatusFilter(e.target.value as "all" | "success" | "failed")}
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            {logs.updateFiles.length === 0 && <p className="empty">Sin logs de update.</p>}
            {logs.updateFiles.length > 0 && filteredUpdateFiles.length === 0 && (
              <p className="empty">Ningún update coincide con el filtro actual.</p>
            )}

            <div className="logs-update-list logs-scroll">
              {pagedUpdateFiles.map((file) => (
                <button
                  key={file.fileName}
                  className={`logs-update-row ${selectedUpdateFile === file.fileName ? "active" : ""}`}
                  onClick={() => void openUpdateLog(file.fileName)}
                  disabled={busy}
                >
                  <Icon name="update" className="logs-update-row-icon" />
                  <div className="logs-update-row-main">
                    <strong>{props.server.name}</strong>
                    <span className="muted">{formatRelativeDateTime(file.modifiedAt)}</span>
                  </div>
                  <span className={`pill status-${file.status}`}>
                    {STATUS_PILL_LABEL[file.status]}
                  </span>
                </button>
              ))}
            </div>

            {filteredUpdateFiles.length > 0 && (
              <div className="logs-update-pagination">
                <span className="muted">
                  Showing {updateRangeStart}-{updateRangeEnd} of {filteredUpdateFiles.length} updates
                </span>
                <div className="logs-update-pagination-controls">
                  <button
                    onClick={() => setUpdatePage((p) => Math.max(1, p - 1))}
                    disabled={safeUpdatePage <= 1}
                  >
                    ‹
                  </button>
                  {Array.from({ length: updateTotalPages }, (_, i) => i + 1).map((pageNumber) => (
                    <button
                      key={pageNumber}
                      className={pageNumber === safeUpdatePage ? "active" : ""}
                      onClick={() => setUpdatePage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    onClick={() => setUpdatePage((p) => Math.min(updateTotalPages, p + 1))}
                    disabled={safeUpdatePage >= updateTotalPages}
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="panel logs-update-details">
            {selectedUpdateFileInfo === null ? (
              <p className="empty">Selecciona un update para ver el detalle.</p>
            ) : (
              <>
                <div className="logs-panel-head">
                  <h3>Update Details</h3>
                  <span className={`pill status-${selectedUpdateFileInfo.status}`}>
                    {STATUS_PILL_LABEL[selectedUpdateFileInfo.status]}
                  </span>
                </div>

                <div className="logs-update-details-title">
                  <Icon name="update" className="logs-update-row-icon" />
                  <div>
                    <strong>{props.server.name}</strong>
                    <span className="muted">{selectedUpdateFileInfo.fileName}</span>
                  </div>
                </div>

                <dl className="logs-update-details-grid">
                  <div>
                    <dt>Date</dt>
                    <dd>{new Date(selectedUpdateFileInfo.modifiedAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{formatDuration(selectedUpdateFileInfo.durationMs)}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatSize(selectedUpdateFileInfo.sizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>Game Update</dd>
                  </div>
                </dl>

                <div className="logs-update-details-tabs">
                  <button className="active">Log Output</button>
                  <button disabled title="Sin datos de archivos por update todavía">
                    Files
                  </button>
                </div>

                <pre className="logs-terminal logs-scroll">
                  {updateContent.length === 0
                    ? "Selecciona un log de update para ver su contenido."
                    : updateContent.split("\n").map((line, index) => (
                        <div key={index} className={`log-line-${classifyLogLine(line)}`}>
                          {line.length === 0 ? "\u00a0" : line}
                        </div>
                      ))}
                </pre>

                <div className="logs-update-details-footer">
                  <button onClick={() => void openUpdateLogExternally()}>
                    <Icon name="folder" className="button-icon" />
                    Open in external viewer
                  </button>
                </div>
              </>
            )}
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
          {props.onBack !== undefined && <button onClick={props.onBack}>Volver</button>}
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
        <div className="logs-shell">
          <nav className="logs-tabs" aria-label="Secciones de logs">
            <button
              className={activeSection === "events" ? "active" : ""}
              onClick={() => setActiveSection("events")}
            >
              Events
              {(errorsCount > 0 || warningsCount > 0) && (
                <span className="logs-tab-badge">{errorsCount + warningsCount}</span>
              )}
            </button>
            <button
              className={activeSection === "runtime" ? "active" : ""}
              onClick={() => setActiveSection("runtime")}
            >
              Runtime
            </button>
            <button
              className={activeSection === "updates" ? "active" : ""}
              onClick={() => setActiveSection("updates")}
            >
              Update Logs
            </button>
            <button
              className={activeSection === "backups" ? "active" : ""}
              onClick={() => setActiveSection("backups")}
            >
              Backups
            </button>
          </nav>

          {renderSection()}
        </div>
      )}
    </div>
  );
}

