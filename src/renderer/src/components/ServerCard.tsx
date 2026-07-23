import { useEffect, useRef, useState } from "react";
import type {
  ServerInstallationInfo,
  ServerProfile,
  ServerRuntimeInfo,
} from "@shared/types";
import { Icon } from "./Icon";
import serverThumbPlaceholder from "../ark-survival-evolved-video-game-logo-ark-logo-png-1a9de8d49dda69c703f6124c5bf770bf.png";

interface Props {
  server: ServerProfile;
  runtime: ServerRuntimeInfo | null;
  installation: ServerInstallationInfo | null;
  steamCmdBusy: boolean;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
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
  const { server, runtime, installation, steamCmdBusy } = props;
  const status = runtime?.status ?? "stopped";
  const isActive = status === "starting" || status === "running" || status === "stopping";
  const isInstallationReady = installation?.installed === true;
  const [customCommand, setCustomCommand] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const closeMenuAnd = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const officialVersion = installation?.officialVersion ?? null;
  const localVersion = installation?.arkVersion ?? installation?.build ?? null;
  const updateAvailable =
    isInstallationReady && officialVersion !== null && localVersion !== null && officialVersion !== localVersion;

  return (
    <article className={`server-card status-${status}`}>
      <div className="server-card-header">
        <img src={serverThumbPlaceholder} alt="" className="server-card-thumb" />
        <div className="server-card-title-block">
          <h3>{server.name}</h3>
          <span className="muted">{server.sessionName}</span>
        </div>
        <span className={`badge status-${status}`}>
          <Icon name="status" weight="fill" className="badge-icon" />
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="server-card-body">
        <div className="server-card-meta-grid">
          <div className="meta-item">
            <span className="meta-label">Jugadores</span>
            <span className="meta-value muted">—</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Mapa</span>
            <span className="meta-value">{server.map}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Cluster</span>
            <span className="meta-value">{server.clusterId ?? "—"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Mods</span>
            <span className="meta-value">{server.mods.length}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Versión</span>
            <span className="meta-value">{localVersion ?? "—"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Estado</span>
            {!isInstallationReady ? (
              <span className="meta-value muted">Sin instalar</span>
            ) : updateAvailable ? (
              <span className="meta-status warn">
                <Icon name="warning" className="meta-status-icon" />
                Update available
              </span>
            ) : (
              <span className="meta-status ok">
                <Icon name="status" weight="fill" className="meta-status-icon" />
                Up to date
              </span>
            )}
          </div>
        </div>

        {runtime?.lastError != null && <p className="card-error-text">{runtime.lastError}</p>}

        <div className="server-card-actions">
          {steamCmdBusy ? (
            <button
              className="icon-button danger"
              title="Cancelar operación de SteamCMD"
              onClick={props.onCancelSteamCmd}
            >
              <Icon name="stop" title="Cancelar operación de SteamCMD" />
            </button>
          ) : (
            <>
              <button
                className="icon-button"
                title="Iniciar"
                onClick={props.onStart}
                disabled={isActive || !isInstallationReady}
              >
                <Icon name="play" title="Iniciar" />
              </button>
              <button
                className="icon-button"
                title="Detener (con guardado)"
                onClick={props.onStop}
                disabled={!isActive}
              >
                <Icon name="pause" title="Detener (con guardado)" />
              </button>
              <button
                className="icon-button"
                title="Reiniciar"
                onClick={props.onRestart}
                disabled={!isInstallationReady}
              >
                <Icon name="restart" title="Reiniciar" />
              </button>
              <button className="icon-button" title="Abrir carpeta" onClick={props.onOpenFolder}>
                <Icon name="folder" title="Abrir carpeta" />
              </button>
              <div className="server-card-kebab" ref={menuRef}>
                {menuOpen ? (
                  <button
                    className="icon-button"
                    title="Más opciones"
                    aria-haspopup="true"
                    aria-expanded="true"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="kebab" title="Más opciones" />
                  </button>
                ) : (
                  <button
                    className="icon-button"
                    title="Más opciones"
                    aria-haspopup="true"
                    aria-expanded="false"
                    onClick={() => setMenuOpen(true)}
                  >
                    <Icon name="kebab" title="Más opciones" />
                  </button>
                )}
                {menuOpen && (
                  <div className="dropdown-menu" role="menu">
                    <button role="menuitem" onClick={closeMenuAnd(props.onEdit)}>
                      <Icon name="edit" className="button-icon" />
                      Editar servidor
                    </button>
                    <button
                      role="menuitem"
                      onClick={closeMenuAnd(props.onOpenIni)}
                      disabled={!isInstallationReady}
                    >
                      <Icon name="settings" className="button-icon" />
                      Editar INI
                    </button>
                    <button
                      role="menuitem"
                      onClick={closeMenuAnd(props.onOpenLogs)}
                      disabled={!isInstallationReady}
                    >
                      <Icon name="logs" className="button-icon" />
                      Ver logs
                    </button>
                    {isInstallationReady ? (
                      <button role="menuitem" onClick={closeMenuAnd(props.onUpdateServer)}>
                        <Icon name="update" className="button-icon" />
                        Actualizar servidor
                      </button>
                    ) : (
                      <button role="menuitem" onClick={closeMenuAnd(props.onInstallFiles)}>
                        <Icon name="download" className="button-icon" />
                        Instalar archivos
                      </button>
                    )}
                    <button role="menuitem" onClick={closeMenuAnd(props.onClone)}>
                      <Icon name="clone" className="button-icon" />
                      Clonar
                    </button>
                    {isActive && (
                      <button role="menuitem" className="danger" onClick={closeMenuAnd(props.onKill)}>
                        <Icon name="stop" className="button-icon" />
                        Forzar cierre
                      </button>
                    )}
                    <button role="menuitem" className="danger" onClick={closeMenuAnd(props.onDelete)}>
                      <Icon name="delete" className="button-icon" />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {status === "running" && !steamCmdBusy && (
          <div className="rcon">
            <div className="rcon-quick">
              {QUICK_COMMANDS.map((qc) => (
                <button key={qc.label} className="button-icon-left" onClick={() => props.onRcon(qc.command)}>
                  <Icon name="rcon" className="button-icon" />
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
                <Icon name="rcon" className="button-icon" />
                Enviar
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}

