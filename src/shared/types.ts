/** Estado de ciclo de vida de una instancia de servidor. */
export type ServerStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

/** Perfil persistido de un servidor dedicado ASA. */
export interface ServerProfile {
  id: string;
  name: string;
  map: string;
  /** Raíz de la instalación del servidor (contiene ShooterGame\...). */
  installDir: string;
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  serverPassword: string | null;
  adminPassword: string;
  clusterId: string | null;
  clusterDir: string | null;
  /** Argumentos extra de línea de comandos (con guion incluido). */
  extraArgs: string[];
  /** IDs de mods en orden de carga. */
  mods: string[];
  createdAt: string;
  updatedAt: string;
}

/** Datos de entrada para crear/editar un perfil (sin campos generados). */
export type ServerProfileInput = Omit<
  ServerProfile,
  "id" | "createdAt" | "updatedAt"
>;

export interface ServerRuntimeInfo {
  serverId: string;
  status: ServerStatus;
  pid: number | null;
  startedAt: string | null;
  lastError: string | null;
}

export interface PortConflict {
  serverA: string;
  serverB: string;
  port: number;
  kind: "game" | "query" | "rcon";
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ClusterComplianceIssue {
  serverId: string | null;
  severity: "error" | "warning";
  message: string;
}

export interface ClusterComplianceReport {
  clusterId: string;
  ok: boolean;
  members: string[];
  issues: ClusterComplianceIssue[];
  checkedAt: string;
}

export interface AppEvent {
  id: number;
  serverId: string | null;
  type:
    | "server_created"
    | "server_updated"
    | "server_deleted"
    | "server_started"
    | "server_stopped"
    | "server_crashed"
    | "rcon_command"
    | "error";
  severity: "info" | "warning" | "error";
  message: string;
  createdAt: string;
}

/** Mapas oficiales conocidos de ASA (extensible con mapas de mods). */
export const KNOWN_MAPS = [
  "TheIsland_WP",
  "ScorchedEarth_WP",
  "TheCenter_WP",
  "Aberration_WP",
  "Extinction_WP",
  "Ragnarok_WP",
  "Astraeos_WP",
] as const;

export const PORT_MIN = 1024;
export const PORT_MAX = 65535;
