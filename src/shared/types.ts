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
  enabled: boolean;
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
  /** Configured mod IDs that are omitted from `-mods=` until re-enabled. */
  disabledMods?: string[];
  /** CurseForge metadata retained across UI sessions (Worker-backed). */
  modMetadataCache?: Record<string, ModMetadata>;
  createdAt: string;
  updatedAt: string;
}

/** Input data to create/edit a profile (without generated fields). */
export type ServerProfileInput = Omit<
  ServerProfile,
  "id" | "enabled" | "createdAt" | "updatedAt"
>;

export interface ServerRuntimeInfo {
  serverId: string;
  status: ServerStatus;
  pid: number | null;
  startedAt: string | null;
  lastError: string | null;
}

/**
 * Lightweight FS classification of a profile's ASA install root (#57).
 * Distinct from runtime/process health.
 */
export type InstallationHealthStatus =
  | "ready"
  | "missing"
  | "empty"
  | "incomplete"
  | "inaccessible"
  | "suspicious"
  | "unknown";

export interface ServerInstallationInfo {
  serverId: string;
  /**
   * True when `health === "ready"` (required exe + layout present).
   * Kept for older UI call sites; prefer `health` / `isInstallationReady`.
   */
  installed: boolean;
  /** Classified install-folder health from the shared probe. */
  health: InstallationHealthStatus;
  /** Stable classifier reason codes (e.g. path_missing, exe_absent). */
  reasonCodes: string[];
  /** English operator guidance for the current health. */
  guidance: string;
  /** Locally detected build (Build.version / exe / appmanifest). */
  build: string | null;
  /** Steam build detected specifically from appmanifest_2430930.acf. */
  steamBuild: string | null;
  /** Version detected from runtime logs (ARK Version: x.y). */
  arkVersion: string | null;
  /** Backward compatibility with the previous UI. */
  version: string | null;
  binaryPath: string;
  checkedAt: string;
}

/** Installation probe plus global official metadata (CDN), even when no servers exist. */
export interface ServerInstallationSnapshot {
  officialVersion: string | null;
  /** Network phrase from Wildcard status (Online / Deploying / Offline). */
  officialNetworkStatus: OfficialNetworkStatus;
  officialSteamBuild: string | null;
  servers: ServerInstallationInfo[];
}

/** Parsed from `officialserverstatus.ini` ArkML status line. */
export type OfficialNetworkStatus = "online" | "deploying" | "offline" | "unknown";

/**
 * Whether `getInstallationInfo` re-reads each server's install dir.
 * - `true`: always inspect locals
 * - `false`: return last cached local snapshot (official metadata still refreshed)
 * - `"when-official-changed"`: inspect locals only if official version/build changed
 *   (or the server set changed since the last snapshot)
 */
export type InstallationServersMode = boolean | "when-official-changed";

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
  /** Durable update, backup, and restore jobs, including actionable recovery states. */
  criticalJobs: CriticalJobSummary[];
  checkedAt: string;
}

export type CriticalJobOperation =
  | "install-files"
  | "update"
  | "verify-files"
  | "pre-update-backup"
  | "restore";

export type CriticalJobStatus =
  | "pending"
  | "running"
  | "retrying"
  | "blocked"
  | "failed"
  | "cancelled";

export type CriticalJobNextAction = "retry" | "dismiss" | "cancel";

export interface CriticalJobSummary {
  id: string;
  operation: CriticalJobOperation;
  serverId: string;
  serverName?: string | null;
  status: CriticalJobStatus;
  phase: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  recoveryReason: string | null;
  nextActions: CriticalJobNextAction[];
}

/** Shared SteamCMD cache folders next to steamcmd.exe. */
export type SteamCmdCacheKind = "depot" | "content";

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

export interface AppEventDetails {
  /** Short explanation of what happened. */
  what?: string;
  /** Likely cause or trigger. */
  cause?: string;
  /** Path, volume, job id, exit code context, etc. */
  location?: string;
  /** Practical next step for the operator. */
  suggestion?: string;
  /** Extra structured fields shown in the expanded view. */
  context?: Record<string, string | number | boolean | null>;
}

export interface AppEvent {
  id: number;
  serverId: string | null;
  type:
    | "server_created"
    | "server_updated"
    | "server_deleted"
    | "server_enabled"
    | "server_disabled"
    | "server_started"
    | "server_stopped"
    | "server_crashed"
    | "rcon_command"
    | "backup_created"
    | "backup_deleted"
    | "backup_restored"
    | "update_started"
    | "update_completed"
    | "update_failed"
    | "update_rolled_back"
    | "installation_health_degraded"
    | "error";
  severity: "info" | "warning" | "error";
  message: string;
  createdAt: string;
  /** Optional structured detail payload (null on older rows). */
  details: AppEventDetails | null;
}

export type BackupType =
  | "manual"
  | "scheduled"
  | "pre_stop"
  | "pre_restart"
  | "pre_update"
  | "pre_restore"
  | "player_connect"
  | "player_disconnect"
  | "ini_save";

/** Phases pushed while a stop runs (optional wait → SaveWorld → DoExit → backup). */
export type ServerStopProgressPhase =
  | "waiting"
  | "saving"
  | "backing_up"
  | "stopping";

/** Why a stop job is running — quit overlay only for `"quit"`. */
export type ServerStopProgressReason = "user" | "quit";

export interface ServerStopProgress {
  serverId: string;
  active: boolean;
  phase: ServerStopProgressPhase | null;
  label: string;
  percent: number | null;
  /** Defaults to user-initiated stop when omitted by older payloads. */
  reason: ServerStopProgressReason;
}

