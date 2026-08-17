import type { ConfigTransferSelection } from "./config-transfer";
import type { StructuredLaunchArgs } from "./structured-launch-options";

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
  /**
   * CurseForge Project ID for the custom map pack when `map` is not a
   * `KNOWN_MAPS` token (#190). Cleared for official maps. Null/undefined when unset.
   */
  mapModId?: string | null;
  /**
   * Relative SavedArks folder name for world backups when auto-resolve is wrong
   * (custom/mod maps). Empty/null = try `{MapToken}` then strip `_WP` (#262).
   * Cleared for official maps.
   */
  mapSaveFolder?: string | null;
  /** Server install root (contains ShooterGame\...). */
  installDir: string;
  enabled: boolean;
  /**
   * When true, YARK starts this server after app launch and reattach (#53).
   * Ignored while `enabled` is false. Default false (opt-in).
   */
  autoStart: boolean;
  sessionName: string;
  /** Max concurrent players (`[/Script/Engine.GameSession] MaxPlayers`). Default 70. */
  maxPlayers: number;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  serverPassword: string | null;
  adminPassword: string;
  clusterId: string | null;
  clusterDir: string | null;
  /** Extra command-line arguments (including the leading dash). */
  extraArgs: string[];
  /**
   * Structured Launch-tab selections keyed by ASA catalog entry id (#93).
   * Composed before `extraArgs`. Empty on migrate so existing commands stay equivalent.
   */
  structuredLaunchArgs?: StructuredLaunchArgs;
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

/**
 * Narrow profile write for Launch / Mods panels (#209).
 * Main process re-reads the row and merges so concurrent group writes do not clobber.
 */
export type ServerProfileLaunchPatch = {
  group: "launch";
  extraArgs: string[];
  structuredLaunchArgs: StructuredLaunchArgs;
};

export type ServerProfileModsPatch = {
  group: "mods";
  mods: string[];
  disabledMods: string[];
  modMetadataCache?: Record<string, ModMetadata>;
};

export type ServerProfilePatch = ServerProfileLaunchPatch | ServerProfileModsPatch;

export interface ServerRuntimeInfo {
  serverId: string;
  status: ServerStatus;
  /** True while the tracked child process has not exited (incl. error + live PID). */
  processLive: boolean;
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
  /** Locally detected ARK-style build (version.txt / Build.version / exe). */
  build: string | null;
  /** Steam build detected from appmanifest_2430930.acf (`build NNNNN`). */
  steamBuild: string | null;
  /** Version detected from runtime logs (ARK Version: x.y). */
  arkVersion: string | null;
  /** Backward compatibility with the previous UI. */
  version: string | null;
  binaryPath: string;
  checkedAt: string;
}

/** Prefill values from probing an existing ASA install root (#254). */
export interface ImportInstallSuggestions {
  name: string;
  sessionName: string;
  map: string;
  mapModId: string | null;
  maxPlayers: number;
  gamePort: number;
  queryPort: number;
  rconPort: number;
  adminPassword: string;
  serverPassword: string | null;
  /** Discovered CurseForge Project IDs (persist disabled on import). */
  mods: string[];
}

/**
 * Options for `servers:import-existing` (#283).
 * Incomplete trees require an explicit opt-in; empty / other non-ready stay blocked.
 */
export interface ImportExistingOptions {
  /**
   * When true, allow creating a profile from an `incomplete` ASA tree.
   * Operator must finish files with Install/Verify before Start.
   */
  allowIncompleteInstall?: boolean;
}

