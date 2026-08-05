import type {
  AppEvent,
  BackupCleanupOptions,
  BackupCleanupPreview,
  BackupCleanupResult,
  BackupDiskAlertSettings,
  BackupFleetSummary,
  BackupKind,
  BackupPolicy,
  BackupRecord,
  ClusterComplianceReport,
  IniPreview,
  InstallationServersMode,
  LogCleanupOptions,
  LogCleanupPreview,
  LogCleanupResult,
  LogRetentionSettings,
  ModMetadata,
  ModSearchPage,
  MoveInstallProgress,
  ServerIniPayload,
  ServerIniSnapshot,
  ServerInstallationSnapshot,
  ServerOperationalLogs,
  ServerRuntimeLogSnapshot,
  ServerProfile,
  ServerProfileInput,
  ServerRuntimeInfo,
  ServerStopProgress,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
  SteamCmdCacheKind,
  StartServerOptions,
} from "./types";
import type { AppUpdateStatus } from "./app-update";
import type { UiDensity } from "./ui-density";
import type { DesktopShellPreferences } from "./desktop-shell";

export type PickPathKind = "directory" | "file" | "save";

/** App-managed folders under Electron userData (Settings diagnostics). */
export type AppDataFolderKind = "app" | "backups" | "updateLogs" | "steamcmd";

export interface AppDataFolderInfo {
  kind: AppDataFolderKind;
  label: string;
  path: string;
}

/** Invokable IPC channels (renderer -> main). */
export const IPC = {
  serversList: "servers:list",
  serversCreate: "servers:create",
  serversUpdate: "servers:update",
  serversSetEnabled: "servers:set-enabled",
  serversDelete: "servers:delete",
  serversClone: "servers:clone",
  serversCloneWithParams: "servers:clone-with-params",
  serversStart: "servers:start",
  serversStop: "servers:stop",
  serversRestart: "servers:restart",
  serversKill: "servers:kill",
  serversInstallFiles: "servers:install-files",
  serversUpdateNow: "servers:update-now",
  serversVerifyFiles: "servers:verify-files",
  serversMoveInstall: "servers:move-install",
  serversMoveInstallCancel: "servers:move-install-cancel",
  serversMoveInstallCleanup: "servers:move-install-cleanup",
  serversMoveInstallDismissCleanup: "servers:move-install-dismiss-cleanup",
  serversOpenFolder: "servers:open-folder",
  serversOpenNativeTerminal: "servers:open-native-terminal",
  serversStatuses: "servers:statuses",
  serversInstallation: "servers:installation",
  steamcmdStatus: "steamcmd:status",
  steamcmdConsole: "steamcmd:console",
  steamcmdInstall: "steamcmd:install",
  steamcmdCancel: "steamcmd:cancel",
  criticalJobRetry: "critical-jobs:retry",
  criticalJobDismiss: "critical-jobs:dismiss",
  criticalJobCancel: "critical-jobs:cancel",
  steamcmdSetPath: "steamcmd:set-path",
  steamcmdOpenCache: "steamcmd:open-cache",
  steamcmdClearCache: "steamcmd:clear-cache",
  clusterCheck: "cluster:check",
  rconCommand: "rcon:command",
  rconRetryConnection: "rcon:retry-connection",
  rconGetStatus: "rcon:get-status",
  rconGetAllStatus: "rcon:get-all-status",
  rconTabFocusChanged: "rcon:tab-focus-changed",
  refreshPlayerList: "rcon:refresh-player-list",
  kickPlayer: "rcon:kick-player",
  banPlayer: "rcon:ban-player",
  listBannedPlayers: "rcon:list-banned-players",
  unbanPlayer: "rcon:unban-player",
  openBanListFile: "rcon:open-ban-list-file",
  eventsRecent: "events:recent",
  pickPath: "fs:pick-path",
  appListDataFolders: "app:list-data-folders",
  appOpenDataFolder: "app:open-data-folder",
  appGetUiDensity: "app:get-ui-density",
  appSetUiDensity: "app:set-ui-density",
  appGetDesktopShellPreferences: "app:get-desktop-shell-preferences",
  appSetCloseWindowToTray: "app:set-close-window-to-tray",
  appSetStartWithWindows: "app:set-start-with-windows",
  appSetTrayCloseHintDismissed: "app:set-tray-close-hint-dismissed",
  appGetUpdateStatus: "app:get-update-status",
  appCheckForUpdate: "app:check-for-update",
  appDownloadUpdate: "app:download-update",
  appInstallUpdate: "app:install-update",
  appOpenYarkReleaseNotes: "app:open-yark-release-notes",
  iniRead: "ini:read",
  iniPreview: "ini:preview",
  iniSave: "ini:save",
  iniOpenInEditor: "ini:open-in-editor",
  logsList: "logs:list",
  logsRuntime: "logs:runtime",
  logsReadUpdate: "logs:read-update",
  logsExport: "logs:export",
  logsOpenUpdateFile: "logs:open-update-file",
  logsClearEvents: "logs:clear-events",
  logsClearRuntime: "logs:clear-runtime",
  logsDeleteUpdate: "logs:delete-update",
  logsClearUpdates: "logs:clear-updates",
  logsGetRetentionSettings: "logs:get-retention-settings",
  logsSetRetentionSettings: "logs:set-retention-settings",
  logsPreviewCleanup: "logs:preview-cleanup",
  logsRunCleanup: "logs:run-cleanup",
  backupsList: "backups:list",
  backupsCreate: "backups:create",
  backupsDelete: "backups:delete",
  backupsRestore: "backups:restore",
  backupsGetPolicy: "backups:get-policy",
  backupsSetPolicy: "backups:set-policy",
  backupsResolveRoot: "backups:resolve-root",
  backupsOpenFolder: "backups:open-folder",
  backupsOpenRoot: "backups:open-root",
  backupsExport: "backups:export",
  backupsImport: "backups:import",
  backupsFleetSummary: "backups:fleet-summary",
  backupsGetDiskAlertSettings: "backups:get-disk-alert-settings",
  backupsSetDiskAlertSettings: "backups:set-disk-alert-settings",
  backupsPreviewCleanup: "backups:preview-cleanup",
  backupsRunCleanup: "backups:run-cleanup",
  modsGet: "mods:get",
  modsGetMany: "mods:get-many",
  modsSearch: "mods:search",
  modsGetByReference: "mods:get-by-reference",
  modsOpenCurseForge: "mods:open-curseforge",
} as const;

