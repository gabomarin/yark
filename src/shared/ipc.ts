import type { OnboardingRecord } from "./onboarding";
import type {
  AppEvent,
  BackupCleanupOptions,
  BackupCleanupPreview,
  BackupCleanupResult,
  BackupDiskAlertSettings,
  BackupFleetSummary,
  BackupKind,
  BackupPolicy,
  BackupPolicyStatus,
  MaintenancePolicy,
  MaintenancePolicyStatus,
  BackupRecord,
  RestoreBackupOptions,
  ClusterComplianceReport,
  ClusterIniTemplate,
  ClusterIniTemplateApplyResult,
  ClusterIniTemplateFileSelection,
  ClusterIniTemplateMemberPreview,
  ConfigTransferCommitResult,
  ConfigTransferDescribeResult,
  ConfigTransferPreview,
  IniPreview,
  InstallationServersMode,
  LogCleanupOptions,
  LogCleanupPreview,
  LogCleanupResult,
  LogRetentionSettings,
  ModCategory,
  ModMetadata,
  ModSearchOptions,
  ModSearchPage,
  CloneInstallProgress,
  MoveInstallProgress,
  ServerIniPayload,
  ServerIniSnapshot,
  ServerInstallationSnapshot,
  ServerProfilePatch,
  ServerOperationalLogs,
  ServerRuntimeLogSnapshot,
  ServerProfile,
  ServerProfileInput,
  ServerRuntimeInfo,
  ImportInstallProbe,
  ImportExistingOptions,
  ServerStopProgress,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
  SteamCmdCacheKind,
  StartServerOptions,
  DeleteServerOptions,
} from "./types";
import type { AppUpdateStatus } from "./app-update";
import type { UiDensity } from "./ui-density";
import type { DesktopShellPreferences } from "./desktop-shell";

