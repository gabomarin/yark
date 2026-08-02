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
  ModMetadata,
  ModSearchPage,
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
import type { UiDensity } from "./ui-density";
import type { DesktopShellPreferences } from "./desktop-shell";

export type PickPathKind = "directory" | "file";

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
  backupsList: "backups:list",
  backupsCreate: "backups:create",
  backupsDelete: "backups:delete",
  backupsRestore: "backups:restore",
  backupsGetPolicy: "backups:get-policy",
  backupsSetPolicy: "backups:set-policy",
  backupsResolveRoot: "backups:resolve-root",
  backupsOpenFolder: "backups:open-folder",
  backupsOpenRoot: "backups:open-root",
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
  backupsChanged: "push:backups-changed",
} as const;

export interface SteamCmdProgressPush {
  status: SteamCmdStatus;
  console: SteamCmdConsoleSnapshot;
}

export type ServerStopProgressPush = ServerStopProgress;

export interface BackupsChangedPush {
  serverId: string;
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
  onBackupsChanged(
    listener: (payload: BackupsChangedPush) => void,
  ): () => void;
}
