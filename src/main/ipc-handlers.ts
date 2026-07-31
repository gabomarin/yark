import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { IPC, type IpcResult, type PickPathKind, type AppDataFolderKind } from "../shared/ipc";
import { canonicalCurseForgeAsaModUrl } from "../shared/curseforge-url";
import type { ServerIniPayload, ServerProfileInput, StartServerOptions, SteamCmdCacheKind } from "../shared/types";
import type { BackupService } from "../backend/domains/backups/backup-service";
import type { InstanceService } from "../backend/domains/instances/instance-service";
import type { IniService } from "../backend/domains/config/ini-service";
import type { LogsService } from "../backend/domains/logs/logs-service";
import type { ModsService } from "../backend/domains/mods/mods-service";
import type { UpdateService } from "../backend/domains/updates/update-service";
import type { AppSettingsRepository } from "../backend/infra/db/app-settings-repository";
import type { ServerRepository } from "../backend/infra/db/server-repository";
import type {
  BackupCleanupOptions,
  BackupDiskAlertSettings,
  BackupKind,
  BackupPolicy,
} from "../shared/types";
import { UI_DENSITY_SETTING_KEY, isUiDensity, type UiDensity } from "../shared/ui-density";
import {
  readDesktopShellPreferences,
  setCloseWindowToTray,
  setStartWithWindowsPreference,
} from "./desktop-shell-settings";
import { applyWindowsLoginItem } from "./windows-login-item";
import type { DesktopShellPreferences } from "../shared/desktop-shell";

