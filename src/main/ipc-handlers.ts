import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { IPC, type IpcResult, type PickPathKind, type AppDataFolderKind } from "../shared/ipc";
import { canonicalCurseForgeAsaModUrl } from "../shared/curseforge-url";
import type {
  ServerIniPayload,
  ServerProfileInput,
  ServerProfilePatch,
  StartServerOptions,
  SteamCmdCacheKind,
} from "../shared/types";
import { isServerProfilePatch } from "../shared/server-profile";
import type { BackupService } from "../backend/domains/backups/backup-service";
import type { PlayerSessionWatcher } from "../backend/domains/backups/player-session-watcher";
import type { InstanceService } from "../backend/domains/instances/instance-service";
import type { IniService } from "../backend/domains/config/ini-service";
import type { ClusterIniTemplateService } from "../backend/domains/config/cluster-ini-template-service";
import type { ClusterIniTemplateApplyService } from "../backend/domains/config/cluster-ini-template-apply-service";
import type { ConfigTransferService } from "../backend/domains/config/config-transfer-service";
import type { LogsService } from "../backend/domains/logs/logs-service";
import type { ModsService } from "../backend/domains/mods/mods-service";
import type { UpdateService } from "../backend/domains/updates/update-service";
import type { MoveInstallService } from "../backend/domains/instances/move-install-service";
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
  setTrayCloseHintDismissed,
} from "./desktop-shell-settings";
import { applyWindowsLoginItem } from "./windows-login-item";
import type { DesktopShellPreferences } from "../shared/desktop-shell";
import type { AppUpdateService } from "./app-update-service";

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
  clusterIni: ClusterIniTemplateService,
  clusterIniApply: ClusterIniTemplateApplyService,
  configTransfer: ConfigTransferService,
  logs: LogsService,
  updates: UpdateService,
  mods: ModsService,
  backups: BackupService,
  moveInstall: MoveInstallService,
  appDataFolders: AppDataFolderRoots,
  settings: AppSettingsRepository,
  playerSessionWatcher: PlayerSessionWatcher,
  appUpdate: AppUpdateService,
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
      wrap(async () =>
        instances.withProfileWrite(id, async () => {
          const existing = repo.get(id);
          if (existing === null) throw new Error("Server does not exist");
          const enriched = await mods.enrichNewServerMods(input, {
            mods: existing.mods,
            disabledMods: existing.disabledMods,
            modMetadataCache: existing.modMetadataCache,
          });
          return instances.update(id, enriched);
        }),
      ),
  );

  ipcMain.handle(
    IPC.serversUpdatePatch,
    (_e, id: string, patch: unknown) =>
      wrap(async () => {
        if (!isServerProfilePatch(patch)) {
          throw new Error("Invalid server profile patch");
        }
        const typedPatch: ServerProfilePatch = patch;
        return instances.updatePatch(id, typedPatch, async (merged, existing) => {
          if (typedPatch.group !== "mods") {
            return merged;
          }
          return mods.enrichNewServerMods(merged, {
            mods: existing.mods,
            disabledMods: existing.disabledMods,
            modMetadataCache: existing.modMetadataCache,
          });
        });
      }),
  );

  ipcMain.handle(IPC.serversSetEnabled, (_e, id: string, enabled: unknown) =>
    wrap(() => {
      if (typeof enabled !== "boolean") {
        throw new Error("enabled must be a boolean");
      }
      return instances.setServerEnabled(id, enabled);
    }),
  );

  ipcMain.handle(IPC.serversDelete, (_e, id: string) =>
    wrap(() => instances.delete(id)),
  );

  ipcMain.handle(IPC.serversClone, (_e, id: string) =>
    wrap(() => instances.clone(id)),
  );

  ipcMain.handle(IPC.serversCloneWithParams, (_e, id: string, params: unknown) =>
    wrap(() => {
      if (params === null || typeof params !== "object") {
        throw new Error("clone params must be an object");
      }
      const body = params as Record<string, unknown>;
      const { name, sessionName, gamePort, queryPort, rconPort, installDir } = body;
      if (typeof name !== "string" || typeof sessionName !== "string" || typeof installDir !== "string") {
        throw new Error("clone params name, sessionName, and installDir must be strings");
      }
      if (
        typeof gamePort !== "number" ||
        typeof queryPort !== "number" ||
        typeof rconPort !== "number" ||
        !Number.isInteger(gamePort) ||
        !Number.isInteger(queryPort) ||
        !Number.isInteger(rconPort)
      ) {
        throw new Error("clone params gamePort, queryPort, and rconPort must be integers");
      }
      return instances.cloneWithParams(id, {
        name,
        sessionName,
        gamePort,
        queryPort,
        rconPort,
        installDir,
      });
    }),
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

  ipcMain.handle(
    IPC.serversMoveInstall,
    (_e, id: string, destinationDir: string) =>
      wrap(async () => {
        if (typeof destinationDir !== "string" || destinationDir.trim().length === 0) {
          throw new Error("Destination directory is required");
        }
        const result = await moveInstall.moveInstall(id, destinationDir);
        return {
          sourceDir: result.sourceDir,
          destinationDir: result.destinationDir,
          oldSourceDir: result.oldSourceDir,
          oldSourceRemoved: result.oldSourceRemoved,
          cleanupError: result.cleanupError,
        };
      }),
  );

  ipcMain.handle(IPC.serversMoveInstallCancel, () =>
    wrap(() => moveInstall.cancel()),
  );

  ipcMain.handle(
    IPC.serversMoveInstallCleanup,
    (_e, id: string, oldSourceDir: string) =>
      wrap(async () => {
        if (typeof oldSourceDir !== "string" || oldSourceDir.trim().length === 0) {
          throw new Error("Old source directory is required");
        }
        await moveInstall.cleanupOldSource(id, oldSourceDir);
      }),
  );

  ipcMain.handle(IPC.serversMoveInstallDismissCleanup, (_e, id: string) =>
    wrap(async () => {
      await moveInstall.dismissCleanupPrompt(id);
    }),
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

  ipcMain.handle(IPC.criticalJobRetry, (_e, id: string) =>
    wrap(() => updates.retryCriticalJob(id)),
  );

  ipcMain.handle(IPC.criticalJobDismiss, (_e, id: string) =>
    wrap(() => updates.dismissCriticalJob(id)),
  );

  ipcMain.handle(IPC.criticalJobCancel, (_e, id: string) =>
    wrap(() => updates.cancelCriticalJob(id)),
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

  ipcMain.handle(
    IPC.serversInstallation,
    (
      _e,
      forceOfficialCheck?: boolean,
      serversMode?: import("@shared/types").InstallationServersMode,
    ) =>
      wrap(() =>
        instances.installationInfo(
          forceOfficialCheck === true,
          serversMode ?? true,
        ),
      ),
  );

  ipcMain.handle(IPC.clusterCheck, () =>
    wrap(() => instances.checkClusters()),
  );

  ipcMain.handle(IPC.rconCommand, (_e, id: string, command: string) =>
    wrap(() => instances.sendRcon(id, command)),
  );

  ipcMain.handle(IPC.rconRetryConnection, (_e, id: string) =>
    wrap(() => instances.retryRconConnection(id)),
  );

  ipcMain.handle(IPC.rconGetStatus, (_e, id: string) =>
    wrap(() => instances.getRconStatus(id)),
  );

  ipcMain.handle(IPC.rconGetAllStatus, () =>
    wrap(() => instances.getAllRconStatus()),
  );

  ipcMain.handle(
    IPC.rconTabFocusChanged,
    (_e, serverId: string, isFocused: boolean) =>
      wrap(async () => {
        if (!isFocused) {
          return playerSessionWatcher.getOnlinePlayers(serverId);
        }
        return playerSessionWatcher.refreshServer(serverId);
      }),
  );

  ipcMain.handle(IPC.refreshPlayerList, (_e, serverId: string) =>
    wrap(() => playerSessionWatcher.refreshServer(serverId)),
  );

  ipcMain.handle(IPC.kickPlayer, (_e, serverId: string, playerKey: string) =>
    wrap(async () => {
      const response = await instances.kickPlayer(serverId, playerKey);
      await playerSessionWatcher.refreshServer(serverId);
      return response;
    }),
  );

  ipcMain.handle(IPC.banPlayer, (_e, serverId: string, playerKey: string) =>
    wrap(async () => {
      const response = await instances.banPlayer(serverId, playerKey);
      await playerSessionWatcher.refreshServer(serverId);
      return response;
    }),
  );

  ipcMain.handle(IPC.listBannedPlayers, (_e, serverId: string) =>
    wrap(async () => {
      const entries = await instances.listBannedPlayers(serverId);
      return entries.map((entry) => ({ key: entry.id, name: entry.name }));
    }),
  );

  ipcMain.handle(IPC.unbanPlayer, (_e, serverId: string, playerKey: string) =>
    wrap(async () => {
      const result = await instances.unbanPlayer(serverId, playerKey);
      return {
        banned: result.banned.map((entry) => ({
          key: entry.id,
          name: entry.name,
        })),
        warning: result.warning,
      };
    }),
  );

  ipcMain.handle(IPC.openBanListFile, (_e, serverId: string) =>
    wrap(async () => {
      const targetPath = await instances.resolveBanListFilePath(serverId);
      const error = await shell.openPath(targetPath);
      if (error.length > 0) {
        throw new Error(`Could not open BanList.txt: ${error}`);
      }
    }),
  );

  ipcMain.handle(IPC.eventsRecent, (_e, limit: number) =>
    wrap(() => repo.recentEvents(limit)),
  );

  ipcMain.handle(
    IPC.pickPath,
    (_e, kind: PickPathKind, defaultPath?: string, title?: string) =>
      wrap(async () => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
        if (kind === "save") {
          const saveOptions: SaveDialogOptions = {
            title,
            defaultPath,
            filters: [{ name: "ZIP archives", extensions: ["zip"] }],
          };
          const result =
            win !== undefined
              ? await dialog.showSaveDialog(win, saveOptions)
              : await dialog.showSaveDialog(saveOptions);
          if (result.canceled || result.filePath === undefined || result.filePath.length === 0) {
            return null;
          }
          return result.filePath;
        }
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
      try {
        applyWindowsLoginItem(next);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not update Windows startup registration: ${detail}`);
      }
      return next;
    }),
  );

  ipcMain.handle(IPC.appSetTrayCloseHintDismissed, (_e, dismissed: boolean) =>
    wrap((): boolean => {
      if (typeof dismissed !== "boolean") {
        throw new Error("trayCloseHintDismissed must be a boolean");
      }
      return setTrayCloseHintDismissed(settings, dismissed);
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

  ipcMain.handle(IPC.clusterIniGet, (_e, clusterId: string) =>
    wrap(() => clusterIni.get(clusterId)),
  );

  ipcMain.handle(IPC.clusterIniGetOrDraft, (_e, clusterId: string) =>
    wrap(() => clusterIni.getOrDraft(clusterId)),
  );

  ipcMain.handle(
    IPC.clusterIniPreview,
    (_e, clusterId: string, payload: ServerIniPayload) =>
      wrap(() => clusterIni.preview(clusterId, payload)),
  );

  ipcMain.handle(
    IPC.clusterIniSave,
    (_e, clusterId: string, payload: ServerIniPayload) =>
      wrap(() => clusterIni.save(clusterId, payload)),
  );

  ipcMain.handle(IPC.clusterIniDelete, (_e, clusterId: string) =>
    wrap(() => clusterIni.delete(clusterId)),
  );

  ipcMain.handle(
    IPC.clusterIniPreviewRestore,
    (_e, clusterId: string, serverId: string, files?: unknown) =>
      wrap(() => clusterIniApply.previewRestore(clusterId, serverId, files)),
  );

  ipcMain.handle(
    IPC.clusterIniPreviewPromote,
    (_e, clusterId: string, serverId: string, files?: unknown) =>
      wrap(() => clusterIniApply.previewPromote(clusterId, serverId, files)),
  );

  ipcMain.handle(
    IPC.clusterIniPreviewSeed,
    (_e, clusterId: string, serverId: string, files?: unknown) =>
      wrap(() => clusterIniApply.previewSeed(clusterId, serverId, files)),
  );

  ipcMain.handle(
    IPC.clusterIniRestore,
    (_e, clusterId: string, serverId: string, files?: unknown) =>
      wrap(() => clusterIniApply.restore(clusterId, serverId, files)),
  );

  ipcMain.handle(
    IPC.clusterIniPromote,
    (_e, clusterId: string, serverId: string, files?: unknown) =>
      wrap(() => clusterIniApply.promote(clusterId, serverId, files)),
  );

  ipcMain.handle(
    IPC.clusterIniSeed,
    (_e, clusterId: string, serverId: string, files?: unknown) =>
      wrap(() => clusterIniApply.seed(clusterId, serverId, files)),
  );

  ipcMain.handle(IPC.configTransferDescribe, (_e, sourceId: string) =>
    wrap(() => configTransfer.describeSource(sourceId)),
  );

  ipcMain.handle(
    IPC.configTransferPreview,
    (_e, sourceId: string, targetId: string, selection: unknown) =>
      wrap(() => configTransfer.preview(sourceId, targetId, selection)),
  );

  ipcMain.handle(
    IPC.configTransferCommit,
    (
      _e,
      sourceId: string,
      targetId: string,
      selection: unknown,
      fingerprint: string,
    ) =>
      wrap(() =>
        configTransfer.commit(sourceId, targetId, selection, fingerprint),
      ),
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
        title: "Export operational logs",
        defaultPath: `${serverId}-logs-${fileStamp()}.txt`,
        filters: [{ name: "Text", extensions: ["txt", "log"] }],
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

  ipcMain.handle(IPC.logsGetRetentionSettings, () =>
    wrap(() => logs.getRetentionSettings()),
  );

  ipcMain.handle(IPC.logsSetRetentionSettings, (_e, settings) =>
    wrap(() => logs.setRetentionSettings(settings)),
  );

  ipcMain.handle(IPC.logsPreviewCleanup, (_e, options) =>
    wrap(() => logs.previewCleanup(options ?? {})),
  );

  ipcMain.handle(IPC.logsRunCleanup, (_e, options) =>
    wrap(() => logs.runCleanup(options ?? {})),
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

  ipcMain.handle(
    IPC.backupsExport,
    (_e, serverId: string, backupId: string, destinationPath: string) =>
      wrap(() => backups.exportBackup(serverId, backupId, destinationPath)),
  );

  ipcMain.handle(
    IPC.backupsImport,
    (_e, serverId: string, kind: BackupKind, sourcePath: string) =>
      wrap(() => {
        if (instances.isStopInProgress(serverId)) {
          throw new Error("Cannot import backups while stop backup is in progress");
        }
        return backups.importBackup(serverId, kind, sourcePath);
      }),
  );

  ipcMain.handle(IPC.backupsFleetSummary, () =>
    wrap(() => backups.getFleetSummary()),
  );

  ipcMain.handle(
    IPC.backupsDismissFleetAlert,
    (_e, alertId: string, fingerprint: string) =>
      wrap(() => {
        backups.dismissFleetAlert(alertId, fingerprint);
      }),
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

  ipcMain.handle(IPC.backupsRunCleanup, (_e, options: BackupCleanupOptions) =>
    wrap(() => backups.runCleanup(options)),
  );

  ipcMain.handle(IPC.appGetUpdateStatus, () =>
    wrap(() => appUpdate.getStatus()),
  );

  ipcMain.handle(IPC.appCheckForUpdate, () =>
    wrap(() => appUpdate.checkForUpdate()),
  );

  ipcMain.handle(IPC.appDownloadUpdate, () =>
    wrap(() => appUpdate.downloadUpdate()),
  );

  ipcMain.handle(IPC.appInstallUpdate, () =>
    wrap(() => appUpdate.installUpdate()),
  );

  ipcMain.handle(IPC.appOpenYarkReleaseNotes, () =>
    wrap(() => appUpdate.openReleaseNotes()),
  );
}
