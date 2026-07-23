import { useState } from "react";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onEdit: () => void;
  onOpenIni: () => void;
  onOpenLogs: () => void;
  onClone: () => void;
  onDelete: () => void;
  onRcon: (command: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  stopped: "Apagado",
  starting: "Iniciando…",
  running: "Activo",
  stopping: "Deteniendo…",
  error: "Error",
};

const QUICK_COMMANDS = [
  { label: "SaveWorld", command: "SaveWorld" },
  { label: "ListPlayers", command: "ListPlayers" },
  { label: "Broadcast aviso", command: "Broadcast Aviso del administrador" },
];

export function ServerCard(props: Props): JSX.Element {
  const { server, runtime } = props;
  const status = runtime?.status ?? "stopped";
  const isActive = status === "starting" || status === "running" || status === "stopping";
  const [customCommand, setCustomCommand] = useState("");

  return (
    <article className={`card status-${status}`}>
      <div className="card-head">
        <h3>{server.name}</h3>
        <span className={`badge status-${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <dl className="card-meta">
        <div>
          <dt>Mapa</dt>
          <dd>{server.map}</dd>
        </div>
        <div>
          <dt>Puertos</dt>
          <dd>
            {server.gamePort} / {server.queryPort} / RCON {server.rconPort}
          </dd>
        </div>
        <div>
          <dt>Cluster</dt>
          <dd>{server.clusterId ?? "—"}</dd>
        </div>
        <div>
          <dt>Mods</dt>
          <dd>{server.mods.length > 0 ? server.mods.join(", ") : "—"}</dd>
        </div>
        {runtime?.lastError != null && (
          <div className="card-error">
            <dt>Último error</dt>
            <dd>{runtime.lastError}</dd>
          </div>
        )}
      </dl>

      <div className="card-actions">
        {!isActive && (
          <button className="primary" onClick={props.onStart}>
            Iniciar
          </button>
        )}
        {isActive && (
          <>
            <button onClick={props.onStop}>Detener (con guardado)</button>
            <button className="danger" onClick={props.onKill}>
              Forzar cierre
            </button>
          </>
        )}
        {!isActive && (
          <>
            <button onClick={props.onEdit}>Editar</button>
            <button onClick={props.onOpenIni}>INI</button>
            <button onClick={props.onOpenLogs}>Logs</button>
            <button onClick={props.onClone}>Clonar</button>
            <button className="danger" onClick={props.onDelete}>
              Eliminar
            </button>
          </>
        )}
      </div>

      {status === "running" && (
        <div className="rcon">
          <div className="rcon-quick">
            {QUICK_COMMANDS.map((qc) => (
              <button key={qc.label} onClick={() => props.onRcon(qc.command)}>
                {qc.label}
              </button>
            ))}
          </div>
          <form
            className="rcon-custom"
            onSubmit={(e) => {
              e.preventDefault();
              if (customCommand.trim().length > 0) {
                props.onRcon(customCommand.trim());
                setCustomCommand("");
              }
            }}
          >
            <input
              type="text"
              placeholder="Comando RCON personalizado…"
              value={customCommand}
              onChange={(e) => setCustomCommand(e.target.value)}
            />
            <button type="submit">Enviar</button>
          </form>
        </div>
      )}
    </article>
  );
}