export interface AppDataFolderRoots {
  app: string;
  backups: string;
  updateLogs: string;
  steamcmd: string;
}

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
  mods: ModsService,
  backups: BackupService,
  appDataFolders: AppDataFolderRoots,
  settings: AppSettingsRepository,
): void {
  ipcMain.handle(IPC.serversList, () => wrap(() => instances.list()));

  ipcMain.handle(IPC.serversCreate, (_e, input: ServerProfileInput) =>
    wrap(async () => {
      const enriched = await mods.enrichNewServerMods(input, { mods: [] });
      return instances.create(enriched);
    }),
  );

  ipcMain.handle(
    IPC.serversUpdate,
    (_e, id: string, input: ServerProfileInput) =>
      wrap(async () => {
        const existing = repo.get(id);
        if (existing === null) throw new Error("Server does not exist");
        const enriched = await mods.enrichNewServerMods(input, {
          mods: existing.mods,
          disabledMods: existing.disabledMods,
          modMetadataCache: existing.modMetadataCache,
        });
        return instances.update(id, enriched);
      }),
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

  ipcMain.handle(IPC.serversRestart, (_e, id: string, options?: StartServerOptions) =>
    wrap(() => instances.restart(id, options)),
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

  ipcMain.handle(IPC.serversVerifyFiles, (_e, id: string) =>
    wrap(() => updates.verifyServerFiles(id)),
  );

  ipcMain.handle(IPC.serversOpenFolder, (_e, id: string) =>
    wrap(async () => {
      const folderPath = instances.installDirFor(id);
      const error = await shell.openPath(folderPath);
      if (error.length > 0) {
        throw new Error(`Could not open folder: ${error}`);
      }
    }),
  );

  ipcMain.handle(IPC.serversOpenNativeTerminal, (_e, id: string) =>
    wrap(() => {
      const folderPath = instances.installDirFor(id);
      // Windows `start`: first quoted token is ALWAYS the window title — use "".
      // Pass one /c string + windowsVerbatimArguments so Node does not re-quote
      // paths with spaces (that produced "sintaxis de la etiqueta del volumen...").
      const windowTitle = `ARK-${id.slice(0, 8)}`;
      const quotedDir = `"${folderPath.replace(/"/g, "")}"`;
      const keepAlive =
        `title ${windowTitle}` +
        " && echo Server started from ARK Manager." +
        " && echo Live output is available under Logs / Runtime.";
      const payload = `start "" /D ${quotedDir} cmd.exe /k "${keepAlive}"`;
      const child = spawn("cmd.exe", ["/c", payload], {
        detached: true,
        windowsHide: false,
        stdio: "ignore",
        windowsVerbatimArguments: true,
      });
      child.unref();
    }),
  );

  ipcMain.handle(IPC.steamcmdInstall, () =>
    wrap(() => updates.installSteamCmd()),
  );

  ipcMain.handle(IPC.steamcmdCancel, () =>
    wrap(() => updates.cancelSteamCmd()),
  );

  ipcMain.handle(IPC.steamcmdSetPath, (_e, path: string) =>
    wrap(() => updates.setSteamCmdExecutablePath(path)),
  );

  ipcMain.handle(IPC.steamcmdStatus, () =>
    wrap(() => updates.getSteamCmdStatus()),
  );

  ipcMain.handle(IPC.steamcmdConsole, (_e, limit?: number) =>
    wrap(() => updates.getSteamCmdConsole(limit)),
  );

  ipcMain.handle(IPC.steamcmdOpenCache, (_e, kind: SteamCmdCacheKind) =>
    wrap(async () => {
      const targetPath = updates.resolveSteamCmdCachePath(kind);
      await mkdir(targetPath, { recursive: true });
      const error = await shell.openPath(targetPath);
      if (error) {
        throw new Error(`Could not open cache folder: ${error}`);
      }
    }),
  );

  ipcMain.handle(IPC.steamcmdClearCache, (_e, kind: SteamCmdCacheKind) =>
    wrap(() => updates.clearSteamCmdCache(kind)),
  );

  ipcMain.handle(IPC.serversStatuses, () =>
    wrap(() => instances.statuses()),
  );

  ipcMain.handle(IPC.serversInstallation, (_e, forceOfficialCheck?: boolean) =>
    wrap(() => instances.installationInfo(forceOfficialCheck === true)),
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

  ipcMain.handle(IPC.appListDataFolders, () =>
    wrap(() => [
      { kind: "app" as const, label: "App data", path: appDataFolders.app },
      { kind: "backups" as const, label: "Backups", path: appDataFolders.backups },
      {
        kind: "updateLogs" as const,
        label: "Update logs",
        path: appDataFolders.updateLogs,
      },
      {
        kind: "steamcmd" as const,
        label: "Bundled SteamCMD",
        path: appDataFolders.steamcmd,
      },
    ]),
  );

  ipcMain.handle(IPC.appOpenDataFolder, (_e, kind: AppDataFolderKind) =>
    wrap(async () => {
      const targetPath = appDataFolders[kind];
      if (targetPath === undefined) {
        throw new Error(`Unknown app data folder: ${String(kind)}`);
      }
      await mkdir(targetPath, { recursive: true });
      const error = await shell.openPath(targetPath);
      if (error.length > 0) {
        throw new Error(`Could not open folder: ${error}`);
      }
    }),
  );

  ipcMain.handle(IPC.appGetUiDensity, () =>
    wrap((): UiDensity | null => {
      const raw = settings.get(UI_DENSITY_SETTING_KEY);
      if (raw === null || !isUiDensity(raw)) {
        return null;
      }
      return raw;
    }),
  );

  ipcMain.handle(IPC.appSetUiDensity, (_e, density: UiDensity) =>
    wrap((): UiDensity => {
      if (!isUiDensity(density)) {
        throw new Error(`Invalid UI density: ${String(density)}`);
      }
      settings.set(UI_DENSITY_SETTING_KEY, density);
      return density;
    }),
  );

  ipcMain.handle(IPC.appGetDesktopShellPreferences, () =>
    wrap((): DesktopShellPreferences => readDesktopShellPreferences(settings)),
  );

  ipcMain.handle(IPC.appSetCloseWindowToTray, (_e, enabled: boolean) =>
    wrap((): boolean => {
      if (typeof enabled !== "boolean") {
        throw new Error("closeWindowToTray must be a boolean");
      }
      return setCloseWindowToTray(settings, enabled);
    }),
  );

  ipcMain.handle(IPC.appSetStartWithWindows, (_e, enabled: boolean) =>
    wrap((): boolean => {
      if (typeof enabled !== "boolean") {
        throw new Error("startWithWindows must be a boolean");
      }
      const next = setStartWithWindowsPreference(settings, enabled);
      applyWindowsLoginItem(next);
      return next;
    }),
  );

  ipcMain.handle(IPC.iniRead, (_e, serverId: string) =>
    wrap(() => ini.readServerIni(serverId)),
  );

  ipcMain.handle(
    IPC.iniOpenInEditor,
    (_e, serverId: string, fileKey: "gameUserSettings" | "game") =>
      wrap(async () => {
        const snapshot = await ini.readServerIni(serverId);
        const targetPath =
          fileKey === "gameUserSettings"
            ? snapshot.gameUserSettingsPath
            : snapshot.gameIniPath;
        const error = await shell.openPath(targetPath);
        if (error.length > 0) {
          throw new Error(`Could not open INI file: ${error}`);
        }
      }),
  );

  ipcMain.handle(
    IPC.iniPreview,
    (_e, serverId: string, payload: ServerIniPayload) =>
      wrap(() => ini.previewServerIni(serverId, payload)),
  );

  ipcMain.handle(
    IPC.iniSave,
    (_e, serverId: string, payload: ServerIniPayload) =>
      wrap(async () => {
        const preview = await ini.saveServerIni(serverId, payload);
        // Best-effort automatic INI snapshot after a successful user save.
        void backups.createIniSaveBackup(serverId).catch(() => undefined);
        return preview;
      }),
  );

  ipcMain.handle(IPC.logsList, (_e, serverId: string) =>
    wrap(() => logs.listServerLogs(serverId)),
  );

  ipcMain.handle(IPC.logsRuntime, (_e, serverId: string, limit?: number) =>
    wrap(() => logs.getRuntimeLogSnapshot(serverId, limit)),
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

  ipcMain.handle(
    IPC.logsOpenUpdateFile,
    (_e, serverId: string, fileName: string) =>
      wrap(async () => {
        const path = logs.resolveUpdateLogPath(serverId, fileName);
        const error = await shell.openPath(path);
        if (error.length > 0) {
          throw new Error(`Could not open log: ${error}`);
        }
      }),
  );

  ipcMain.handle(IPC.logsClearEvents, (_e, serverId: string) =>
    wrap(() => logs.clearEvents(serverId)),
  );

  ipcMain.handle(IPC.logsClearRuntime, (_e, serverId: string) =>
    wrap(() => logs.clearRuntimeLog(serverId)),
  );

  ipcMain.handle(
    IPC.logsDeleteUpdate,
    (_e, serverId: string, fileName: string) =>
      wrap(() => logs.deleteUpdateLog(serverId, fileName)),
  );

  ipcMain.handle(IPC.logsClearUpdates, (_e, serverId: string) =>
    wrap(() => logs.clearUpdateLogs(serverId)),
  );

  ipcMain.handle(IPC.modsGet, (_e, modId: string, forceRefresh?: boolean) =>
    wrap(() => mods.getMod(modId, { forceRefresh: forceRefresh === true })),
  );

  ipcMain.handle(IPC.modsGetMany, (_e, modIds: string[], forceRefresh?: boolean) =>
    wrap(() => mods.getMods(modIds, { forceRefresh: forceRefresh === true })),
  );

  ipcMain.handle(
    IPC.modsSearch,
    (_e, query: string, options?: { index?: number; pageSize?: number }) =>
      wrap(() => mods.search(query, options)),
  );

  ipcMain.handle(IPC.modsGetByReference, (_e, ref: string) =>
    wrap(() => mods.getByReference(ref)),
  );

  ipcMain.handle(IPC.modsOpenCurseForge, (_e, url: string) =>
    wrap(async () => {
      // Fail closed: only open a validated ASA CurseForge mod detail URL.
      await shell.openExternal(canonicalCurseForgeAsaModUrl(url));
    }),
  );

  ipcMain.handle(IPC.backupsList, (_e, serverId: string, limit?: number) =>
    wrap(() => backups.list(serverId, typeof limit === "number" ? limit : 50)),
  );

  ipcMain.handle(
    IPC.backupsCreate,
    (_e, serverId: string, kinds?: BackupKind[]) =>
      wrap(() => {
        if (instances.isStopInProgress(serverId)) {
          throw new Error("Server stop backup is already in progress");
        }
        return backups.createManualBackup(serverId, kinds);
      }),
  );

  ipcMain.handle(
    IPC.backupsDelete,
    (_e, serverId: string, backupIds: string[]) =>
      wrap(() => {
        if (instances.isStopInProgress(serverId)) {
          throw new Error("Cannot delete backups while stop backup is in progress");
        }
        return backups.deleteBackups(serverId, backupIds);
      }),
  );

  ipcMain.handle(IPC.backupsRestore, (_e, serverId: string, backupId: string) =>
    wrap(() => {
      if (instances.isStopInProgress(serverId)) {
        throw new Error("Cannot restore while stop backup is in progress");
      }
      return backups.restoreBackup(serverId, backupId);
    }),
  );

  ipcMain.handle(IPC.backupsGetPolicy, (_e, serverId: string) =>
    wrap(() => backups.getPolicy(serverId)),
  );

  ipcMain.handle(
    IPC.backupsSetPolicy,
    (
      _e,
      serverId: string,
      policy: Omit<BackupPolicy, "serverId" | "updatedAt">,
    ) => wrap(() => backups.setPolicy(serverId, policy)),
  );

  ipcMain.handle(IPC.backupsResolveRoot, (_e, serverId: string) =>
    wrap(() => backups.resolveBackupRootDir(serverId)),
  );

  ipcMain.handle(IPC.backupsOpenFolder, (_e, serverId: string, backupId: string) =>
    wrap(async () => {
      const targetPath = backups.resolveBackupPath(serverId, backupId);
      const error = await shell.openPath(targetPath);
      if (error.length > 0) {
        throw new Error(`Could not open backup folder: ${error}`);
      }
    }),
  );

  ipcMain.handle(IPC.backupsOpenRoot, (_e, serverId: string) =>
    wrap(async () => {
      const root = backups.resolveBackupRootDir(serverId);
      await mkdir(root, { recursive: true });
      const error = await shell.openPath(root);
      if (error.length > 0) {
        throw new Error(`Could not open backup destination: ${error}`);
      }
    }),
  );

  ipcMain.handle(IPC.backupsFleetSummary, () =>
    wrap(() => backups.getFleetSummary()),
  );

  ipcMain.handle(IPC.backupsGetDiskAlertSettings, () =>
    wrap(() => backups.getDiskAlertSettings()),
  );

  ipcMain.handle(
    IPC.backupsSetDiskAlertSettings,
    (_e, settings: BackupDiskAlertSettings) =>
      wrap(() => backups.setDiskAlertSettings(settings)),
  );

  ipcMain.handle(
    IPC.backupsPreviewCleanup,
    (_e, options: BackupCleanupOptions) =>
      wrap(() => backups.previewCleanup(options)),
  );

  ipcMain.handle(
    IPC.backupsRunCleanup,
    (_e, options: BackupCleanupOptions) =>
      wrap(() => backups.runCleanup(options)),
  );
}
