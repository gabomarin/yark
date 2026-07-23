import { useState } from "react";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { Icon } from "./Icon";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  steamCmdBusy: boolean;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onEdit: () => void;
  onOpenIni: () => void;
  onOpenLogs: () => void;
  onOpenFolder: () => void;
  onInstallFiles: () => void;
  onUpdateServer: () => void;
  onClone: () => void;
  onDelete: () => void;
  onRcon: (command: string) => void;
  onCancelSteamCmd: () => void;
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
  const { server, runtime, installation } = props;
  const status = runtime?.status ?? "stopped";
  const isActive = status === "starting" || status === "running" || status === "stopping";
  const isInstallationReady = installation?.installed === true;
  const { steamCmdBusy } = props;
  const [customCommand, setCustomCommand] = useState("");

  return (
    <article className={`card status-${status}`}>
      <div className="card-head">
        <h3>{server.name}</h3>
        <span className={`badge status-${status}`}>
          <Icon name="status" className="badge-icon" />
          {STATUS_LABEL[status]}
        </span>
      </div>
      <dl className="card-meta">
        <div>
          <dt>[MAP] Mapa</dt>
          <dd>{server.map}</dd>
        </div>
        <div>
          <dt>[NET] Puertos</dt>
          <dd>
            {server.gamePort} / {server.queryPort} / RCON {server.rconPort}
          </dd>
        </div>
        <div>
          <dt>[CL] Cluster</dt>
          <dd>{server.clusterId ?? "—"}</dd>
        </div>
        <div>
          <dt>[MOD] Mods</dt>
          <dd>{server.mods.length > 0 ? server.mods.join(", ") : "—"}</dd>
        </div>
        <div>
          <dt>[PKG] Instalación</dt>
          <dd>
            {installation?.installed === true
              ? "Instalado"
              : installation?.installed === false
                ? "No instalado"
                : "Comprobando..."}
          </dd>
        </div>
        <div>
          <dt>[BLD] Server Build</dt>
          <dd>{installation?.build ?? "No detectado"}</dd>
        </div>
        <div>
          <dt>[VER] Server Version</dt>
          <dd>
            {installation?.arkVersion ?? "No detectada"}
            {installation?.arkVersion == null && installation?.installed === true && (
              <span
                className="muted server-version-hint"
                title="Se detecta desde ShooterGame/Saved/Logs. Debes iniciar el servidor al menos una vez para que exista la línea ARK Version."
              >
                (i)
              </span>
            )}
          </dd>
        </div>
        {runtime?.lastError != null && (
          <div className="card-error">
            <dt>Último error</dt>
            <dd>{runtime.lastError}</dd>
          </div>
        )}
      </dl>

      <div className="card-actions">
        {steamCmdBusy && (
          <button className="danger button-icon-left" onClick={props.onCancelSteamCmd}>
            <Icon name="stop" className="button-icon" />
            Cancelar SteamCMD
          </button>
        )}
        {!steamCmdBusy && (
          <>
        {!isActive && (
          <button
            className="primary button-icon-left"
            onClick={props.onStart}
            disabled={!isInstallationReady}
            title={!isInstallationReady ? "Instala los archivos del servidor primero" : undefined}
          >
            <Icon name="play" className="button-icon" />
            Iniciar
          </button>
        )}
        {isActive && (
          <>
            <button className="button-icon-left" onClick={props.onStop}>
              <Icon name="stop" className="button-icon" />
              Detener (con guardado)
            </button>
            <button className="danger button-icon-left" onClick={props.onKill}>
              <Icon name="stop" className="button-icon" />
              Forzar cierre
            </button>
          </>
        )}
        {!isActive && (
          <>
            <button className="button-icon-left" onClick={props.onEdit}>
              <Icon name="server" className="button-icon" />
              Editar
            </button>
            <button
              className="button-icon-left"
              onClick={props.onOpenIni}
              disabled={!isInstallationReady}
              title={!isInstallationReady ? "Requiere instalación lista" : undefined}
            >
              <Icon name="logs" className="button-icon" />
              INI
            </button>
            <button
              className="button-icon-left"
              onClick={props.onOpenLogs}
              disabled={!isInstallationReady}
              title={!isInstallationReady ? "Requiere instalación lista" : undefined}
            >
              <Icon name="logs" className="button-icon" />
              Logs
            </button>
            <button className="button-icon-left" onClick={props.onOpenFolder}>
              <Icon name="folder" className="button-icon" />
              Abrir carpeta
            </button>
            {isInstallationReady ? (
              <button className="button-icon-left" onClick={props.onUpdateServer}>
                <Icon name="update" className="button-icon" />
                Update server
              </button>
            ) : (
              <button className="primary button-icon-left" onClick={props.onInstallFiles}>
                <Icon name="download" className="button-icon" />
                Instalar archivos
              </button>
            )}
            <button className="button-icon-left" onClick={props.onClone}>
              <Icon name="server" className="button-icon" />
              Clonar
            </button>
            <button className="danger button-icon-left" onClick={props.onDelete}>
              <Icon name="stop" className="button-icon" />
              Eliminar
            </button>
          </>
        )}
          </>
        )}
      </div>

      {status === "running" && !steamCmdBusy && (
        <div className="rcon">
          <div className="rcon-quick">
            {QUICK_COMMANDS.map((qc) => (
              <button key={qc.label} className="button-icon-left" onClick={() => props.onRcon(qc.command)}>
                <Icon name="logs" className="button-icon" />
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
            <button className="button-icon-left" type="submit">
              <Icon name="server" className="button-icon" />
              Enviar
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