/** Result of `servers:probe-import` before creating a profile (#254). */
export interface ImportInstallProbe {
  installDir: string;
  installation: ServerInstallationInfo;
  suggestions: ImportInstallSuggestions;
  /**
   * True only when install health is `ready` and the folder is not already managed (#254).
   * Incomplete folders stay false; the UI may unlock Continue with
   * {@link ImportExistingOptions.allowIncompleteInstall} (#283).
   */
  canContinue: boolean;
  /**
   * True when the chosen path sits under a `ShooterGame` segment
   * (e.g. `...\ShooterGame\Binaries\Win64`) instead of the dedicated root.
   */
  nestedSubfolder: boolean;
  /** Suggested dedicated root (parent of `ShooterGame`) when nested, else null. */
  suggestedInstallDir: string | null;
  /** Existing profile name when `installDir` is already used by YARK; else null. */
  alreadyManagedBy: string | null;
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

export interface SessionPortSet {
  gamePort: number;
  queryPort: number;
  rconPort: number;
}

/** Options for removing a server profile (`servers:delete`). */
export interface DeleteServerOptions {
  /**
   * When true, recursively wipe the ASA `installDir` after safety checks
   * (full wipe). When false, remove only the YARK profile and leave files.
   */
  deleteInstallFiles: boolean;
  /**
   * When true with `deleteInstallFiles`, re-inspect the folder (bypass cache)
   * and refuse the wipe unless health is still `empty`. Use for UI shortcuts
   * that assumed emptiness from a stale renderer snapshot (#267).
   */
  requireEmptyInstall?: boolean;
}

/** Backend error when an empty-only wipe finds the folder is no longer empty. */
export const EMPTY_WIPE_STALE_MESSAGE =
  "Install folder is no longer empty. Choose Remove from YARK only or Delete everything explicitly.";


export interface StartServerOptions {
  /**
   * When true, skip only **inconclusive** host port probe failures.
   * Busy ports still always block start.
   */
  skipPortValidation?: boolean;
  /**
   * Game / query / RCON for this start only (INI sync + launch args).
   * Does not update the saved SQLite profile.
   */
  sessionPorts?: SessionPortSet;
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
  /** Bounded ShooterGame.log / Fatal excerpt (crash events). */
  excerpt?: string;
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
    | "auto_start_skipped"
    | "auto_start_succeeded"
    | "auto_start_failed"
    | "rcon_command"
    | "backup_created"
    | "backup_deleted"
    | "backup_restored"
    | "update_started"
    | "update_completed"
    | "update_failed"
    | "update_rolled_back"
    | "installation_health_degraded"
    | "install_move_started"
    | "install_move_completed"
    | "install_move_failed"
    | "install_move_cancelled"
    | "install_move_cleanup_completed"
    | "install_move_cleanup_failed"
    | "logs_retention_completed"
    | "logs_retention_failed"
    | "error";
  severity: "info" | "warning" | "error";
  message: string;
  createdAt: string;
  /** Optional structured detail payload (null on older rows). */
  details: AppEventDetails | null;
}

/** YARK-owned log categories eligible for retention cleanup (#84). */
export type LogRetentionCategory = "events" | "updateLogs";

/** Persisted app-wide retention policy (`app_settings` key `logRetention.v1`). */
export interface LogRetentionSettings {
  /** Delete routine (non-failure) events older than this many days. Default 90. */
  eventsRetainDays: number;
  /** Keep failure-evidence events at least this many days. Default 180. */
  eventsFailureRetainDays: number;
  /** Keep at most this many successful update logs per server. Default 20. */
  updateLogsRetainCount: number;
  /** Keep failed/unknown update logs at least this many days. Default 180. */
  updateLogsFailureRetainDays: number;
  /** When true, a background scheduler enforces the policy. Default true. */
  autoCleanupEnabled: boolean;
}

export interface LogCleanupOptions {
  /** `null` or empty = all servers (plus global/null event rows). */
  serverIds?: string[] | null;
  /** Categories to include; empty/undefined = both. */
  categories?: LogRetentionCategory[] | null;
  /**
   * From a prior preview. When set, `runCleanup` deletes only targets that
   * still match the fresh plan (same idea as backup `confirmedBackupIds`).
   */
  confirmedTargets?: LogCleanupTargetRef[] | null;
}

export interface LogCleanupTargetRef {
  category: LogRetentionCategory;
  /** Empty string for global/null `server_id` events. */
  serverId: string;
  /** Events: String(event.id). Update logs: fileName under update-logs/. */
  targetKey: string;
}

export interface LogCleanupItem {
  category: LogRetentionCategory;
  serverId: string;
  serverName: string;
  targetKey: string;
  label: string;
  reason: string;
  sizeBytes: number;
  isFailureEvidence?: boolean;
}

export interface LogCleanupPreview {
  items: LogCleanupItem[];
  totalBytes: number;
  byCategory: Array<{ category: LogRetentionCategory; count: number; bytes: number }>;
  byServer: Array<{
    serverId: string;
    serverName: string;
    count: number;
    bytes: number;
  }>;
}

export interface LogCleanupResult {
  deleted: number;
  freedBytes: number;
  byCategory: Array<{ category: LogRetentionCategory; deleted: number; bytes: number }>;
  skipped: Array<{ category: LogRetentionCategory; targetKey: string; reason: string }>;
  failed: Array<{ category: LogRetentionCategory; targetKey: string; error: string }>;
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

/** Phases for Move installation (copy → verify → commit). */
export type MoveInstallProgressPhase =
  | "validating"
  | "copying"
  | "verifying"
  | "committing"
  | "cleanup";

export interface MoveInstallProgress {
  serverId: string;
  active: boolean;
  phase: MoveInstallProgressPhase | null;
  label: string;
  percent: number | null;
  sourceDir: string | null;
  stagingDir: string | null;
  destinationDir: string | null;
  oldSourceDir: string | null;
  error: string | null;
  /** Set when copy+verify+commit succeeded and old files await optional cleanup. */
  awaitingCleanup: boolean;
}

/** Phases for optional clone install-folder copy (#160). */
export type CloneInstallProgressPhase =
  | "validating"
  | "copying"
  | "applying"
  | "cleanup";

export interface CloneInstallProgress {
  /** Source server id (dialog is bound to the clone source). */
  serverId: string;
  active: boolean;
  phase: CloneInstallProgressPhase | null;
  label: string;
  percent: number | null;
  sourceDir: string | null;
  destinationDir: string | null;
  error: string | null;
}

/** Normalize clone-copy push payloads so partial emitters stay UI-safe. */
export function normalizeCloneInstallProgress(
  payload: Partial<CloneInstallProgress> &
    Pick<CloneInstallProgress, "serverId" | "active">,
): CloneInstallProgress {
  const phase =
    payload.phase === "validating"
    || payload.phase === "copying"
    || payload.phase === "applying"
    || payload.phase === "cleanup"
      ? payload.phase
      : null;
  return {
    serverId: payload.serverId,
    active: payload.active === true,
    phase,
    label: typeof payload.label === "string" ? payload.label : "",
    percent:
      typeof payload.percent === "number" && Number.isFinite(payload.percent)
        ? payload.percent
        : null,
    sourceDir: typeof payload.sourceDir === "string" ? payload.sourceDir : null,
    destinationDir:
      typeof payload.destinationDir === "string" ? payload.destinationDir : null,
    error: typeof payload.error === "string" ? payload.error : null,
  };
}

/** Normalize push payloads so partial emitters stay UI-safe. */
export function normalizeMoveInstallProgress(
  payload: Partial<MoveInstallProgress> &
    Pick<MoveInstallProgress, "serverId" | "active">,
): MoveInstallProgress {
  const phase =
    payload.phase === "validating"
    || payload.phase === "copying"
    || payload.phase === "verifying"
    || payload.phase === "committing"
    || payload.phase === "cleanup"
      ? payload.phase
      : null;
  return {
    serverId: payload.serverId,
    active: payload.active === true,
    phase,
    label: typeof payload.label === "string" ? payload.label : "",
    percent:
      typeof payload.percent === "number" && Number.isFinite(payload.percent)
        ? payload.percent
        : null,
    sourceDir: typeof payload.sourceDir === "string" ? payload.sourceDir : null,
    stagingDir:
      typeof payload.stagingDir === "string" ? payload.stagingDir : null,
    destinationDir:
      typeof payload.destinationDir === "string" ? payload.destinationDir : null,
    oldSourceDir:
      typeof payload.oldSourceDir === "string" ? payload.oldSourceDir : null,
    error: typeof payload.error === "string" ? payload.error : null,
    awaitingCleanup: payload.awaitingCleanup === true,
  };
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
  /**
   * Active map token for world backups (e.g. `TheIsland_WP`).
   * `null` for players/ini and pre-per-map world rows.
   */
  mapToken: string | null;
}

/** Options for restoring a completed backup archive. */
export interface RestoreBackupOptions {
  /**
   * World restore only: when true (default), overlay `.arkprofile` / `.arktribe`
   * companions from the archive. When false, apply map `.ark` (+ anti-corruption bak) only.
   */
  restoreProfilesTribes?: boolean;
}

export interface BackupPolicy {
  serverId: string;
  /** When true, creates world backups on `intervalMinutes` while the server is running. */
  enabled: boolean;
  /** Minutes between scheduled world backups. Minimum 5; default 60. */
  intervalMinutes: number;
  /** Keep the last N completed world backups per map token. Default 20. */
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

/** Policy plus session-only schedule pause flag for the UI (#262). */
export interface BackupPolicyStatus extends BackupPolicy {
  /**
   * True when scheduled world creates are paused for this YARK session after
   * repeated failures. Does not change `enabled`. Cleared on app restart.
   */
  schedulePaused: boolean;
}

export type BackupHealthStatus = "ok" | "warning" | "critical" | "unknown";

export type BackupFleetAlertKind =
  | "stale"
  | "failed"
  | "missing_destination"
  | "disk_warning"
  | "disk_critical"
  | "never_backed_up"
  | "schedule_paused";

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
  /** True when scheduled world creates are paused for this YARK session (#262). */
  schedulePaused: boolean;
}

export interface BackupFleetAlert {
  id: string;
  kind: BackupFleetAlertKind;
  severity: "warning" | "error";
  serverId: string | null;
  volumePath: string | null;
  message: string;
  /**
   * Opaque dismiss token. Hiding an alert suppresses it until this value changes
   * (e.g. a newer failed backup id, or updated disk usage).
   */
  fingerprint: string;
  /** Newest relevant failed backup for `kind: "failed"` deep-links into Logs → Backups. */
  backupId?: string | null;
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

/**
 * Optional cluster-scoped INI template (#88).
 * Keyed by cluster ID string; independent of member install directories.
 */
export interface ClusterIniTemplate {
  clusterId: string;
  payload: ServerIniPayload;
  updatedAt: string;
}

/** Per-member template preview / commit ops (#89). Bulk apply is #90. */
export type ClusterIniTemplateApplyOperation = "restore" | "promote" | "seed";

/**
 * Which template files to include on Promote / Restore / Seed (#181).
 * Entire file only; owned GUS keys stay profile-authoritative on member writes.
 */
export interface ClusterIniTemplateFileSelection {
  gameUserSettings: boolean;
  game: boolean;
}

export interface ClusterIniTemplateMemberPreview {
  operation: ClusterIniTemplateApplyOperation;
  clusterId: string;
  serverId: string;
  serverName: string;
  preview: IniPreview;
  files: ClusterIniTemplateFileSelection;
}

export interface ClusterIniTemplateApplyResult {
  operation: ClusterIniTemplateApplyOperation;
  clusterId: string;
  serverId: string;
  preview: IniPreview;
  files: ClusterIniTemplateFileSelection;
  template: ClusterIniTemplate;
  /** Cataloged INI backup id when the install was Ready enough to archive. */
  backupId: string | null;
  /** Local dual-file snapshot directory under Config/WindowsServer/.yark-pre-template. */
  snapshotDir: string | null;
}

/** #95 — one-shot selective configuration copy (not sync). */
export interface ConfigTransferIniKeyInfo {
  section: string;
  key: string;
}

/** ASA UI category group (same taxonomy as the server INI editor). */
export interface ConfigTransferIniCategoryInfo {
  id: string;
  label: string;
  keys: ConfigTransferIniKeyInfo[];
}

export interface ConfigTransferDescribeResult {
  sourceId: string;
  sourceName: string;
  sourceStatus: ServerStatus;
  gameUserSettings: ConfigTransferIniCategoryInfo[];
  game: ConfigTransferIniCategoryInfo[];
  mods: string[];
  disabledMods: string[];
  extraArgs: string[];
  /** Structured Launch-tab tokens from the source (composed preview). */
  structuredLaunchArgs: string[];
  hasPasswords: boolean;
}

export interface ConfigTransferProfileDiff {
  mods: {
    before: string[];
    after: string[];
    disabledBefore: string[];
    disabledAfter: string[];
  } | null;
  extraArgs: { before: string[]; after: string[] } | null;
  structuredLaunchArgs: { before: string[]; after: string[] } | null;
  backupPolicy: {
    before: Omit<BackupPolicy, "serverId" | "updatedAt">;
    after: Omit<BackupPolicy, "serverId" | "updatedAt">;
  } | null;
  passwords: { changed: true; redacted: true } | null;
}

export interface ConfigTransferPreview {
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  sourceStatus: ServerStatus;
  targetStatus: ServerStatus;
  /** Opaque revision token; commit must echo the same value. */
  fingerprint: string;
  /** Echo of the validated selection used to build this preview. */
  selection: ConfigTransferSelection;
  iniPreview: IniPreview;
  profileDiff: ConfigTransferProfileDiff;
  warnings: string[];
}

export interface ConfigTransferCommitResult {
  sourceId: string;
  targetId: string;
  sourceName: string;
  targetName: string;
  fingerprint: string;
  iniPreview: IniPreview;
  profileDiff: ConfigTransferProfileDiff;
  backupId: string | null;
  snapshotDir: string | null;
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

/** Known official ASA map launch tokens. */
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
  "Valguero_WP",
] as const;

/**
 * Official ASA maps for UI: launch `id` + hardcoded operator-facing `label`.
 * Keep in sync with `KNOWN_MAPS`.
 */
export const KNOWN_MAP_OPTIONS: ReadonlyArray<{
  readonly id: (typeof KNOWN_MAPS)[number];
  readonly label: string;
}> = [
  { id: "TheIsland_WP", label: "The Island" },
  { id: "ScorchedEarth_WP", label: "Scorched Earth" },
  { id: "TheCenter_WP", label: "The Center" },
  { id: "Aberration_WP", label: "Aberration" },
  { id: "Extinction_WP", label: "Extinction" },
  { id: "Ragnarok_WP", label: "Ragnarok" },
  { id: "Astraeos_WP", label: "Astraeos" },
  { id: "Genesis_WP", label: "Genesis" },
  { id: "LostColony_WP", label: "Lost Colony" },
  { id: "Valguero_WP", label: "Valguero" },
];

export const PORT_MIN = 1024;
export const PORT_MAX = 65535;

/** CurseForge mod metadata cached/exposed to the renderer. */
export interface ModMetadata {
  id: string;
  name: string;
  summary: string;
  /**
   * Plain-text (truncated) CurseForge description when the Worker fetched it.
   * Used for map-token heuristics (`Map Name:`); absent on search rows (#195).
   */
  description?: string | null;
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
