import { useEffect, useMemo, useState } from "react";
import { applyIniPreset, listIniPresets } from "@shared/ini-presets";
import type { IniPreview, ServerIniPayload, ServerProfile, ServerIniSnapshot } from "@shared/types";

interface Props {
  server: ServerProfile;
  onBack: () => void;
}

function emptyPayload(): ServerIniPayload {
  return { gameUserSettings: "", game: "" };
}

export function IniEditor(props: Props): JSX.Element {
  const presets = listIniPresets();
  const [snapshot, setSnapshot] = useState<ServerIniSnapshot | null>(null);
  const [payload, setPayload] = useState<ServerIniPayload>(emptyPayload());
  const [preview, setPreview] = useState<IniPreview | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(presets[0]?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    void window.api.readServerIni(props.server.id).then((result) => {
      if (canceled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? "No se pudo cargar INI");
        return;
      }
      setSnapshot(result.data);
      setPayload(result.data.payload);
    });
    return () => {
      canceled = true;
    };
  }, [props.server.id]);

  const changed = useMemo(() => {
    if (snapshot === null) return false;
    return (
      payload.gameUserSettings !== snapshot.payload.gameUserSettings ||
      payload.game !== snapshot.payload.game
    );
  }, [payload, snapshot]);

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    const result = await window.api.previewServerIni(props.server.id, payload);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo generar preview");
      return;
    }
    setPreview(result.data);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const result = await window.api.saveServerIni(props.server.id, payload);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo guardar INI");
      return;
    }

    setPreview(result.data);
    const reloaded = await window.api.readServerIni(props.server.id);
    if (!reloaded.ok) {
      setError(reloaded.error ?? "Guardado parcial: no se pudo recargar");
      return;
    }
    setSnapshot(reloaded.data);
    setPayload(reloaded.data.payload);
  };

  const applyPreset = () => {
    if (selectedPresetId.length === 0) {
      return;
    }
    setPayload((prev) => applyIniPreset(prev, selectedPresetId));
    setPreview(null);
  };

  const selectedPreset = presets.find((item) => item.id === selectedPresetId) ?? null;

  return (
    <div className="ini-editor">
      <div className="ini-header">
        <h2>Editor INI: {props.server.name}</h2>
        <button onClick={props.onBack}>Volver</button>
      </div>

      {error !== null && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {loading && <p className="muted">Cargando archivos INI...</p>}

      {!loading && snapshot !== null && (
        <>
          <div className="ini-paths panel">
            <h3>Archivos objetivo</h3>
            <p className="muted">GameUserSettings.ini: {snapshot.gameUserSettingsPath}</p>
            <p className="muted">Game.ini: {snapshot.gameIniPath}</p>
          </div>

          <div className="ini-presets panel">
            <h3>Plantillas</h3>
            <div className="ini-presets-actions">
              <select
                aria-label="Seleccionar plantilla INI"
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                disabled={busy || presets.length === 0}
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button onClick={applyPreset} disabled={busy || selectedPresetId.length === 0}>
                Aplicar plantilla
              </button>
            </div>
            {selectedPreset !== null && (
              <p className="muted">{selectedPreset.description}</p>
            )}
          </div>

          <div className="ini-grid">
            <section className="panel">
              <h3>GameUserSettings.ini</h3>
              <textarea
                className="ini-textarea"
                aria-label="Contenido de GameUserSettings.ini"
                title="Contenido de GameUserSettings.ini"
                value={payload.gameUserSettings}
                onChange={(e) =>
                  setPayload((prev) => ({ ...prev, gameUserSettings: e.target.value }))
                }
              />
            </section>

            <section className="panel">
              <h3>Game.ini</h3>
              <textarea
                className="ini-textarea"
                aria-label="Contenido de Game.ini"
                title="Contenido de Game.ini"
                value={payload.game}
                onChange={(e) => setPayload((prev) => ({ ...prev, game: e.target.value }))}
              />
            </section>
          </div>

          <div className="ini-actions">
            <button onClick={() => void runPreview()} disabled={busy || !changed}>
              {busy ? "Procesando..." : "Previsualizar diff"}
            </button>
            <button className="primary" onClick={() => void save()} disabled={busy || !changed}>
              {busy ? "Guardando..." : "Guardar INI"}
            </button>
          </div>

          {preview !== null && (
            <section className="panel ini-preview">
              <h3>Preview</h3>
              <p className="muted">Cambios detectados: {preview.changedCount}</p>
              {!preview.valid && (
                <ul className="issues">
                  {preview.issues.map((issue, idx) => (
                    <li key={`${issue.fileKey}-${idx}`} className="error">
                      [{issue.fileKey}] {issue.message}
                    </li>
                  ))}
                </ul>
              )}
              {preview.valid && preview.diff.length === 0 && (
                <p className="muted">Sin cambios respecto al archivo actual.</p>
              )}
              {preview.valid && preview.diff.length > 0 && (
                <div className="ini-diff-list">
                  {preview.diff.slice(0, 300).map((entry, idx) => (
                    <div key={`${entry.fileKey}-${entry.section}-${entry.key}-${idx}`} className="ini-diff-item">
                      <span className={`badge ${entry.change === "added" ? "ok" : entry.change === "removed" ? "bad" : "status-starting"}`}>
                        {entry.change}
                      </span>
                      <strong>
                        [{entry.fileKey}] {entry.section}.{entry.key}
                      </strong>
                      <span className="muted">
                        {entry.before ?? "(vacío)"}{" -> "}{entry.after ?? "(vacío)"}
                      </span>
                    </div>
                  ))}
                  {preview.diff.length > 300 && (
                    <p className="muted">Mostrando 300 de {preview.diff.length} cambios.</p>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
