import type {
  AppEvent,
  ClusterComplianceReport,
  IniPreview,
  ServerIniPayload,
  ServerIniSnapshot,
  ServerOperationalLogs,
  ServerProfile,
  ServerProfileInput,
  ServerRuntimeInfo,
  StartServerOptions,
} from "./types";

export type PickPathKind = "directory" | "file";

/** Canales IPC invocables (renderer -> main). */
export const IPC = {
  serversList: "servers:list",
  serversCreate: "servers:create",
  serversUpdate: "servers:update",
  serversDelete: "servers:delete",
  serversClone: "servers:clone",
  serversStart: "servers:start",
  serversStop: "servers:stop",
  serversKill: "servers:kill",
  serversStatuses: "servers:statuses",
  clusterCheck: "cluster:check",
  rconCommand: "rcon:command",
  eventsRecent: "events:recent",
  pickPath: "fs:pick-path",
  iniRead: "ini:read",
  iniPreview: "ini:preview",
  iniSave: "ini:save",
  logsList: "logs:list",
  logsReadUpdate: "logs:read-update",
} as const;

/** Canal de push (main -> renderer). */
export const IPC_PUSH = {
  serverStatus: "push:server-status",
} as const;

/** Resultado normalizado de operaciones IPC. */
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** API expuesta al renderer vía contextBridge. */
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
  getStatuses(): Promise<IpcResult<ServerRuntimeInfo[]>>;
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
  onServerStatus(
    listener: (info: ServerRuntimeInfo) => void,
  ): () => void;
}
