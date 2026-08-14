import { contextBridge, ipcRenderer } from "electron";
import { IPC, IPC_PUSH, type RendererApi } from "../shared/ipc";
import type {
  BackupKind,
  ClusterIniTemplateFileSelection,
  ServerIniPayload,
  ServerProfileInput,
  ServerProfilePatch,
  ServerRuntimeInfo,
  StartServerOptions,
  SteamCmdCacheKind,
} from "../shared/types";
import type { SteamCmdProgressPush, BackupsChangedPush, ServerStopProgressPush, MoveInstallProgressPush, RconStatusChangedPush, PlayerListUpdatedPush } from "../shared/ipc";
import { normalizeMoveInstallProgress, normalizeServerStopProgress } from "../shared/types";

const api: RendererApi = {
  listServers: () => ipcRenderer.invoke(IPC.serversList),
  createServer: (input: ServerProfileInput) =>
    ipcRenderer.invoke(IPC.serversCreate, input),
  probeImportInstall: (installDir: string) =>
    ipcRenderer.invoke(IPC.serversProbeImport, installDir),
  importExistingServer: (
    input: ServerProfileInput,
    options?: { allowIncompleteInstall?: boolean },
  ) => ipcRenderer.invoke(IPC.serversImportExisting, input, options),
  updateServer: (id: string, input: ServerProfileInput) =>
    ipcRenderer.invoke(IPC.serversUpdate, id, input),
  updateServerPatch: (id: string, patch: ServerProfilePatch) =>
    ipcRenderer.invoke(IPC.serversUpdatePatch, id, patch),
  setServerEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke(IPC.serversSetEnabled, id, enabled),
  deleteServer: (id: string, options: { deleteInstallFiles: boolean }) =>
    ipcRenderer.invoke(IPC.serversDelete, id, options),
  cloneServer: (id: string) => ipcRenderer.invoke(IPC.serversClone, id),
  cloneServerWithParams: (id: string, params: { name: string; sessionName: string; gamePort: number; queryPort: number; rconPort: number; installDir: string }) =>
    ipcRenderer.invoke(IPC.serversCloneWithParams, id, params),
  startServer: (id: string, options?: StartServerOptions) =>
    ipcRenderer.invoke(IPC.serversStart, id, options),
  stopServer: (id: string) => ipcRenderer.invoke(IPC.serversStop, id),
  restartServer: (id: string, options?: StartServerOptions) =>
    ipcRenderer.invoke(IPC.serversRestart, id, options),
  killServer: (id: string) => ipcRenderer.invoke(IPC.serversKill, id),
  installServerFiles: (id: string) => ipcRenderer.invoke(IPC.serversInstallFiles, id),
  updateServerNow: (id: string) => ipcRenderer.invoke(IPC.serversUpdateNow, id),
  verifyServerFiles: (id: string) => ipcRenderer.invoke(IPC.serversVerifyFiles, id),
  moveServerInstall: (id: string, destinationDir: string) =>
    ipcRenderer.invoke(IPC.serversMoveInstall, id, destinationDir),
  cancelMoveServerInstall: () => ipcRenderer.invoke(IPC.serversMoveInstallCancel),
  cleanupMovedServerInstall: (id: string, oldSourceDir: string) =>
    ipcRenderer.invoke(IPC.serversMoveInstallCleanup, id, oldSourceDir),
  dismissMoveServerInstallCleanup: (id: string) =>
    ipcRenderer.invoke(IPC.serversMoveInstallDismissCleanup, id),
  openServerFolder: (id: string) => ipcRenderer.invoke(IPC.serversOpenFolder, id),
  openServerNativeTerminal: (id: string) => ipcRenderer.invoke(IPC.serversOpenNativeTerminal, id),
  installSteamCmd: () => ipcRenderer.invoke(IPC.steamcmdInstall),
  cancelSteamCmd: () => ipcRenderer.invoke(IPC.steamcmdCancel),
  retryCriticalJob: (id: string) => ipcRenderer.invoke(IPC.criticalJobRetry, id),
  dismissCriticalJob: (id: string) => ipcRenderer.invoke(IPC.criticalJobDismiss, id),
  cancelCriticalJob: (id: string) => ipcRenderer.invoke(IPC.criticalJobCancel, id),
  setSteamCmdPath: (path: string) => ipcRenderer.invoke(IPC.steamcmdSetPath, path),
  getSteamCmdStatus: () => ipcRenderer.invoke(IPC.steamcmdStatus),
  getSteamCmdConsole: (limit?: number) => ipcRenderer.invoke(IPC.steamcmdConsole, limit),
  openSteamCmdCache: (kind: SteamCmdCacheKind) => ipcRenderer.invoke(IPC.steamcmdOpenCache, kind),
  clearSteamCmdCache: (kind: SteamCmdCacheKind) => ipcRenderer.invoke(IPC.steamcmdClearCache, kind),
  getStatuses: () => ipcRenderer.invoke(IPC.serversStatuses),
  getInstallationInfo: (
    forceOfficialCheck?: boolean,
    serversMode?: import("@shared/types").InstallationServersMode,
  ) => ipcRenderer.invoke(IPC.serversInstallation, forceOfficialCheck, serversMode),
  checkCluster: () => ipcRenderer.invoke(IPC.clusterCheck),
  sendRconCommand: (id: string, command: string) =>
    ipcRenderer.invoke(IPC.rconCommand, id, command),
  retryRconConnection: (id: string) =>
    ipcRenderer.invoke(IPC.rconRetryConnection, id),
  getRconStatus: (id: string) =>
    ipcRenderer.invoke(IPC.rconGetStatus, id),
  getAllRconStatus: () =>
    ipcRenderer.invoke(IPC.rconGetAllStatus),
  notifyRconTabFocus: (serverId: string, isFocused: boolean) =>
    ipcRenderer.invoke(IPC.rconTabFocusChanged, serverId, isFocused),
  refreshPlayerList: (serverId: string) =>
    ipcRenderer.invoke(IPC.refreshPlayerList, serverId),
  kickPlayer: (serverId: string, playerKey: string) =>
    ipcRenderer.invoke(IPC.kickPlayer, serverId, playerKey),
  banPlayer: (serverId: string, playerKey: string) =>
    ipcRenderer.invoke(IPC.banPlayer, serverId, playerKey),
  listBannedPlayers: (serverId: string) =>
    ipcRenderer.invoke(IPC.listBannedPlayers, serverId),
  unbanPlayer: (serverId: string, playerKey: string) =>
    ipcRenderer.invoke(IPC.unbanPlayer, serverId, playerKey),
  openBanListFile: (serverId: string) =>
    ipcRenderer.invoke(IPC.openBanListFile, serverId),
  recentEvents: (limit: number) =>
    ipcRenderer.invoke(IPC.eventsRecent, limit),
  pickPath: (kind, defaultPath, title) =>
    ipcRenderer.invoke(IPC.pickPath, kind, defaultPath, title),
  pickFolder: async (defaultPath) => {
    const result = await ipcRenderer.invoke(
      IPC.pickPath,
      "directory",
      defaultPath,
      undefined,
    );
    return result.ok ? result.data : null;
  },
  listAppDataFolders: () => ipcRenderer.invoke(IPC.appListDataFolders),
  openAppDataFolder: (kind) => ipcRenderer.invoke(IPC.appOpenDataFolder, kind),
  getUiDensity: () => ipcRenderer.invoke(IPC.appGetUiDensity),
  setUiDensity: (density) => ipcRenderer.invoke(IPC.appSetUiDensity, density),
  getLastSeenChangelogVersion: () =>
    ipcRenderer.invoke(IPC.appGetLastSeenChangelogVersion),
  setLastSeenChangelogVersion: (version) =>
    ipcRenderer.invoke(IPC.appSetLastSeenChangelogVersion, version),
  getOnboarding: () => ipcRenderer.invoke(IPC.appGetOnboarding),
  setOnboarding: (record) => ipcRenderer.invoke(IPC.appSetOnboarding, record),
  getDesktopShellPreferences: () =>
    ipcRenderer.invoke(IPC.appGetDesktopShellPreferences),
  setCloseWindowToTray: (enabled) =>
    ipcRenderer.invoke(IPC.appSetCloseWindowToTray, enabled),
  setStartWithWindows: (enabled) =>
    ipcRenderer.invoke(IPC.appSetStartWithWindows, enabled),
  setTrayCloseHintDismissed: (dismissed) =>
    ipcRenderer.invoke(IPC.appSetTrayCloseHintDismissed, dismissed),
  getAppUpdateStatus: () => ipcRenderer.invoke(IPC.appGetUpdateStatus),
  checkForAppUpdate: () => ipcRenderer.invoke(IPC.appCheckForUpdate),
  downloadAppUpdate: () => ipcRenderer.invoke(IPC.appDownloadUpdate),
  installAppUpdate: () => ipcRenderer.invoke(IPC.appInstallUpdate),
  openYarkReleaseNotes: () => ipcRenderer.invoke(IPC.appOpenYarkReleaseNotes),
  readServerIni: (serverId: string) =>
    ipcRenderer.invoke(IPC.iniRead, serverId),
  openServerIniInEditor: (serverId: string, fileKey: "gameUserSettings" | "game") =>
    ipcRenderer.invoke(IPC.iniOpenInEditor, serverId, fileKey),
  previewServerIni: (serverId: string, payload: ServerIniPayload) =>
    ipcRenderer.invoke(IPC.iniPreview, serverId, payload),
  saveServerIni: (serverId: string, payload: ServerIniPayload) =>
    ipcRenderer.invoke(IPC.iniSave, serverId, payload),
  getClusterIniTemplate: (clusterId: string) =>
    ipcRenderer.invoke(IPC.clusterIniGet, clusterId),
  getClusterIniTemplateOrDraft: (clusterId: string) =>
    ipcRenderer.invoke(IPC.clusterIniGetOrDraft, clusterId),
  previewClusterIniTemplate: (clusterId: string, payload: ServerIniPayload) =>
    ipcRenderer.invoke(IPC.clusterIniPreview, clusterId, payload),
  saveClusterIniTemplate: (clusterId: string, payload: ServerIniPayload) =>
    ipcRenderer.invoke(IPC.clusterIniSave, clusterId, payload),
  deleteClusterIniTemplate: (clusterId: string) =>
    ipcRenderer.invoke(IPC.clusterIniDelete, clusterId),
  previewClusterIniRestore: (
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ) =>
    ipcRenderer.invoke(IPC.clusterIniPreviewRestore, clusterId, serverId, files),
  previewClusterIniPromote: (
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ) =>
    ipcRenderer.invoke(IPC.clusterIniPreviewPromote, clusterId, serverId, files),
  previewClusterIniSeed: (
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ) =>
    ipcRenderer.invoke(IPC.clusterIniPreviewSeed, clusterId, serverId, files),
  restoreClusterIniFromTemplate: (
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ) => ipcRenderer.invoke(IPC.clusterIniRestore, clusterId, serverId, files),
  promoteClusterIniToTemplate: (
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ) => ipcRenderer.invoke(IPC.clusterIniPromote, clusterId, serverId, files),
  seedClusterIniFromTemplate: (
    clusterId: string,
    serverId: string,
    files?: ClusterIniTemplateFileSelection,
  ) => ipcRenderer.invoke(IPC.clusterIniSeed, clusterId, serverId, files),
  describeConfigTransferSource: (sourceId: string) =>
    ipcRenderer.invoke(IPC.configTransferDescribe, sourceId),
  previewConfigTransfer: (
    sourceId: string,
    targetId: string,
    selection: unknown,
  ) => ipcRenderer.invoke(IPC.configTransferPreview, sourceId, targetId, selection),
  commitConfigTransfer: (
    sourceId: string,
    targetId: string,
    selection: unknown,
    fingerprint: string,
  ) =>
    ipcRenderer.invoke(
      IPC.configTransferCommit,
      sourceId,
      targetId,
      selection,
      fingerprint,
    ),
  listServerLogs: (serverId: string) =>
    ipcRenderer.invoke(IPC.logsList, serverId),
  getServerRuntimeLog: (serverId: string, limit?: number) =>
    ipcRenderer.invoke(IPC.logsRuntime, serverId, limit),
  readServerUpdateLog: (serverId: string, fileName: string, maxBytes?: number) =>
    ipcRenderer.invoke(IPC.logsReadUpdate, serverId, fileName, maxBytes),
  exportServerLogs: (serverId: string) =>
    ipcRenderer.invoke(IPC.logsExport, serverId),
  openServerUpdateLogFile: (serverId: string, fileName: string) =>
    ipcRenderer.invoke(IPC.logsOpenUpdateFile, serverId, fileName),
  clearServerEvents: (serverId: string) =>
    ipcRenderer.invoke(IPC.logsClearEvents, serverId),
  clearServerRuntimeLog: (serverId: string) =>
    ipcRenderer.invoke(IPC.logsClearRuntime, serverId),
  deleteServerUpdateLog: (serverId: string, fileName: string) =>
    ipcRenderer.invoke(IPC.logsDeleteUpdate, serverId, fileName),
  clearServerUpdateLogs: (serverId: string) =>
    ipcRenderer.invoke(IPC.logsClearUpdates, serverId),
  getLogRetentionSettings: () =>
    ipcRenderer.invoke(IPC.logsGetRetentionSettings),
  setLogRetentionSettings: (settings) =>
    ipcRenderer.invoke(IPC.logsSetRetentionSettings, settings),
  previewLogCleanup: (options) =>
    ipcRenderer.invoke(IPC.logsPreviewCleanup, options),
  runLogCleanup: (options) =>
    ipcRenderer.invoke(IPC.logsRunCleanup, options),
  listBackups: (serverId: string, limit?: number) =>
    ipcRenderer.invoke(IPC.backupsList, serverId, limit),
  createManualBackup: (serverId, kinds) =>
    ipcRenderer.invoke(IPC.backupsCreate, serverId, kinds),
  deleteBackups: (serverId, backupIds) =>
    ipcRenderer.invoke(IPC.backupsDelete, serverId, backupIds),
  deleteFailedBackups: (serverId, kind) =>
    ipcRenderer.invoke(IPC.backupsDeleteFailed, serverId, kind),
  restoreBackup: (serverId, backupId, options) =>
    ipcRenderer.invoke(IPC.backupsRestore, serverId, backupId, options),
  getBackupPolicy: (serverId: string) =>
    ipcRenderer.invoke(IPC.backupsGetPolicy, serverId),
  setBackupPolicy: (serverId, policy) =>
    ipcRenderer.invoke(IPC.backupsSetPolicy, serverId, policy),
  resolveBackupRoot: (serverId: string) =>
    ipcRenderer.invoke(IPC.backupsResolveRoot, serverId),
  openBackupFolder: (serverId: string, backupId: string) =>
    ipcRenderer.invoke(IPC.backupsOpenFolder, serverId, backupId),
  openBackupRoot: (serverId: string) =>
    ipcRenderer.invoke(IPC.backupsOpenRoot, serverId),
  exportBackup: (serverId: string, backupId: string, destinationPath: string) =>
    ipcRenderer.invoke(IPC.backupsExport, serverId, backupId, destinationPath),
  importBackup: (serverId: string, kind: BackupKind, sourcePath: string) =>
    ipcRenderer.invoke(IPC.backupsImport, serverId, kind, sourcePath),
  getBackupFleetSummary: () => ipcRenderer.invoke(IPC.backupsFleetSummary),
  dismissBackupFleetAlert: (alertId: string, fingerprint: string) =>
    ipcRenderer.invoke(IPC.backupsDismissFleetAlert, alertId, fingerprint),
  getBackupDiskAlertSettings: () =>
    ipcRenderer.invoke(IPC.backupsGetDiskAlertSettings),
  setBackupDiskAlertSettings: (settings) =>
    ipcRenderer.invoke(IPC.backupsSetDiskAlertSettings, settings),
  previewBackupCleanup: (options) =>
    ipcRenderer.invoke(IPC.backupsPreviewCleanup, options),
  runBackupCleanup: (options) =>
    ipcRenderer.invoke(IPC.backupsRunCleanup, options),
  getModMetadata: (modId: string, forceRefresh?: boolean) =>
    ipcRenderer.invoke(IPC.modsGet, modId, forceRefresh),
  getModsMetadata: (modIds: string[], forceRefresh?: boolean) =>
    ipcRenderer.invoke(IPC.modsGetMany, modIds, forceRefresh),
  searchMods: (query, options) =>
    ipcRenderer.invoke(IPC.modsSearch, query, options),
  getModByReference: (ref) =>
    ipcRenderer.invoke(IPC.modsGetByReference, ref),
  openCurseForgeMod: (url) =>
    ipcRenderer.invoke(IPC.modsOpenCurseForge, url),
  onServerStatus: (listener) => {
    const handler = (_e: unknown, info: ServerRuntimeInfo) => listener(info);
    ipcRenderer.on(IPC_PUSH.serverStatus, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.serverStatus, handler);
    };
  },
  onSteamCmdProgress: (listener) => {
    const handler = (_e: unknown, payload: SteamCmdProgressPush) => listener(payload);
    ipcRenderer.on(IPC_PUSH.steamCmdProgress, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.steamCmdProgress, handler);
    };
  },
  onServerStopProgress: (listener) => {
    const handler = (_e: unknown, payload: ServerStopProgressPush) => {
      listener(normalizeServerStopProgress(payload));
    };
    ipcRenderer.on(IPC_PUSH.serverStopProgress, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.serverStopProgress, handler);
    };
  },
  onMoveInstallProgress: (listener) => {
    const handler = (_e: unknown, payload: MoveInstallProgressPush) => {
      listener(normalizeMoveInstallProgress(payload));
    };
    ipcRenderer.on(IPC_PUSH.moveInstallProgress, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.moveInstallProgress, handler);
    };
  },
  onBackupsChanged: (listener) => {
    const handler = (_e: unknown, payload: BackupsChangedPush) => listener(payload);
    ipcRenderer.on(IPC_PUSH.backupsChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.backupsChanged, handler);
    };
  },
  onRconStatusChanged: (listener) => {
    const handler = (_e: unknown, payload: RconStatusChangedPush) => listener(payload);
    ipcRenderer.on(IPC_PUSH.rconStatusChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.rconStatusChanged, handler);
    };
  },
  onPlayerListUpdated: (listener) => {
    const handler = (_e: unknown, payload: PlayerListUpdatedPush) => listener(payload);
    ipcRenderer.on(IPC_PUSH.playerListUpdated, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.playerListUpdated, handler);
    };
  },
  onAppUpdate: (listener) => {
    const handler = (_e: unknown, status: import("../shared/app-update").AppUpdateStatus) =>
      listener(status);
    ipcRenderer.on(IPC_PUSH.appUpdate, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.appUpdate, handler);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
