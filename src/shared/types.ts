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

export interface ServerInstallationInfo {
  serverId: string;
  installed: boolean;
  /** Build detectado localmente (Build.version / exe / appmanifest). */
  build: string | null;
  /** Versión detectada desde runtime logs (ARK Version: x.y). */
  arkVersion: string | null;
  /** Versión oficial de red (best effort, puede no estar disponible). */
  officialVersion: string | null;
  /** Compatibilidad retroactiva con la UI previa. */
  version: string | null;
  binaryPath: string;
  checkedAt: string;
}

export interface SteamCmdStatus {
  detected: boolean;
  executablePath: string | null;
  running: boolean;
  operation: "install-steamcmd" | "install-files" | "update" | null;
  serverId: string | null;
  startedAt: string | null;
  pid: number | null;
  checkedAt: string;
}

export interface SteamCmdConsoleSnapshot {
  lines: string[];
  updatedAt: string;
}

export interface StartServerOptions {
  skipPortValidation?: boolean;
  launchArgsOverride?: string[];
  /**
   * Omite la espera de readiness (RCON). Solo para pruebas o binarios
   * que no exponen RCON.
   */
  skipReadinessCheck?: boolean;
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
    | "backup_created"
    | "backup_restored"
    | "update_started"
    | "update_completed"
    | "update_failed"
    | "update_rolled_back"
    | "error";
  severity: "info" | "warning" | "error";
  message: string;
  createdAt: string;
}

export type BackupType =
  | "manual"
  | "scheduled"
  | "pre_restart"
  | "pre_update"
  | "pre_restore";

export type BackupStatus = "running" | "completed" | "failed";

export interface BackupRecord {
  id: string;
  serverId: string;
  type: BackupType;
  path: string;
  sizeBytes: number;
  status: BackupStatus;
  createdAt: string;
  completedAt: string | null;
  notes: string | null;
}

export interface BackupPolicy {
  serverId: string;
  enabled: boolean;
  intervalMinutes: number;
  retainCount: number;
  retainDays: number;
  updatedAt: string;
}

export type IniFileKey = "gameUserSettings" | "game";

export interface IniValidationIssue {
  fileKey: IniFileKey;
  message: string;
}

export interface IniDiffEntry {
  fileKey: IniFileKey;
  section: string;
  key: string;
  before: string | null;
  after: string | null;
  change: "added" | "removed" | "changed";
}

export interface IniPreview {
  valid: boolean;
  issues: IniValidationIssue[];
  diff: IniDiffEntry[];
  changedCount: number;
}

export interface ServerIniPayload {
  gameUserSettings: string;
  game: string;
}

export interface ServerIniSnapshot {
  serverId: string;
  gameUserSettingsPath: string;
  gameIniPath: string;
  payload: ServerIniPayload;
}

export type ServerUpdateLogStatus = "success" | "failed" | "unknown";

export interface ServerUpdateLogFile {
  fileName: string;
  fullPath: string;
  modifiedAt: string;
  sizeBytes: number;
  status: ServerUpdateLogStatus;
  exitCode: number | null;
  durationMs: number | null;
}

export interface ServerOperationalLogs {
  serverId: string;
  updateFiles: ServerUpdateLogFile[];
  backups: BackupRecord[];
  events: AppEvent[];
  runtimeLogLines: string[];
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