type PickPathKind = "directory" | "file" | "save";

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
  serversUpdatePatch: "servers:update-patch",
  serversSetEnabled: "servers:set-enabled",
  serversDelete: "servers:delete",
  serversClone: "servers:clone",
  serversCloneWithParams: "servers:clone-with-params",
  serversCloneCopyCancel: "servers:clone-copy-cancel",
  serversProbeImport: "servers:probe-import",
  serversImportExisting: "servers:import-existing",
  serversStart: "servers:start",
  serversStop: "servers:stop",
  serversRestart: "servers:restart",
  serversKill: "servers:kill",
  serversInstallFiles: "servers:install-files",
  serversUpdateNow: "servers:update-now",
  serversEnqueueUpdate: "servers:enqueue-update",
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
  steamcmdPause: "steamcmd:pause",
  criticalJobRetry: "critical-jobs:retry",
  criticalJobDismiss: "critical-jobs:dismiss",
  criticalJobCancel: "critical-jobs:cancel",
  criticalJobResume: "critical-jobs:resume",
  criticalJobReorder: "critical-jobs:reorder",
  steamcmdSetPath: "steamcmd:set-path",
  steamcmdOpenCache: "steamcmd:open-cache",
  steamcmdClearCache: "steamcmd:clear-cache",
  clusterCheck: "cluster:check",
  rconCommand: "rcon:command",
  rconRetryConnection: "rcon:retry-connection",
  rconGetStatus: "rcon:get-status",
  rconGetAllStatus: "rcon:get-all-status",
  rconTabFocusChanged: "rcon:tab-focus-changed",
  processMetricsSetSampling: "process-metrics:set-sampling",
  refreshPlayerList: "rcon:refresh-player-list",
  kickPlayer: "rcon:kick-player",
  banPlayer: "rcon:ban-player",
  listBannedPlayers: "rcon:list-banned-players",
  unbanPlayer: "rcon:unban-player",
  openBanListFile: "rcon:open-ban-list-file",
  getAdminList: "admin-list:get",
  setAdminList: "admin-list:set-config",
  validateAdminListUrl: "admin-list:validate-url",
  learnAdminListNames: "admin-list:learn-names",
  eventsRecent: "events:recent",
  pickPath: "fs:pick-path",
  appListDataFolders: "app:list-data-folders",
  appOpenDataFolder: "app:open-data-folder",
  appGetUiDensity: "app:get-ui-density",
  appSetUiDensity: "app:set-ui-density",
  appGetOpenNativeConsole: "app:get-open-native-console",
  appSetOpenNativeConsole: "app:set-open-native-console",
  appGetLastSeenChangelogVersion: "app:get-last-seen-changelog-version",
  appSetLastSeenChangelogVersion: "app:set-last-seen-changelog-version",
  appGetOnboarding: "app:get-onboarding",
  appSetOnboarding: "app:set-onboarding",
  appGetDesktopShellPreferences: "app:get-desktop-shell-preferences",
  appSetCloseWindowToTray: "app:set-close-window-to-tray",
  appSetStartWithWindows: "app:set-start-with-windows",
  appSetTrayCloseHintDismissed: "app:set-tray-close-hint-dismissed",
  appSetOsNotifyEnabled: "app:set-os-notify-enabled",
  appSetOsNotifyCrash: "app:set-os-notify-crash",
  appSetOsNotifySteamCmd: "app:set-os-notify-steamcmd",
  appSetOsNotifyYarkUpdate: "app:set-os-notify-yark-update",
  appGetUpdateStatus: "app:get-update-status",
  appCheckForUpdate: "app:check-for-update",
  appDownloadUpdate: "app:download-update",
  appInstallUpdate: "app:install-update",
  appOpenYarkReleaseNotes: "app:open-yark-release-notes",
  iniRead: "ini:read",
  iniPreview: "ini:preview",
  iniSave: "ini:save",
  iniOpenInEditor: "ini:open-in-editor",
  clusterIniGet: "cluster-ini:get",
  clusterIniGetOrDraft: "cluster-ini:get-or-draft",
  clusterIniPreview: "cluster-ini:preview",
  clusterIniSave: "cluster-ini:save",
  clusterIniDelete: "cluster-ini:delete",
  clusterIniPreviewRestore: "cluster-ini:preview-restore",
  clusterIniPreviewPromote: "cluster-ini:preview-promote",
  clusterIniPreviewSeed: "cluster-ini:preview-seed",
  clusterIniRestore: "cluster-ini:restore",
  clusterIniPromote: "cluster-ini:promote",
  clusterIniSeed: "cluster-ini:seed",
  configTransferDescribe: "config-transfer:describe",
  configTransferPreview: "config-transfer:preview",
  configTransferCommit: "config-transfer:commit",
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
  backupsDeleteFailed: "backups:delete-failed",
  backupsRestore: "backups:restore",
  backupsGetPolicy: "backups:get-policy",
  backupsSetPolicy: "backups:set-policy",
  maintenanceGetPolicy: "maintenance:get-policy",
  maintenanceSetPolicy: "maintenance:set-policy",
  maintenanceClearSchedulePause: "maintenance:clear-schedule-pause",
  maintenanceRunRestartNow: "maintenance:run-restart-now",
  maintenanceRunUpdateNow: "maintenance:run-update-now",
  maintenanceCancelUpcoming: "maintenance:cancel-upcoming",
  backupsResolveRoot: "backups:resolve-root",
  backupsOpenFolder: "backups:open-folder",
  backupsOpenRoot: "backups:open-root",
  backupsExport: "backups:export",
  backupsImport: "backups:import",
  backupsFleetSummary: "backups:fleet-summary",
  backupsDismissFleetAlert: "backups:dismiss-fleet-alert",
  backupsGetDiskAlertSettings: "backups:get-disk-alert-settings",
  backupsSetDiskAlertSettings: "backups:set-disk-alert-settings",
  backupsPreviewCleanup: "backups:preview-cleanup",
  backupsRunCleanup: "backups:run-cleanup",
  modsGet: "mods:get",
  modsGetMany: "mods:get-many",
  modsSearch: "mods:search",
  modsListCategories: "mods:list-categories",
  modsGetByReference: "mods:get-by-reference",
  modsOpenCurseForge: "mods:open-curseforge",
} as const;

