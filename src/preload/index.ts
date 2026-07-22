import { contextBridge, ipcRenderer } from "electron";
import { IPC, IPC_PUSH, type RendererApi } from "../shared/ipc";
import type { ServerProfileInput, ServerRuntimeInfo } from "../shared/types";

const api: RendererApi = {
  listServers: () => ipcRenderer.invoke(IPC.serversList),
  createServer: (input: ServerProfileInput) =>
    ipcRenderer.invoke(IPC.serversCreate, input),
  updateServer: (id: string, input: ServerProfileInput) =>
    ipcRenderer.invoke(IPC.serversUpdate, id, input),
  deleteServer: (id: string) => ipcRenderer.invoke(IPC.serversDelete, id),
  cloneServer: (id: string) => ipcRenderer.invoke(IPC.serversClone, id),
  startServer: (id: string) => ipcRenderer.invoke(IPC.serversStart, id),
  stopServer: (id: string) => ipcRenderer.invoke(IPC.serversStop, id),
  killServer: (id: string) => ipcRenderer.invoke(IPC.serversKill, id),
  getStatuses: () => ipcRenderer.invoke(IPC.serversStatuses),
  checkCluster: () => ipcRenderer.invoke(IPC.clusterCheck),
  sendRconCommand: (id: string, command: string) =>
    ipcRenderer.invoke(IPC.rconCommand, id, command),
  recentEvents: (limit: number) =>
    ipcRenderer.invoke(IPC.eventsRecent, limit),
  onServerStatus: (listener) => {
    const handler = (_e: unknown, info: ServerRuntimeInfo) => listener(info);
    ipcRenderer.on(IPC_PUSH.serverStatus, handler);
    return () => {
      ipcRenderer.removeListener(IPC_PUSH.serverStatus, handler);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
