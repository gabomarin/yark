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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
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
    const result = await window.api.readServerUpdateLog(props.server.id, fileName, 300_000);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo abrir log");
      return;
    }
    setSelectedUpdateFile(fileName);
    setUpdateContent(result.data);
  };

  return (
    <div className="logs-viewer">
      <div className="logs-header">
        <h2>Logs operativos: {props.server.name}</h2>
        <div className="logs-header-actions">
          <button onClick={() => void load()} disabled={loading || busy}>
            Recargar
          </button>
          <button onClick={props.onBack}>Volver</button>
        </div>
      </div>

      {error !== null && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {loading && <p className="muted">Cargando logs...</p>}

      {!loading && logs !== null && (
        <div className="logs-grid">
          <section className="panel">
            <h3>Update logs ({logs.updateFiles.length})</h3>
            {logs.updateFiles.length === 0 && <p className="empty">Sin logs de update.</p>}
            <div className="logs-list">
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

          <section className="panel">
            <h3>Backups ({logs.backups.length})</h3>
            {logs.backups.length === 0 && <p className="empty">Sin historial de backups.</p>}
            <div className="logs-list">
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

          <section className="panel">
            <h3>Eventos ({logs.events.length})</h3>
            {logs.events.length === 0 && <p className="empty">Sin eventos recientes.</p>}
            <ul className="events">
              {logs.events.map((event) => (
                <li key={event.id} className={event.severity}>
                  <span className="muted">{new Date(event.createdAt).toLocaleString()}</span>{" "}
                  {event.message}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {selectedUpdateFile !== null && (
        <section className="panel logs-content-panel">
          <h3>Contenido: {selectedUpdateFile}</h3>
          <pre className="logs-content">{updateContent}</pre>
        </section>
      )}
    </div>
  );
}