/** Push channel (main -> renderer). */
export const IPC_PUSH = {
  serverStatus: "push:server-status",
  steamCmdProgress: "push:steamcmd-progress",
  serverStopProgress: "push:server-stop-progress",
  moveInstallProgress: "push:move-install-progress",
  cloneInstallProgress: "push:clone-install-progress",
  backupsChanged: "push:backups-changed",
  rconStatusChanged: "push:rcon-status-changed",
  playerListUpdated: "push:player-list-updated",
  processMetricsUpdated: "push:process-metrics-updated",
  appUpdate: "push:app-update",
  osNotificationOpen: "push:os-notification-open",
} as const;

export interface SteamCmdProgressPush {
  status: SteamCmdStatus;
  console: SteamCmdConsoleSnapshot;
}

export type ServerStopProgressPush = ServerStopProgress;

export type MoveInstallProgressPush = MoveInstallProgress;

export type CloneInstallProgressPush = CloneInstallProgress;

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

/** ASA administrator whitelist mode (#153). */
type AdminListModeDto = "local" | "remote" | "misconfigured";

export interface AdminListStateDto {
  mode: AdminListModeDto;
  adminListUrl: string;
  updateAllowedCheatersInterval: number;
  entries: Array<{ id: string; name: string | null }>;
  listError: string | null;
  filePath: string;
  fileExists: boolean;
  fileByteLength: number;
}

interface AdminListConfigDto {
  adminListUrl: string;
  updateAllowedCheatersInterval: number;
}

interface AdminListValidateDto {
  count: number;
  ids: string[];
}

interface AdminListLearnNamesDto {
  updated: number;
}

export interface PlayerListUpdatedPush {
  serverId: string;
  players: OnlinePlayerInfo[];
  timestamp: string;
  error: string | null;
}

/** Dedicated-process working set + CPU sample (#302). */
export interface ProcessMetricsUpdatedPush {
  serverId: string;
  pid: number;
  workingSetBytes: number | null;
  /** % of one logical processor; null until the second successful sample. */
  cpuPercent: number | null;
  sampledAt: string;
  error: string | null;
}

/** Click a Windows OS toast: reveal YARK and jump to a useful surface (#331). */
export type OsNotificationOpenPush =
  | { kind: "crash"; serverId: string; eventId: number }
  | { kind: "steamcmd"; serverId: string | null }
  | { kind: "yarkUpdate" };

