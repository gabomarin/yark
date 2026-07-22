import { ipcMain } from "electron";
import { IPC, type IpcResult } from "../shared/ipc";
import type { ServerProfileInput } from "../shared/types";
import type { InstanceService } from "../backend/domains/instances/instance-service";
import type { ServerRepository } from "../backend/infra/db/server-repository";

function wrap<T>(fn: () => T | Promise<T>): Promise<IpcResult<T>> {
  return Promise.resolve()
    .then(fn)
    .then((data): IpcResult<T> => ({ ok: true, data }))
    .catch((err: unknown): IpcResult<T> => ({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }));
}

export function registerIpcHandlers(
  instances: InstanceService,
  repo: ServerRepository,
): void {
  ipcMain.handle(IPC.serversList, () => wrap(() => instances.list()));

  ipcMain.handle(IPC.serversCreate, (_e, input: ServerProfileInput) =>
    wrap(() => instances.create(input)),
  );

  ipcMain.handle(
    IPC.serversUpdate,
    (_e, id: string, input: ServerProfileInput) =>
      wrap(() => instances.update(id, input)),
  );

  ipcMain.handle(IPC.serversDelete, (_e, id: string) =>
    wrap(() => instances.delete(id)),
  );

  ipcMain.handle(IPC.serversClone, (_e, id: string) =>
    wrap(() => instances.clone(id)),
  );

  ipcMain.handle(IPC.serversStart, (_e, id: string) =>
    wrap(() => instances.start(id)),
  );

  ipcMain.handle(IPC.serversStop, (_e, id: string) =>
    wrap(() => instances.stop(id)),
  );

  ipcMain.handle(IPC.serversKill, (_e, id: string) =>
    wrap(() => instances.kill(id)),
  );

  ipcMain.handle(IPC.serversStatuses, () =>
    wrap(() => instances.statuses()),
  );

  ipcMain.handle(IPC.clusterCheck, () =>
    wrap(() => instances.checkClusters()),
  );

  ipcMain.handle(IPC.rconCommand, (_e, id: string, command: string) =>
    wrap(() => instances.sendRcon(id, command)),
  );

  ipcMain.handle(IPC.eventsRecent, (_e, limit: number) =>
    wrap(() => repo.recentEvents(limit)),
  );
}