/** Normalize push payloads so older emitters without `reason` stay UI-safe. */
export function normalizeServerStopProgress(
  payload: Partial<ServerStopProgress> &
    Pick<ServerStopProgress, "serverId" | "active">,
): ServerStopProgress {
  const reason: ServerStopProgressReason =
    payload.reason === "quit" || payload.reason === "user"
      ? payload.reason
      : "user";
  return {
    serverId: payload.serverId,
    active: payload.active === true,
    phase:
      payload.phase === "waiting" ||
      payload.phase === "saving" ||
      payload.phase === "backing_up" ||
      payload.phase === "stopping"
        ? payload.phase
        : null,
    label: typeof payload.label === "string" ? payload.label : "",
    percent:
      typeof payload.percent === "number" && Number.isFinite(payload.percent)
        ? payload.percent
        : null,
    reason,
  };
}

/** What a backup archive contains (ASA path-scoped). */
export type BackupKind = "world" | "players" | "ini";

export type BackupStatus = "running" | "completed" | "failed";

export interface BackupRecord {
  id: string;
  serverId: string;
  type: BackupType;
  kind: BackupKind;
  path: string;
  sizeBytes: number;
  status: BackupStatus;
  createdAt: string;
  completedAt: string | null;
  notes: string | null;
}

export interface BackupPolicy {
  serverId: string;
  /** When true, creates world backups on `intervalMinutes` while the server is running. */
  enabled: boolean;
  /** Minutes between scheduled world backups. Minimum 5; default 60. */
  intervalMinutes: number;
  /** Keep the last N completed world backups. Default 20. */
  retainCountWorld: number;
  /**
   * Keep the last N completed player-profile backups per player
   * (full players snapshots share one pool). Default 20.
   */
  retainCountPlayers: number;
  /** Keep the last N completed INI backups. Default 10. */
  retainCountIni: number;
  /**
   * Shared root where new backup archives are written.
   * Under this root the app uses `World`, `Player profiles`, and `INI` subfolders
   * and stores each snapshot as a `.zip` file.
   * `null` = default under the server install dir (`{installDir}\\Backups`).
   */
  backupDir: string | null;
  updatedAt: string;
}

export type BackupHealthStatus = "ok" | "warning" | "critical" | "unknown";

export type BackupFleetAlertKind =
  | "stale"
  | "failed"
  | "missing_destination"
  | "disk_warning"
  | "disk_critical"
  | "never_backed_up";

export interface BackupDiskAlertSettings {
  /** Warn when volume used percent is at or above this value. Default 85. */
  warnUsedPercent: number;
  /** Critical when volume used percent is at or above this value. Default 95. */
  criticalUsedPercent: number;
  /** Also warn when free space is below this many bytes. Default 20 GiB. */
  warnFreeBytes: number;
}

export interface BackupDiskUsage {
  volumePath: string;
  /** Backup roots that land on this volume. */
  roots: string[];
  /** Sum of completed backup `sizeBytes` for servers on this volume. */
  backupBytes: number;
  freeBytes: number | null;
  totalBytes: number | null;
  /** Volume used percent (0–100), or null if unknown. */
  usedPercent: number | null;
}

export interface BackupServerHealth {
  serverId: string;
  serverName: string;
  policy: BackupPolicy;
  resolvedRoot: string;
  health: BackupHealthStatus;
  latest: BackupRecord | null;
  latestWorld: BackupRecord | null;
  counts: {
    world: number;
    players: number;
    ini: number;
    failed24h: number;
  };
  usedBytes: number;
  stale: boolean;
  destinationOk: boolean;
}

export interface BackupFleetAlert {
  id: string;
  kind: BackupFleetAlertKind;
  severity: "warning" | "error";
  serverId: string | null;
  volumePath: string | null;
  message: string;
}

export interface BackupFleetSummary {
  servers: BackupServerHealth[];
  stats: {
    protectedCount: number;
    atRiskCount: number;
    failed24h: number;
    totalBackupBytes: number;
  };
  disks: BackupDiskUsage[];
  alerts: BackupFleetAlert[];
  diskSettings: BackupDiskAlertSettings;
}

export interface BackupCleanupOptions {
  /** `null` or empty = all servers. */
  serverIds: string[] | null;
  includeFailed: boolean;
  /** Delete completed backups that exceed each server's retain policy. */
  enforceRetention: boolean;
  /** Delete completed backups older than this many days (`null` = off). */
  olderThanDays: number | null;
  /** Keep only the newest N completed per kind (`null` = off). */
  keepLastPerKind: number | null;
  /** Never delete the newest successful world backup per server. Default true. */
  protectNewestWorld: boolean;
  /**
   * Ids from a prior `previewCleanup` snapshot. When set, `runCleanup` deletes
   * only ids that still match the current cleanup rules (including
   * `protectNewestWorld`), so confirm cannot remove a newly protected world.
   */
  confirmedBackupIds?: string[] | null;
}

export interface BackupCleanupItem {
  backup: BackupRecord;
  serverName: string;
  reason: string;
}

export interface BackupCleanupPreview {
  items: BackupCleanupItem[];
  totalBytes: number;
  byServer: Array<{
    serverId: string;
    serverName: string;
    count: number;
    bytes: number;
  }>;
}

export interface BackupCleanupResult {
  deleted: number;
  freedBytes: number;
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

/** Lightweight Runtime-only snapshot (avoids reading update/backup listings). */
export interface ServerRuntimeLogSnapshot {
  serverId: string;
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
  "Genesis_WP",
  "LostColony_WP",
] as const;

export const PORT_MIN = 1024;
export const PORT_MAX = 65535;

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
  categories?: string[];
}

/** Search page from the CurseForge proxy Worker. */
export interface ModSearchPage {
  items: ModMetadata[];
  pagination: {
    index: number;
    pageSize: number;
    resultCount: number;
    totalCount: number;
  };
}