/** Push channel (main -> renderer). */
export const IPC_PUSH = {
  serverStatus: "push:server-status",
  steamCmdProgress: "push:steamcmd-progress",
  serverStopProgress: "push:server-stop-progress",
  moveInstallProgress: "push:move-install-progress",
  backupsChanged: "push:backups-changed",
  rconStatusChanged: "push:rcon-status-changed",
  playerListUpdated: "push:player-list-updated",
  appUpdate: "push:app-update",
} as const;

export interface SteamCmdProgressPush {
  status: SteamCmdStatus;
  console: SteamCmdConsoleSnapshot;
}

export type ServerStopProgressPush = ServerStopProgress;

export type MoveInstallProgressPush = MoveInstallProgress;

export interface BackupsChangedPush {
  serverId: string;
}

export interface RconStatusChangedPush {
  serverId: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  lastError: string | null;
}

/** Online player from ListPlayers (Steam64 or EOS / UniqueNetId). */
export interface OnlinePlayerInfo {
  key: string;
  name: string | null;
}

export interface PlayerListUpdatedPush {
  serverId: string;
  players: OnlinePlayerInfo[];
  timestamp: string;
  error: string | null;
}

/** Normalized result of IPC operations. */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** API exposed to the renderer via contextBridge. */
export interface RendererApi {
  listServers(): Promise<IpcResult<ServerProfile[]>>;
  createServer(input: ServerProfileInput): Promise<IpcResult<ServerProfile>>;
  updateServer(
    id: string,
    input: ServerProfileInput,
  ): Promise<IpcResult<ServerProfile>>;
  setServerEnabled(id: string, enabled: boolean): Promise<IpcResult<ServerProfile>>;
  deleteServer(id: string): Promise<IpcResult<void>>;
  cloneServer(id: string): Promise<IpcResult<ServerProfile>>;
  cloneServerWithParams(
    id: string,
    params: {
      name: string;
      sessionName: string;
      gamePort: number;
      queryPort: number;
      rconPort: number;
      installDir: string;
    },
  ): Promise<IpcResult<ServerProfile>>;
  startServer(id: string, options?: StartServerOptions): Promise<IpcResult<void>>;
  stopServer(id: string): Promise<IpcResult<void>>;
  restartServer(id: string, options?: StartServerOptions): Promise<IpcResult<void>>;
  killServer(id: string): Promise<IpcResult<void>>;
  installServerFiles(id: string): Promise<IpcResult<void>>;
  updateServerNow(id: string): Promise<IpcResult<void>>;
  verifyServerFiles(id: string): Promise<IpcResult<void>>;
  moveServerInstall(
    id: string,
    destinationDir: string,
  ): Promise<IpcResult<{
    sourceDir: string;
    destinationDir: string;
    oldSourceDir: string;
    oldSourceRemoved: boolean;
    cleanupError: string | null;
  }>>;
  cancelMoveServerInstall(): Promise<IpcResult<boolean>>;
  cleanupMovedServerInstall(
    id: string,
    oldSourceDir: string,
  ): Promise<IpcResult<void>>;
  dismissMoveServerInstallCleanup(id: string): Promise<IpcResult<void>>;
  openServerFolder(id: string): Promise<IpcResult<void>>;
  openServerNativeTerminal(id: string): Promise<IpcResult<void>>;
  installSteamCmd(): Promise<IpcResult<string>>;
  cancelSteamCmd(): Promise<IpcResult<boolean>>;
  retryCriticalJob(id: string): Promise<IpcResult<boolean>>;
  dismissCriticalJob(id: string): Promise<IpcResult<boolean>>;
  cancelCriticalJob(id: string): Promise<IpcResult<boolean>>;
  setSteamCmdPath(path: string): Promise<IpcResult<string>>;
  getSteamCmdStatus(): Promise<IpcResult<SteamCmdStatus>>;
  getSteamCmdConsole(limit?: number): Promise<IpcResult<SteamCmdConsoleSnapshot>>;
  openSteamCmdCache(kind: SteamCmdCacheKind): Promise<IpcResult<void>>;
  clearSteamCmdCache(kind: SteamCmdCacheKind): Promise<IpcResult<string>>;
  getStatuses(): Promise<IpcResult<ServerRuntimeInfo[]>>;
  getInstallationInfo(
    forceOfficialCheck?: boolean,
    serversMode?: InstallationServersMode,
  ): Promise<IpcResult<ServerInstallationSnapshot>>;
  checkCluster(): Promise<IpcResult<ClusterComplianceReport[]>>;
  sendRconCommand(
    id: string,
    command: string,
  ): Promise<IpcResult<string>>;
  retryRconConnection(id: string): Promise<IpcResult<void>>;
  getRconStatus(
    id: string,
  ): Promise<IpcResult<RconStatusChangedPush>>;
  getAllRconStatus(): Promise<IpcResult<RconStatusChangedPush[]>>;
  notifyRconTabFocus(
    serverId: string,
    isFocused: boolean,
  ): Promise<IpcResult<OnlinePlayerInfo[]>>;
  refreshPlayerList(serverId: string): Promise<IpcResult<OnlinePlayerInfo[]>>;
  kickPlayer(serverId: string, playerKey: string): Promise<IpcResult<string>>;
  banPlayer(serverId: string, playerKey: string): Promise<IpcResult<string>>;
  listBannedPlayers(serverId: string): Promise<IpcResult<OnlinePlayerInfo[]>>;
  unbanPlayer(serverId: string, playerKey: string): Promise<
    IpcResult<{ banned: OnlinePlayerInfo[]; warning: string | null }>
  >;
  openBanListFile(serverId: string): Promise<IpcResult<void>>;
  recentEvents(limit: number): Promise<IpcResult<AppEvent[]>>;
  pickPath(
    kind: PickPathKind,
    defaultPath?: string,
    title?: string,
  ): Promise<IpcResult<string | null>>;
  pickFolder(defaultPath?: string): Promise<string | null>;
  listAppDataFolders(): Promise<IpcResult<AppDataFolderInfo[]>>;
  openAppDataFolder(kind: AppDataFolderKind): Promise<IpcResult<void>>;
  /** `null` when unset in `app_settings` (caller may migrate / apply default). */
  getUiDensity(): Promise<IpcResult<UiDensity | null>>;
  setUiDensity(density: UiDensity): Promise<IpcResult<UiDensity>>;
  getDesktopShellPreferences(): Promise<IpcResult<DesktopShellPreferences>>;
  setCloseWindowToTray(enabled: boolean): Promise<IpcResult<boolean>>;
  setStartWithWindows(enabled: boolean): Promise<IpcResult<boolean>>;
  setTrayCloseHintDismissed(dismissed: boolean): Promise<IpcResult<boolean>>;
  getAppUpdateStatus(): Promise<IpcResult<AppUpdateStatus>>;
  checkForAppUpdate(): Promise<IpcResult<AppUpdateStatus>>;
  downloadAppUpdate(): Promise<IpcResult<AppUpdateStatus>>;
  installAppUpdate(): Promise<IpcResult<void>>;
  openYarkReleaseNotes(): Promise<IpcResult<void>>;
  readServerIni(serverId: string): Promise<IpcResult<ServerIniSnapshot>>;
  openServerIniInEditor(
    serverId: string,
    fileKey: "gameUserSettings" | "game",
  ): Promise<IpcResult<void>>;
  previewServerIni(
    serverId: string,
    payload: ServerIniPayload,
  ): Promise<IpcResult<IniPreview>>;
  saveServerIni(
    serverId: string,
    payload: ServerIniPayload,
  ): Promise<IpcResult<IniPreview>>;
  listServerLogs(serverId: string): Promise<IpcResult<ServerOperationalLogs>>;
  getServerRuntimeLog(
    serverId: string,
    limit?: number,
  ): Promise<IpcResult<ServerRuntimeLogSnapshot>>;
  readServerUpdateLog(
    serverId: string,
    fileName: string,
    maxBytes?: number,
  ): Promise<IpcResult<string>>;
  exportServerLogs(serverId: string): Promise<IpcResult<string | null>>;
  openServerUpdateLogFile(
    serverId: string,
    fileName: string,
  ): Promise<IpcResult<void>>;
  clearServerEvents(serverId: string): Promise<IpcResult<number>>;
  clearServerRuntimeLog(serverId: string): Promise<IpcResult<void>>;
  deleteServerUpdateLog(
    serverId: string,
    fileName: string,
  ): Promise<IpcResult<void>>;
  clearServerUpdateLogs(serverId: string): Promise<IpcResult<number>>;
  getLogRetentionSettings(): Promise<IpcResult<LogRetentionSettings>>;
  setLogRetentionSettings(
    settings: LogRetentionSettings,
  ): Promise<IpcResult<LogRetentionSettings>>;
  previewLogCleanup(
    options?: LogCleanupOptions,
  ): Promise<IpcResult<LogCleanupPreview>>;
  runLogCleanup(
    options?: LogCleanupOptions,
  ): Promise<IpcResult<LogCleanupResult>>;
  listBackups(serverId: string, limit?: number): Promise<IpcResult<BackupRecord[]>>;
  createManualBackup(
    serverId: string,
    kinds?: BackupKind[],
  ): Promise<IpcResult<BackupRecord[]>>;
  deleteBackups(
    serverId: string,
    backupIds: string[],
  ): Promise<IpcResult<number>>;
  restoreBackup(serverId: string, backupId: string): Promise<IpcResult<void>>;
  getBackupPolicy(serverId: string): Promise<IpcResult<BackupPolicy>>;
  setBackupPolicy(
    serverId: string,
    policy: Omit<BackupPolicy, "serverId" | "updatedAt">,
  ): Promise<IpcResult<BackupPolicy>>;
  resolveBackupRoot(serverId: string): Promise<IpcResult<string>>;
  openBackupFolder(serverId: string, backupId: string): Promise<IpcResult<void>>;
  openBackupRoot(serverId: string): Promise<IpcResult<void>>;
  /** Copy a completed managed archive to a user-chosen path (ZIP). */
  exportBackup(
    serverId: string,
    backupId: string,
    destinationPath: string,
  ): Promise<IpcResult<string>>;
  /** Validate and catalog a YARK ZIP under the server backup root (no restore). */
  importBackup(
    serverId: string,
    kind: BackupKind,
    sourcePath: string,
  ): Promise<IpcResult<BackupRecord>>;
  getBackupFleetSummary(): Promise<IpcResult<BackupFleetSummary>>;
  getBackupDiskAlertSettings(): Promise<IpcResult<BackupDiskAlertSettings>>;
  setBackupDiskAlertSettings(
    settings: BackupDiskAlertSettings,
  ): Promise<IpcResult<BackupDiskAlertSettings>>;
  previewBackupCleanup(
    options: BackupCleanupOptions,
  ): Promise<IpcResult<BackupCleanupPreview>>;
  runBackupCleanup(
    options: BackupCleanupOptions,
  ): Promise<IpcResult<BackupCleanupResult>>;
  getModMetadata(modId: string, forceRefresh?: boolean): Promise<IpcResult<ModMetadata>>;
  getModsMetadata(
    modIds: string[],
    forceRefresh?: boolean,
  ): Promise<IpcResult<ModMetadata[]>>;
  searchMods(
    query: string,
    options?: { index?: number; pageSize?: number },
  ): Promise<IpcResult<ModSearchPage>>;
  getModByReference(ref: string): Promise<IpcResult<ModMetadata>>;
  openCurseForgeMod(url: string): Promise<IpcResult<void>>;
  onServerStatus(
    listener: (info: ServerRuntimeInfo) => void,
  ): () => void;
  onSteamCmdProgress(
    listener: (payload: SteamCmdProgressPush) => void,
  ): () => void;
  onServerStopProgress(
    listener: (payload: ServerStopProgressPush) => void,
  ): () => void;
  onMoveInstallProgress(
    listener: (payload: MoveInstallProgressPush) => void,
  ): () => void;
  onBackupsChanged(
    listener: (payload: BackupsChangedPush) => void,
  ): () => void;
  onRconStatusChanged(
    listener: (payload: RconStatusChangedPush) => void,
  ): () => void;
  onPlayerListUpdated(
    listener: (payload: PlayerListUpdatedPush) => void,
  ): () => void;
  onAppUpdate(listener: (status: AppUpdateStatus) => void): () => void;
}