/** Normalized result of IPC operations. */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** API exposed to the renderer via contextBridge. */
export interface RendererApi {
  listServers(): Promise<IpcResult<ServerProfile[]>>;
  createServer(input: ServerProfileInput): Promise<IpcResult<ServerProfile>>;
  probeImportInstall(installDir: string): Promise<IpcResult<ImportInstallProbe>>;
  importExistingServer(
    input: ServerProfileInput,
    options?: ImportExistingOptions,
  ): Promise<IpcResult<ServerProfile>>;
  updateServer(
    id: string,
    input: ServerProfileInput,
  ): Promise<IpcResult<ServerProfile>>;
  updateServerPatch(
    id: string,
    patch: ServerProfilePatch,
  ): Promise<IpcResult<ServerProfile>>;
  setServerEnabled(id: string, enabled: boolean): Promise<IpcResult<ServerProfile>>;
  deleteServer(
    id: string,
    options: DeleteServerOptions,
  ): Promise<IpcResult<void>>;
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
      copyInstallFolder?: boolean;
    },
  ): Promise<IpcResult<ServerProfile>>;
  cancelCloneServerCopy(): Promise<IpcResult<boolean>>;
  startServer(id: string, options?: StartServerOptions): Promise<IpcResult<void>>;
  stopServer(id: string): Promise<IpcResult<void>>;
  restartServer(id: string, options?: StartServerOptions): Promise<IpcResult<void>>;
  killServer(id: string): Promise<IpcResult<void>>;
  installServerFiles(id: string): Promise<IpcResult<void>>;
  updateServerNow(id: string): Promise<IpcResult<void>>;
  enqueueUpdateServer(id: string): Promise<IpcResult<void>>;
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
  pauseSteamCmd(): Promise<IpcResult<boolean>>;
  retryCriticalJob(id: string): Promise<IpcResult<boolean>>;
  dismissCriticalJob(id: string): Promise<IpcResult<boolean>>;
  cancelCriticalJob(id: string): Promise<IpcResult<boolean>>;
  resumeCriticalJob(id: string): Promise<IpcResult<boolean>>;
  reorderCriticalJob(
    id: string,
    direction: "up" | "down",
  ): Promise<IpcResult<boolean>>;
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
  /** Enable/disable dedicated-process RAM/CPU sampling (#302). */
  setProcessMetricsSampling(enabled: boolean): Promise<IpcResult<void>>;
  refreshPlayerList(serverId: string): Promise<IpcResult<OnlinePlayerInfo[]>>;
  kickPlayer(serverId: string, playerKey: string): Promise<IpcResult<string>>;
  banPlayer(serverId: string, playerKey: string): Promise<IpcResult<string>>;
  listBannedPlayers(serverId: string): Promise<IpcResult<OnlinePlayerInfo[]>>;
  unbanPlayer(serverId: string, playerKey: string): Promise<
    IpcResult<{ banned: OnlinePlayerInfo[]; warning: string | null }>
  >;
  openBanListFile(serverId: string): Promise<IpcResult<void>>;
  getAdminList(serverId: string): Promise<IpcResult<AdminListStateDto>>;
  setAdminList(
    serverId: string,
    config: AdminListConfigDto,
  ): Promise<IpcResult<AdminListStateDto>>;
  validateAdminListUrl(
    serverId: string,
    url: string,
  ): Promise<IpcResult<AdminListValidateDto>>;
  learnAdminListNames(
    serverId: string,
    hints: Array<{ id: string; name: string }>,
  ): Promise<IpcResult<AdminListLearnNamesDto>>;
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
  /** `null` when unset in `app_settings` (caller may migrate / apply default). */
  getOpenNativeConsole(): Promise<IpcResult<boolean | null>>;
  setOpenNativeConsole(enabled: boolean): Promise<IpcResult<boolean>>;
  /** `null` when the operator has not dismissed What's new yet. */
  getLastSeenChangelogVersion(): Promise<IpcResult<string | null>>;
  setLastSeenChangelogVersion(version: string): Promise<IpcResult<string>>;
  /** `null` when first-run setup has not been completed or skipped. */
  getOnboarding(): Promise<IpcResult<OnboardingRecord | null>>;
  setOnboarding(
    record: OnboardingRecord | null,
  ): Promise<IpcResult<OnboardingRecord | null>>;
  getDesktopShellPreferences(): Promise<IpcResult<DesktopShellPreferences>>;
  setCloseWindowToTray(enabled: boolean): Promise<IpcResult<boolean>>;
  setStartWithWindows(enabled: boolean): Promise<IpcResult<boolean>>;
  setTrayCloseHintDismissed(dismissed: boolean): Promise<IpcResult<boolean>>;
  setOsNotifyEnabled(enabled: boolean): Promise<IpcResult<boolean>>;
  setOsNotifyCrash(enabled: boolean): Promise<IpcResult<boolean>>;
  setOsNotifySteamCmd(enabled: boolean): Promise<IpcResult<boolean>>;
  setOsNotifyYarkUpdate(enabled: boolean): Promise<IpcResult<boolean>>;
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
  getClusterIniTemplate(
    clusterId: string,
  ): Promise<IpcResult<ClusterIniTemplate | null>>;
  getClusterIniTemplateOrDraft(
    clusterId: string,
  ): Promise<IpcResult<ClusterIniTemplate>>;
  previewClusterIniTemplate(
    clusterId: string,
    payload: ServerIniPayload,
  ): Promise<IpcResult<IniPreview>>;
  saveClusterIniTemplate(
    clusterId: string,
    payload: ServerIniPayload,
  ): Promise<IpcResult<{ template: ClusterIniTemplate; preview: IniPreview }>>;
  deleteClusterIniTemplate(clusterId: string): Promise<IpcResult<boolean>>;
  previewClusterIniRestore(
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ): Promise<IpcResult<ClusterIniTemplateMemberPreview>>;
  previewClusterIniPromote(
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ): Promise<IpcResult<ClusterIniTemplateMemberPreview>>;
  previewClusterIniSeed(
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ): Promise<IpcResult<ClusterIniTemplateMemberPreview>>;
  restoreClusterIniFromTemplate(
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ): Promise<IpcResult<ClusterIniTemplateApplyResult>>;
  promoteClusterIniToTemplate(
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ): Promise<IpcResult<ClusterIniTemplateApplyResult>>;
  seedClusterIniFromTemplate(
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ): Promise<IpcResult<ClusterIniTemplateApplyResult>>;
  describeConfigTransferSource(
    sourceId: string,
  ): Promise<IpcResult<ConfigTransferDescribeResult>>;
  previewConfigTransfer(
    sourceId: string,
    targetId: string,
    selection: unknown,
  ): Promise<IpcResult<ConfigTransferPreview>>;
  commitConfigTransfer(
    sourceId: string,
    targetId: string,
    selection: unknown,
    fingerprint: string,
  ): Promise<IpcResult<ConfigTransferCommitResult>>;
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
  deleteFailedBackups(
    serverId: string,
    kind: BackupKind,
  ): Promise<IpcResult<number>>;
  restoreBackup(
    serverId: string,
    backupId: string,
    options?: RestoreBackupOptions,
  ): Promise<IpcResult<void>>;
  getBackupPolicy(serverId: string): Promise<IpcResult<BackupPolicyStatus>>;
  setBackupPolicy(
    serverId: string,
    policy: Omit<BackupPolicy, "serverId" | "updatedAt">,
  ): Promise<IpcResult<BackupPolicy>>;
  getMaintenancePolicy(serverId: string): Promise<IpcResult<MaintenancePolicyStatus>>;
  setMaintenancePolicy(
    serverId: string,
    policy: Omit<MaintenancePolicy, "serverId" | "updatedAt">,
  ): Promise<IpcResult<MaintenancePolicyStatus>>;
  clearMaintenanceSchedulePause(
    serverId: string,
  ): Promise<IpcResult<MaintenancePolicyStatus>>;
  runMaintenanceRestartNow(
    serverId: string,
  ): Promise<IpcResult<MaintenancePolicyStatus>>;
  runMaintenanceUpdateNow(
    serverId: string,
  ): Promise<IpcResult<MaintenancePolicyStatus>>;
  cancelMaintenanceUpcoming(
    serverId: string,
  ): Promise<IpcResult<MaintenancePolicyStatus>>;
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
  dismissBackupFleetAlert(
    alertId: string,
    fingerprint: string,
  ): Promise<IpcResult<void>>;
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
    options?: ModSearchOptions,
  ): Promise<IpcResult<ModSearchPage>>;
  listModCategories(): Promise<IpcResult<ModCategory[]>>;
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
  onCloneInstallProgress(
    listener: (payload: CloneInstallProgressPush) => void,
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
  onProcessMetricsUpdated(
    listener: (payload: ProcessMetricsUpdatedPush) => void,
  ): () => void;
  onAppUpdate(listener: (status: AppUpdateStatus) => void): () => void;
  onOsNotificationOpen(
    listener: (payload: OsNotificationOpenPush) => void,
  ): () => void;
}
