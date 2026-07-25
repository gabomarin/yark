import type {
  AppEvent,
  ClusterComplianceReport,
  IniPreview,
  ModMetadata,
  ServerIniPayload,
  ServerIniSnapshot,
  ServerInstallationSnapshot,
  ServerOperationalLogs,
  ServerProfile,
  ServerProfileInput,
  ServerRuntimeInfo,
  SteamCmdConsoleSnapshot,
  SteamCmdStatus,
  StartServerOptions,
} from "./types";

export type PickPathKind = "directory" | "file";

/** Invokable IPC channels (renderer -> main). */
export const IPC = {
  serversList: "servers:list",
  serversCreate: "servers:create",
  serversUpdate: "servers:update",
  serversDelete: "servers:delete",
  serversClone: "servers:clone",
  serversStart: "servers:start",
  serversStop: "servers:stop",
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
  steamcmdSetPath: "steamcmd:set-path",
  clusterCheck: "cluster:check",
  rconCommand: "rcon:command",
  eventsRecent: "events:recent",
  pickPath: "fs:pick-path",
  iniRead: "ini:read",
  iniPreview: "ini:preview",
  iniSave: "ini:save",
  iniOpenInEditor: "ini:open-in-editor",
  logsList: "logs:list",
  logsReadUpdate: "logs:read-update",
  logsExport: "logs:export",
  logsOpenUpdateFile: "logs:open-update-file",
  modsGet: "mods:get",
  modsGetMany: "mods:get-many",
} as const;

/** Push channel (main -> renderer). */
export const IPC_PUSH = {
  serverStatus: "push:server-status",
  steamCmdProgress: "push:steamcmd-progress",
} as const;

export interface SteamCmdProgressPush {
  status: SteamCmdStatus;
  console: SteamCmdConsoleSnapshot;
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
  deleteServer(id: string): Promise<IpcResult<void>>;
  cloneServer(id: string): Promise<IpcResult<ServerProfile>>;
  startServer(id: string, options?: StartServerOptions): Promise<IpcResult<void>>;
  stopServer(id: string): Promise<IpcResult<void>>;
  killServer(id: string): Promise<IpcResult<void>>;
  installServerFiles(id: string): Promise<IpcResult<void>>;
  updateServerNow(id: string): Promise<IpcResult<void>>;
  verifyServerFiles(id: string): Promise<IpcResult<void>>;
  openServerFolder(id: string): Promise<IpcResult<void>>;
  openServerNativeTerminal(id: string): Promise<IpcResult<void>>;
  installSteamCmd(): Promise<IpcResult<string>>;
  cancelSteamCmd(): Promise<IpcResult<boolean>>;
  setSteamCmdPath(path: string): Promise<IpcResult<string>>;
  getSteamCmdStatus(): Promise<IpcResult<SteamCmdStatus>>;
  getSteamCmdConsole(limit?: number): Promise<IpcResult<SteamCmdConsoleSnapshot>>;
  getStatuses(): Promise<IpcResult<ServerRuntimeInfo[]>>;
  getInstallationInfo(forceOfficialCheck?: boolean): Promise<IpcResult<ServerInstallationSnapshot>>;
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
  getModMetadata(modId: string, forceRefresh?: boolean): Promise<IpcResult<ModMetadata>>;
  getModsMetadata(
    modIds: string[],
    forceRefresh?: boolean,
  ): Promise<IpcResult<ModMetadata[]>>;
  onServerStatus(
    listener: (info: ServerRuntimeInfo) => void,
  ): () => void;
  onSteamCmdProgress(
    listener: (payload: SteamCmdProgressPush) => void,
  ): () => void;
}
