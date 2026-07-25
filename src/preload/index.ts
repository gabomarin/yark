import { contextBridge, ipcRenderer } from "electron";
import { IPC, IPC_PUSH, type RendererApi } from "../shared/ipc";
import type {
  ServerIniPayload,
  ServerProfileInput,
  ServerRuntimeInfo,
  StartServerOptions,
} from "../shared/types";
import type { SteamCmdProgressPush, BackupsChangedPush } from "../shared/ipc";

const api: RendererApi = {
  listServers: () => ipcRenderer.invoke(IPC.serversList),
  createServer: (input: ServerProfileInput) =>
    ipcRenderer.invoke(IPC.serversCreate, input),
  updateServer: (id: string, input: ServerProfileInput) =>
    ipcRenderer.invoke(IPC.serversUpdate, id, input),
  deleteServer: (id: string) => ipcRenderer.invoke(IPC.serversDelete, id),
  cloneServer: (id: string) => ipcRenderer.invoke(IPC.serversClone, id),
  startServer: (id: string, options?: StartServerOptions) =>
    ipcRenderer.invoke(IPC.serversStart, id, options),
  stopServer: (id: string) => ipcRenderer.invoke(IPC.serversStop, id),
  killServer: (id: string) => ipcRenderer.invoke(IPC.serversKill, id),
  installServerFiles: (id: string) => ipcRenderer.invoke(IPC.serversInstallFiles, id),
  updateServerNow: (id: string) => ipcRenderer.invoke(IPC.serversUpdateNow, id),
  verifyServerFiles: (id: string) => ipcRenderer.invoke(IPC.serversVerifyFiles, id),
  openServerFolder: (id: string) => ipcRenderer.invoke(IPC.serversOpenFolder, id),
  openServerNativeTerminal: (id: string) => ipcRenderer.invoke(IPC.serversOpenNativeTerminal, id),
  installSteamCmd: () => ipcRenderer.invoke(IPC.steamcmdInstall),
  cancelSteamCmd: () => ipcRenderer.invoke(IPC.steamcmdCancel),
  setSteamCmdPath: (path: string) => ipcRenderer.invoke(IPC.steamcmdSetPath, path),
  getSteamCmdStatus: () => ipcRenderer.invoke(IPC.steamcmdStatus),
  getSteamCmdConsole: (limit?: number) => ipcRenderer.invoke(IPC.steamcmdConsole, limit),
  getStatuses: () => ipcRenderer.invoke(IPC.serversStatuses),
  getInstallationInfo: (forceOfficialCheck?: boolean) =>
    ipcRenderer.invoke(IPC.serversInstallation, forceOfficialCheck),
  checkCluster: () => ipcRenderer.invoke(IPC.clusterCheck),
  sendRconCommand: (id: string, command: string) =>
    ipcRenderer.invoke(IPC.rconCommand, id, command),
  recentEvents: (limit: number) =>
    ipcRenderer.invoke(IPC.eventsRecent, limit),
  pickPath: (kind, defaultPath, title) =>
    ipcRenderer.invoke(IPC.pickPath, kind, defaultPath, title),
  readServerIni: (serverId: string) =>
    ipcRenderer.invoke(IPC.iniRead, serverId),
  openServerIniInEditor: (serverId: string, fileKey: "gameUserSettings" | "game") =>
    ipcRenderer.invoke(IPC.iniOpenInEditor, serverId, fileKey),
  previewServerIni: (serverId: string, payload: ServerIniPayload) =>
    ipcRenderer.invoke(IPC.iniPreview, serverId, payload),
  saveServerIni: (serverId: string, payload: ServerIniPayload) =>
    ipcRenderer.invoke(IPC.iniSave, serverId, payload),
  listServerLogs: (serverId: string) =>
    ipcRenderer.invoke(IPC.logsList, serverId),
  readServerUpdateLog: (serverId: string, fileName: string, maxBytes?: number) =>
    ipcRenderer.invoke(IPC.logsReadUpdate, serverId, fileName, maxBytes),
  exportServerLogs: (serverId: string) =>
    ipcRenderer.invoke(IPC.logsExport, serverId),
  openServerUpdateLogFile: (serverId: string, fileName: string) =>
    ipcRenderer.invoke(IPC.logsOpenUpdateFile, serverId, fileName),
  listBackups: (serverId: string, limit?: number) =>
    ipcRenderer.invoke(IPC.backupsList, serverId, limit),
  createManualBackup: (serverId, kinds) =>
    ipcRenderer.invoke(IPC.backupsCreate, serverId, kinds),
  deleteBackups: (serverId, backupIds) =>
    ipcRenderer.invoke(IPC.backupsDelete, serverId, backupIds),
  restoreBackup: (serverId: string, backupId: string) =>
    ipcRenderer.invoke(IPC.backupsRestore, serverId, backupId),
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
  getModMetadata: (modId: string, forceRefresh?: boolean) =>
    ipcRenderer.invoke(IPC.modsGet, modId, forceRefresh),
  getModsMetadata: (modIds: string[], forceRefresh?: boolean) =>
    ipcRenderer.invoke(IPC.modsGetMany, modIds, forceRefresh),
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
  onBackupsChanged: (listener) => {
    const handler = (_e: unknown, payload: BackupsChangedPush) => listener(payload);
    ipcRenderer.on(IPC_PUSH.backupsChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.backupsChanged, handler);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
