import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import { IPC, type IpcResult, type PickPathKind } from "../shared/ipc";
import type { ServerIniPayload, ServerProfileInput, StartServerOptions } from "../shared/types";
import type { InstanceService } from "../backend/domains/instances/instance-service";
import type { IniService } from "../backend/domains/config/ini-service";
import type { LogsService } from "../backend/domains/logs/logs-service";
import type { UpdateService } from "../backend/domains/updates/update-service";
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

function fileStamp(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

export function registerIpcHandlers(
  instances: InstanceService,
  repo: ServerRepository,
  ini: IniService,
  logs: LogsService,
  updates: UpdateService,
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

  ipcMain.handle(IPC.serversStart, (_e, id: string, options?: StartServerOptions) =>
    wrap(() => instances.start(id, options)),
  );

  ipcMain.handle(IPC.serversStop, (_e, id: string) =>
    wrap(() => instances.stop(id)),
  );

  ipcMain.handle(IPC.serversKill, (_e, id: string) =>
    wrap(() => instances.kill(id)),
  );

  ipcMain.handle(IPC.serversInstallFiles, (_e, id: string) =>
    wrap(() => updates.installServerFiles(id)),
  );

  ipcMain.handle(IPC.serversUpdateNow, (_e, id: string) =>
    wrap(() => updates.updateServer(id)),
  );

  ipcMain.handle(IPC.serversOpenFolder, (_e, id: string) =>
    wrap(async () => {
      const folderPath = instances.installDirFor(id);
      const error = await shell.openPath(folderPath);
      if (error.length > 0) {
        throw new Error(`No se pudo abrir la carpeta: ${error}`);
      }
    }),
  );

  ipcMain.handle(IPC.steamcmdInstall, () =>
    wrap(() => updates.installSteamCmd()),
  );

  ipcMain.handle(IPC.steamcmdStatus, () =>
    wrap(() => updates.getSteamCmdStatus()),
  );

  ipcMain.handle(IPC.steamcmdConsole, (_e, limit?: number) =>
    wrap(() => updates.getSteamCmdConsole(limit)),
  );

  ipcMain.handle(IPC.serversStatuses, () =>
    wrap(() => instances.statuses()),
  );

  ipcMain.handle(IPC.serversInstallation, () =>
    wrap(() => instances.installationInfo()),
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

  ipcMain.handle(
    IPC.pickPath,
    (_e, kind: PickPathKind, defaultPath?: string, title?: string) =>
      wrap(async () => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        const options: OpenDialogOptions = {
          title,
          defaultPath,
          properties: [kind === "directory" ? "openDirectory" : "openFile"],
        };
        const result =
          win !== undefined
            ? await dialog.showOpenDialog(win, options)
            : await dialog.showOpenDialog(options);
        if (result.canceled || result.filePaths.length === 0) {
          return null;
        }
        return result.filePaths[0] ?? null;
      }),
  );

  ipcMain.handle(IPC.iniRead, (_e, serverId: string) =>
    wrap(() => ini.readServerIni(serverId)),
  );

  ipcMain.handle(
    IPC.iniPreview,
    (_e, serverId: string, payload: ServerIniPayload) =>
      wrap(() => ini.previewServerIni(serverId, payload)),
  );

  ipcMain.handle(
    IPC.iniSave,
    (_e, serverId: string, payload: ServerIniPayload) =>
      wrap(() => ini.saveServerIni(serverId, payload)),
  );

  ipcMain.handle(IPC.logsList, (_e, serverId: string) =>
    wrap(() => logs.listServerLogs(serverId)),
  );

  ipcMain.handle(
    IPC.logsReadUpdate,
    (_e, serverId: string, fileName: string, maxBytes?: number) =>
      wrap(() => logs.readUpdateLog(serverId, fileName, maxBytes)),
  );

  ipcMain.handle(IPC.logsExport, (_e, serverId: string) =>
    wrap(async () => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const options: SaveDialogOptions = {
        title: "Exportar logs operativos",
        defaultPath: `${serverId}-logs-${fileStamp()}.txt`,
        filters: [{ name: "Texto", extensions: ["txt", "log"] }],
      };
      const result =
        win !== undefined
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
      if (result.canceled || result.filePath === undefined) {
        return null;
      }
      return logs.exportServerLogs(serverId, result.filePath);
    }),
  );
}
