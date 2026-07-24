/** Lifecycle status of a server instance. */
export type ServerStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

/** Persisted profile for an ASA dedicated server. */
export interface ServerProfile {
  id: string;
  name: string;
  map: string;
  /** Server install root (contains ShooterGame\...). */
  installDir: string;
  sessionName: string;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  serverPassword: string | null;
  adminPassword: string;
  clusterId: string | null;
  clusterDir: string | null;
  /** Extra command-line arguments (including the leading dash). */
  extraArgs: string[];
  /** Mod IDs in load order. */
  mods: string[];
  createdAt: string;
  updatedAt: string;
}

/** Input data to create/edit a profile (without generated fields). */
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
  /** Locally detected build (Build.version / exe / appmanifest). */
  build: string | null;
  /** Steam build detected specifically from appmanifest_2430930.acf. */
  steamBuild: string | null;
  /** Version detected from runtime logs (ARK Version: x.y). */
  arkVersion: string | null;
  /** Official network version (best effort; may be unavailable). */
  officialVersion: string | null;
  /** Public Steam build; sole authoritative source for whether an installable update exists. */
  officialSteamBuild: string | null;
  /** Backward compatibility with the previous UI. */
  version: string | null;
  binaryPath: string;
  checkedAt: string;
}

export interface SteamCmdStatus {
  detected: boolean;
  executablePath: string | null;
  /** steamapps/depotcache folder next to SteamCMD (download reuse). */
  depotCacheDir: string | null;
  /** Shared ASA install copied to each server. */
  contentCacheDir: string | null;
  /** Live SteamCMD process or critical job pending/in progress / local sync. */
  busy: boolean;
  running: boolean;
  operation: "install-steamcmd" | "install-files" | "update" | "sync-files" | "verify-files" | null;
  serverId: string | null;
  startedAt: string | null;
  pid: number | null;
  /** 0–100 if SteamCMD reported progress; null if no percentage yet. */
  progressPercent: number | null;
  /** Human-readable label: Downloading, Verifying, Syncing… */
  progressLabel: string | null;
  /** Downloaded/processed bytes reported by SteamCMD. */
  progressBytesDownloaded: number | null;
  /** Total bytes reported by SteamCMD. */
  progressBytesTotal: number | null;
  /** Last useful console line. */
  lastLine: string | null;
  /** Pending critical jobs (besides the one in progress). */
  queuedCount: number;
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
   * Skip the readiness wait (RCON). Only for tests or binaries
   * that do not expose RCON.
   */
  skipReadinessCheck?: boolean;
  /**
   * Opens the native Windows console of the ArkAscendedServer process
   * (live dedicated output). Electron cannot redirect that console
   * and capture pipes at the same time; the app Runtime logs
   * are limited to system messages.
   */
  openNativeConsole?: boolean;
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
  /** True if the file already existed on disk before this read. */
  gameUserSettingsExisted: boolean;
  /** True if the file already existed on disk before this read. */
  gameIniExisted: boolean;
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

/** Known official ASA maps (extensible with mod maps). */
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

/** Game ID for Ark: Survival Ascended on CurseForge (not in CurseForgeGameEnum yet). */
export const ASA_CURSEFORGE_GAME_ID = 83374;

/** CurseForge mod metadata cached/exposed to the renderer. */
export interface ModMetadata {
  id: string;
  name: string;
  summary: string;
  thumbnailUrl: string | null;
  authors: string[];
  downloadCount: number;
  dateModified: string;
  curseforgeUrl: string;
  slug: string;
}
