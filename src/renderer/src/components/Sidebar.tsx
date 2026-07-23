import { Icon, type IconName } from "./Icon";

export type Route = "overview" | "clusters" | "backups" | "steamcmd" | "logs" | "settings";

interface NavItem {
  id: Route;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: "status" },
  { id: "clusters", label: "Clusters", icon: "cluster" },
  { id: "backups", label: "Backups", icon: "download" },
  { id: "steamcmd", label: "SteamCMD", icon: "update" },
  { id: "logs", label: "Logs", icon: "logs" },
  { id: "settings", label: "Settings", icon: "settings" },
];

interface Props {
  route: Route;
  onNavigate: (route: Route) => void;
  steamCmdDetected: boolean;
  steamCmdRunning: boolean;
  officialVersion: string | null;
  appVersion: string;
}

export function Sidebar(props: Props): JSX.Element {
  const steamCmdLabel = !props.steamCmdDetected
    ? "SteamCMD: no detectado"
    : props.steamCmdRunning
      ? "SteamCMD: en ejecución"
      : "SteamCMD: conectado";

  return (
    <nav className="app-sidebar" aria-label="Navegación principal">
      <div className="app-sidebar-brand">
        <Icon name="server" className="app-sidebar-brand-icon" />
        <span className="app-sidebar-brand-text">
          <strong>ARK Server GBO</strong>
          <span className="muted">Panel multi-servidor local</span>
        </span>
      </div>

      <ul className="app-sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              className={item.id === props.route ? "active" : ""}
              onClick={() => props.onNavigate(item.id)}
              title={item.label}
            >
              <Icon name={item.icon} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        className="app-sidebar-steamcmd"
        onClick={() => props.onNavigate("steamcmd")}
        title={steamCmdLabel}
      >
        <span className={`status-dot ${props.steamCmdDetected ? "ok" : "bad"}`} />
        <span className="nav-label">{steamCmdLabel}</span>
      </button>

      <span className="app-sidebar-version-chip nav-label" title="Versión oficial de ARK detectada">
        Official Version: {props.officialVersion ?? "No detectada"}
      </span>

      <span className="app-sidebar-version muted nav-label">v{props.appVersion}</span>
    </nav>
  );
}
