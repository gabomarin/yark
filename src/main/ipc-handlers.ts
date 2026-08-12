import { BrowserWindow, dialog, shell, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { IPC } from "../shared/ipc";
import { ipcArgSchemas } from "../shared/ipc/channel-schemas";
import { canonicalCurseForgeAsaModUrl } from "../shared/curseforge-url";
import type {
  ServerProfileInput,
  ServerProfilePatch,
} from "../shared/types";
import type { BackupService } from "../backend/domains/backups/backup-service";
import type { PlayerSessionWatcher } from "../backend/domains/backups/player-session-watcher";
import type { InstanceService } from "../backend/domains/instances/instance-service";
import { probeImportInstall } from "../backend/domains/instances/import-existing-install";
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
import { handleValidated } from "./ipc-validate";

export interface AppDataFolderRoots {
  app: string;
  backups: string;
  updateLogs: string;
  steamcmd: string;
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
  handleValidated(IPC.serversList, ipcArgSchemas[IPC.serversList], () => instances.list());

  handleValidated(IPC.serversCreate, ipcArgSchemas[IPC.serversCreate], async ([input]) => {
    const profileInput = input as ServerProfileInput;
    const enriched = await mods.enrichNewServerMods(profileInput, { mods: [] });
    return instances.create(enriched);
  });

  handleValidated(IPC.serversUpdate, ipcArgSchemas[IPC.serversUpdate], async ([id, input]) =>
    instances.withProfileWrite(id, async () => {
      const existing = repo.get(id);
      if (existing === null) throw new Error("Server does not exist");
      const profileInput = input as ServerProfileInput;
      const enriched = await mods.enrichNewServerMods(profileInput, {
        mods: existing.mods,
        disabledMods: existing.disabledMods,
        modMetadataCache: existing.modMetadataCache,
      });
      return instances.update(id, enriched);
    }),
  );

  handleValidated(
    IPC.serversUpdatePatch,
    ipcArgSchemas[IPC.serversUpdatePatch],
    async ([id, patch]) => {
      const typedPatch = patch as ServerProfilePatch;
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
    },
  );

  handleValidated(IPC.serversSetEnabled, ipcArgSchemas[IPC.serversSetEnabled], ([id, enabled]) =>
    instances.setServerEnabled(id, enabled),
  );

  handleValidated(
    IPC.serversDelete,
    ipcArgSchemas[IPC.serversDelete],
    ([id, options]) => instances.delete(id, options),
  );

  handleValidated(IPC.serversClone, ipcArgSchemas[IPC.serversClone], ([id]) =>
    instances.clone(id),
  );

  handleValidated(
    IPC.serversCloneWithParams,
    ipcArgSchemas[IPC.serversCloneWithParams],
    ([id, params]) => instances.cloneWithParams(id, params),
  );

  handleValidated(IPC.serversProbeImport, ipcArgSchemas[IPC.serversProbeImport], ([installDir]) =>
    probeImportInstall(
      installDir,
      instances.list().map((profile) => ({
        name: profile.name,
        installDir: profile.installDir,
      })),
    ),
  );

  handleValidated(
    IPC.serversImportExisting,
    ipcArgSchemas[IPC.serversImportExisting],
    async ([input, options]) => {
      const profileInput = input as ServerProfileInput;
      const modsList = profileInput.mods ?? [];
      // Soft CurseForge resolve: keep all disk-discovered IDs even when some
      // names are missing; do not fail import on proxy gaps (#254).
      // Product rule: import always leaves discovered mods disabled (service enforces too).
      const disabled = [...modsList];
      const cache = { ...(profileInput.modMetadataCache ?? {}) };
      try {
        const fetched = await mods.getMods(modsList);
        for (const row of fetched) {
          cache[row.id] = row;
        }
      } catch {
        // Keep client-side cache / empty names; import still proceeds.
      }
      const enriched = await mods.enrichNewServerMods(
        {
          ...profileInput,
          mods: modsList,
          disabledMods: disabled,
          modMetadataCache: cache,
        },
        {
          mods: modsList,
          disabledMods: disabled,
          modMetadataCache: cache,
        },
      );
      return instances.importExisting(enriched, options ?? undefined);
    },
  );

  handleValidated(IPC.serversStart, ipcArgSchemas[IPC.serversStart], ([id, options]) =>
    instances.start(id, options ?? undefined),
  );

  handleValidated(IPC.serversStop, ipcArgSchemas[IPC.serversStop], ([id]) =>
    instances.stop(id),
  );

  handleValidated(IPC.serversRestart, ipcArgSchemas[IPC.serversRestart], ([id, options]) =>
    instances.restart(id, options ?? undefined),
  );

  handleValidated(IPC.serversKill, ipcArgSchemas[IPC.serversKill], ([id]) =>
    instances.kill(id),
  );

  handleValidated(IPC.serversInstallFiles, ipcArgSchemas[IPC.serversInstallFiles], ([id]) =>
    updates.installServerFiles(id),
  );

  handleValidated(IPC.serversUpdateNow, ipcArgSchemas[IPC.serversUpdateNow], ([id]) =>
    updates.updateServer(id),
  );

  handleValidated(IPC.serversVerifyFiles, ipcArgSchemas[IPC.serversVerifyFiles], ([id]) =>
    updates.verifyServerFiles(id),
  );

  handleValidated(
    IPC.serversMoveInstall,
    ipcArgSchemas[IPC.serversMoveInstall],
    async ([id, destinationDir]) => {
      const result = await moveInstall.moveInstall(id, destinationDir);
      return {
        sourceDir: result.sourceDir,
        destinationDir: result.destinationDir,
        oldSourceDir: result.oldSourceDir,
        oldSourceRemoved: result.oldSourceRemoved,
        cleanupError: result.cleanupError,
      };
    },
  );

  handleValidated(IPC.serversMoveInstallCancel, ipcArgSchemas[IPC.serversMoveInstallCancel], () =>
    moveInstall.cancel(),
  );

  handleValidated(
    IPC.serversMoveInstallCleanup,
    ipcArgSchemas[IPC.serversMoveInstallCleanup],
    async ([id, oldSourceDir]) => {
      await moveInstall.cleanupOldSource(id, oldSourceDir);
    },
  );

  handleValidated(
    IPC.serversMoveInstallDismissCleanup,
    ipcArgSchemas[IPC.serversMoveInstallDismissCleanup],
    async ([id]) => {
      await moveInstall.dismissCleanupPrompt(id);
    },
  );

  handleValidated(IPC.serversOpenFolder, ipcArgSchemas[IPC.serversOpenFolder], async ([id]) => {
    const folderPath = instances.installDirFor(id);
    const error = await shell.openPath(folderPath);
    if (error.length > 0) {
      throw new Error(`Could not open folder: ${error}`);
    }
  });

  handleValidated(
    IPC.serversOpenNativeTerminal,
    ipcArgSchemas[IPC.serversOpenNativeTerminal],
    ([id]) => {
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
    },
  );

  handleValidated(IPC.steamcmdInstall, ipcArgSchemas[IPC.steamcmdInstall], () =>
    updates.installSteamCmd(),
  );

  handleValidated(IPC.steamcmdCancel, ipcArgSchemas[IPC.steamcmdCancel], () =>
    updates.cancelSteamCmd(),
  );

  handleValidated(IPC.criticalJobRetry, ipcArgSchemas[IPC.criticalJobRetry], ([id]) =>
    updates.retryCriticalJob(id),
  );

  handleValidated(IPC.criticalJobDismiss, ipcArgSchemas[IPC.criticalJobDismiss], ([id]) =>
    updates.dismissCriticalJob(id),
  );

  handleValidated(IPC.criticalJobCancel, ipcArgSchemas[IPC.criticalJobCancel], ([id]) =>
    updates.cancelCriticalJob(id),
  );

  handleValidated(IPC.steamcmdSetPath, ipcArgSchemas[IPC.steamcmdSetPath], ([path]) =>
    updates.setSteamCmdExecutablePath(path),
  );

  handleValidated(IPC.steamcmdStatus, ipcArgSchemas[IPC.steamcmdStatus], () =>
    updates.getSteamCmdStatus(),
  );

  handleValidated(IPC.steamcmdConsole, ipcArgSchemas[IPC.steamcmdConsole], ([limit]) =>
    updates.getSteamCmdConsole(limit ?? undefined),
  );

  handleValidated(IPC.steamcmdOpenCache, ipcArgSchemas[IPC.steamcmdOpenCache], async ([kind]) => {
    const targetPath = updates.resolveSteamCmdCachePath(kind);
    await mkdir(targetPath, { recursive: true });
    const error = await shell.openPath(targetPath);
    if (error) {
      throw new Error(`Could not open cache folder: ${error}`);
    }
  });

  handleValidated(IPC.steamcmdClearCache, ipcArgSchemas[IPC.steamcmdClearCache], ([kind]) =>
    updates.clearSteamCmdCache(kind),
  );

  handleValidated(IPC.serversStatuses, ipcArgSchemas[IPC.serversStatuses], () =>
    instances.statuses(),
  );

  handleValidated(
    IPC.serversInstallation,
    ipcArgSchemas[IPC.serversInstallation],
    ([forceOfficialCheck, serversMode]) =>
      instances.installationInfo(forceOfficialCheck === true, serversMode ?? true),
  );

  handleValidated(IPC.clusterCheck, ipcArgSchemas[IPC.clusterCheck], () =>
    instances.checkClusters(),
  );

  handleValidated(IPC.rconCommand, ipcArgSchemas[IPC.rconCommand], ([id, command]) =>
    instances.sendRcon(id, command),
  );

  handleValidated(IPC.rconRetryConnection, ipcArgSchemas[IPC.rconRetryConnection], ([id]) =>
    instances.retryRconConnection(id),
  );

  handleValidated(IPC.rconGetStatus, ipcArgSchemas[IPC.rconGetStatus], ([id]) =>
    instances.getRconStatus(id),
  );

  handleValidated(IPC.rconGetAllStatus, ipcArgSchemas[IPC.rconGetAllStatus], () =>
    instances.getAllRconStatus(),
  );

  handleValidated(
    IPC.rconTabFocusChanged,
    ipcArgSchemas[IPC.rconTabFocusChanged],
    async ([serverId, isFocused]) => {
      if (!isFocused) {
        return playerSessionWatcher.getOnlinePlayers(serverId);
      }
      return playerSessionWatcher.refreshServer(serverId);
    },
  );

  handleValidated(IPC.refreshPlayerList, ipcArgSchemas[IPC.refreshPlayerList], ([serverId]) =>
    playerSessionWatcher.refreshServer(serverId),
  );

  handleValidated(IPC.kickPlayer, ipcArgSchemas[IPC.kickPlayer], async ([serverId, playerKey]) => {
    const response = await instances.kickPlayer(serverId, playerKey);
    await playerSessionWatcher.refreshServer(serverId);
    return response;
  });

  handleValidated(IPC.banPlayer, ipcArgSchemas[IPC.banPlayer], async ([serverId, playerKey]) => {
    const response = await instances.banPlayer(serverId, playerKey);
    await playerSessionWatcher.refreshServer(serverId);
    return response;
  });

  handleValidated(IPC.listBannedPlayers, ipcArgSchemas[IPC.listBannedPlayers], async ([serverId]) => {
    const entries = await instances.listBannedPlayers(serverId);
    return entries.map((entry) => ({ key: entry.id, name: entry.name }));
  });

  handleValidated(IPC.unbanPlayer, ipcArgSchemas[IPC.unbanPlayer], async ([serverId, playerKey]) => {
    const result = await instances.unbanPlayer(serverId, playerKey);
    return {
      banned: result.banned.map((entry) => ({
        key: entry.id,
        name: entry.name,
      })),
      warning: result.warning,
    };
  });

  handleValidated(IPC.openBanListFile, ipcArgSchemas[IPC.openBanListFile], async ([serverId]) => {
    const targetPath = await instances.resolveBanListFilePath(serverId);
    const error = await shell.openPath(targetPath);
    if (error.length > 0) {
      throw new Error(`Could not open BanList.txt: ${error}`);
    }
  });

  handleValidated(IPC.eventsRecent, ipcArgSchemas[IPC.eventsRecent], ([limit]) =>
    repo.recentEvents(limit),
  );

  handleValidated(
    IPC.pickPath,
    ipcArgSchemas[IPC.pickPath],
    async ([kind, defaultPath, title]) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const defaultPathArg = defaultPath ?? undefined;
      const titleArg = title ?? undefined;
      if (kind === "save") {
        const saveOptions: SaveDialogOptions = {
          title: titleArg,
          defaultPath: defaultPathArg,
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
        title: titleArg,
        defaultPath: defaultPathArg,
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
    },
  );

  handleValidated(IPC.appListDataFolders, ipcArgSchemas[IPC.appListDataFolders], () => [
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
  ]);

  handleValidated(IPC.appOpenDataFolder, ipcArgSchemas[IPC.appOpenDataFolder], async ([kind]) => {
    const targetPath = appDataFolders[kind];
    await mkdir(targetPath, { recursive: true });
    const error = await shell.openPath(targetPath);
    if (error.length > 0) {
      throw new Error(`Could not open folder: ${error}`);
    }
  });

  handleValidated(IPC.appGetUiDensity, ipcArgSchemas[IPC.appGetUiDensity], (): UiDensity | null => {
    const raw = settings.get(UI_DENSITY_SETTING_KEY);
    if (raw === null || !isUiDensity(raw)) {
      return null;
    }
    return raw;
  });

  handleValidated(IPC.appSetUiDensity, ipcArgSchemas[IPC.appSetUiDensity], ([density]): UiDensity => {
    settings.set(UI_DENSITY_SETTING_KEY, density);
    return density;
  });

  handleValidated(
    IPC.appGetDesktopShellPreferences,
    ipcArgSchemas[IPC.appGetDesktopShellPreferences],
    (): DesktopShellPreferences => readDesktopShellPreferences(settings),
  );

  handleValidated(
    IPC.appSetCloseWindowToTray,
    ipcArgSchemas[IPC.appSetCloseWindowToTray],
    ([enabled]): boolean => setCloseWindowToTray(settings, enabled),
  );

  handleValidated(
    IPC.appSetStartWithWindows,
    ipcArgSchemas[IPC.appSetStartWithWindows],
    ([enabled]): boolean => {
      const next = setStartWithWindowsPreference(settings, enabled);
      try {
        applyWindowsLoginItem(next);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not update Windows startup registration: ${detail}`);
      }
      return next;
    },
  );

  handleValidated(
    IPC.appSetTrayCloseHintDismissed,
    ipcArgSchemas[IPC.appSetTrayCloseHintDismissed],
    ([dismissed]): boolean => setTrayCloseHintDismissed(settings, dismissed),
  );

  handleValidated(IPC.iniRead, ipcArgSchemas[IPC.iniRead], ([serverId]) =>
    ini.readServerIni(serverId),
  );

  handleValidated(IPC.iniOpenInEditor, ipcArgSchemas[IPC.iniOpenInEditor], async ([serverId, fileKey]) => {
    const snapshot = await ini.readServerIni(serverId);
    const targetPath =
      fileKey === "gameUserSettings"
        ? snapshot.gameUserSettingsPath
        : snapshot.gameIniPath;
    const error = await shell.openPath(targetPath);
    if (error.length > 0) {
      throw new Error(`Could not open INI file: ${error}`);
    }
  });

  handleValidated(IPC.iniPreview, ipcArgSchemas[IPC.iniPreview], ([serverId, payload]) =>
    ini.previewServerIni(serverId, payload),
  );

  handleValidated(IPC.iniSave, ipcArgSchemas[IPC.iniSave], async ([serverId, payload]) => {
    const preview = await ini.saveServerIni(serverId, payload);
    // Best-effort automatic INI snapshot after a successful user save.
    void backups.createIniSaveBackup(serverId).catch(() => undefined);
    return preview;
  });

  handleValidated(IPC.clusterIniGet, ipcArgSchemas[IPC.clusterIniGet], ([clusterId]) =>
    clusterIni.get(clusterId),
  );

  handleValidated(IPC.clusterIniGetOrDraft, ipcArgSchemas[IPC.clusterIniGetOrDraft], ([clusterId]) =>
    clusterIni.getOrDraft(clusterId),
  );

  handleValidated(IPC.clusterIniPreview, ipcArgSchemas[IPC.clusterIniPreview], ([clusterId, payload]) =>
    clusterIni.preview(clusterId, payload),
  );

  handleValidated(IPC.clusterIniSave, ipcArgSchemas[IPC.clusterIniSave], ([clusterId, payload]) =>
    clusterIni.save(clusterId, payload),
  );

  handleValidated(IPC.clusterIniDelete, ipcArgSchemas[IPC.clusterIniDelete], ([clusterId]) =>
    clusterIni.delete(clusterId),
  );

  handleValidated(
    IPC.clusterIniPreviewRestore,
    ipcArgSchemas[IPC.clusterIniPreviewRestore],
    ([clusterId, serverId, files]) =>
      clusterIniApply.previewRestore(clusterId, serverId, files ?? undefined),
  );

  handleValidated(
    IPC.clusterIniPreviewPromote,
    ipcArgSchemas[IPC.clusterIniPreviewPromote],
    ([clusterId, serverId, files]) =>
      clusterIniApply.previewPromote(clusterId, serverId, files ?? undefined),
  );

  handleValidated(
    IPC.clusterIniPreviewSeed,
    ipcArgSchemas[IPC.clusterIniPreviewSeed],
    ([clusterId, serverId, files]) =>
      clusterIniApply.previewSeed(clusterId, serverId, files ?? undefined),
  );

  handleValidated(
    IPC.clusterIniRestore,
    ipcArgSchemas[IPC.clusterIniRestore],
    ([clusterId, serverId, files]) =>
      clusterIniApply.restore(clusterId, serverId, files ?? undefined),
  );

  handleValidated(
    IPC.clusterIniPromote,
    ipcArgSchemas[IPC.clusterIniPromote],
    ([clusterId, serverId, files]) =>
      clusterIniApply.promote(clusterId, serverId, files ?? undefined),
  );

  handleValidated(
    IPC.clusterIniSeed,
    ipcArgSchemas[IPC.clusterIniSeed],
    ([clusterId, serverId, files]) =>
      clusterIniApply.seed(clusterId, serverId, files ?? undefined),
  );

  handleValidated(IPC.configTransferDescribe, ipcArgSchemas[IPC.configTransferDescribe], ([sourceId]) =>
    configTransfer.describeSource(sourceId),
  );

  handleValidated(
    IPC.configTransferPreview,
    ipcArgSchemas[IPC.configTransferPreview],
    ([sourceId, targetId, selection]) =>
      configTransfer.preview(sourceId, targetId, selection),
  );

  handleValidated(
    IPC.configTransferCommit,
    ipcArgSchemas[IPC.configTransferCommit],
    ([sourceId, targetId, selection, fingerprint]) =>
      configTransfer.commit(sourceId, targetId, selection, fingerprint),
  );

  handleValidated(IPC.logsList, ipcArgSchemas[IPC.logsList], ([serverId]) =>
    logs.listServerLogs(serverId),
  );

  handleValidated(IPC.logsRuntime, ipcArgSchemas[IPC.logsRuntime], ([serverId, limit]) =>
    logs.getRuntimeLogSnapshot(serverId, limit ?? undefined),
  );

  handleValidated(
    IPC.logsReadUpdate,
    ipcArgSchemas[IPC.logsReadUpdate],
    ([serverId, fileName, maxBytes]) =>
      logs.readUpdateLog(serverId, fileName, maxBytes ?? undefined),
  );

  handleValidated(IPC.logsExport, ipcArgSchemas[IPC.logsExport], async ([serverId]) => {
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
  });

  handleValidated(
    IPC.logsOpenUpdateFile,
    ipcArgSchemas[IPC.logsOpenUpdateFile],
    async ([serverId, fileName]) => {
      const path = logs.resolveUpdateLogPath(serverId, fileName);
      const error = await shell.openPath(path);
      if (error.length > 0) {
        throw new Error(`Could not open log: ${error}`);
      }
    },
  );

  handleValidated(IPC.logsClearEvents, ipcArgSchemas[IPC.logsClearEvents], ([serverId]) =>
    logs.clearEvents(serverId),
  );

  handleValidated(IPC.logsClearRuntime, ipcArgSchemas[IPC.logsClearRuntime], ([serverId]) =>
    logs.clearRuntimeLog(serverId),
  );

  handleValidated(IPC.logsDeleteUpdate, ipcArgSchemas[IPC.logsDeleteUpdate], ([serverId, fileName]) =>
    logs.deleteUpdateLog(serverId, fileName),
  );

  handleValidated(IPC.logsClearUpdates, ipcArgSchemas[IPC.logsClearUpdates], ([serverId]) =>
    logs.clearUpdateLogs(serverId),
  );

  handleValidated(IPC.logsGetRetentionSettings, ipcArgSchemas[IPC.logsGetRetentionSettings], () =>
    logs.getRetentionSettings(),
  );

  handleValidated(
    IPC.logsSetRetentionSettings,
    ipcArgSchemas[IPC.logsSetRetentionSettings],
    ([nextSettings]) => logs.setRetentionSettings(nextSettings),
  );

  handleValidated(IPC.logsPreviewCleanup, ipcArgSchemas[IPC.logsPreviewCleanup], ([options]) =>
    logs.previewCleanup(options ?? {}),
  );

  handleValidated(IPC.logsRunCleanup, ipcArgSchemas[IPC.logsRunCleanup], ([options]) =>
    logs.runCleanup(options ?? {}),
  );

  handleValidated(IPC.modsGet, ipcArgSchemas[IPC.modsGet], ([modId, forceRefresh]) =>
    mods.getMod(modId, { forceRefresh: forceRefresh === true }),
  );

  handleValidated(IPC.modsGetMany, ipcArgSchemas[IPC.modsGetMany], ([modIds, forceRefresh]) =>
    mods.getMods(modIds, { forceRefresh: forceRefresh === true }),
  );

  handleValidated(IPC.modsSearch, ipcArgSchemas[IPC.modsSearch], ([query, options]) =>
    mods.search(query, options ?? undefined),
  );

  handleValidated(IPC.modsGetByReference, ipcArgSchemas[IPC.modsGetByReference], ([ref]) =>
    mods.getByReference(ref),
  );

  handleValidated(IPC.modsOpenCurseForge, ipcArgSchemas[IPC.modsOpenCurseForge], async ([url]) => {
    // Fail closed: only open a validated ASA CurseForge mod detail URL.
    await shell.openExternal(canonicalCurseForgeAsaModUrl(url));
  });

  handleValidated(IPC.backupsList, ipcArgSchemas[IPC.backupsList], ([serverId, limit]) =>
    backups.list(serverId, typeof limit === "number" ? limit : 50),
  );

  handleValidated(IPC.backupsCreate, ipcArgSchemas[IPC.backupsCreate], ([serverId, kinds]) => {
    if (instances.isStopInProgress(serverId)) {
      throw new Error("Server stop backup is already in progress");
    }
    return backups.createManualBackup(serverId, kinds ?? undefined);
  });

  handleValidated(IPC.backupsDelete, ipcArgSchemas[IPC.backupsDelete], ([serverId, backupIds]) => {
    if (instances.isStopInProgress(serverId)) {
      throw new Error("Cannot delete backups while stop backup is in progress");
    }
    return backups.deleteBackups(serverId, backupIds);
  });

  handleValidated(
    IPC.backupsDeleteFailed,
    ipcArgSchemas[IPC.backupsDeleteFailed],
    ([serverId, kind]) => {
      if (instances.isStopInProgress(serverId)) {
        throw new Error("Cannot delete backups while stop backup is in progress");
      }
      return backups.deleteFailedBackups(serverId, kind);
    },
  );

  handleValidated(
    IPC.backupsRestore,
    ipcArgSchemas[IPC.backupsRestore],
    ([serverId, backupId, options]) => {
      if (instances.isStopInProgress(serverId)) {
        throw new Error("Cannot restore while stop backup is in progress");
      }
      return backups.restoreBackup(serverId, backupId, options ?? undefined);
    },
  );

  handleValidated(IPC.backupsGetPolicy, ipcArgSchemas[IPC.backupsGetPolicy], ([serverId]) =>
    backups.getPolicy(serverId),
  );

  handleValidated(IPC.backupsSetPolicy, ipcArgSchemas[IPC.backupsSetPolicy], ([serverId, policy]) =>
    backups.setPolicy(serverId, policy),
  );

  handleValidated(IPC.backupsResolveRoot, ipcArgSchemas[IPC.backupsResolveRoot], ([serverId]) =>
    backups.resolveBackupRootDir(serverId),
  );

  handleValidated(
    IPC.backupsOpenFolder,
    ipcArgSchemas[IPC.backupsOpenFolder],
    async ([serverId, backupId]) => {
      const targetPath = backups.resolveBackupPath(serverId, backupId);
      const error = await shell.openPath(targetPath);
      if (error.length > 0) {
        throw new Error(`Could not open backup folder: ${error}`);
      }
    },
  );

  handleValidated(IPC.backupsOpenRoot, ipcArgSchemas[IPC.backupsOpenRoot], async ([serverId]) => {
    const root = backups.resolveBackupRootDir(serverId);
    await mkdir(root, { recursive: true });
    const error = await shell.openPath(root);
    if (error.length > 0) {
      throw new Error(`Could not open backup destination: ${error}`);
    }
  });

  handleValidated(
    IPC.backupsExport,
    ipcArgSchemas[IPC.backupsExport],
    ([serverId, backupId, destinationPath]) =>
      backups.exportBackup(serverId, backupId, destinationPath),
  );

  handleValidated(
    IPC.backupsImport,
    ipcArgSchemas[IPC.backupsImport],
    ([serverId, kind, sourcePath]) => {
      if (instances.isStopInProgress(serverId)) {
        throw new Error("Cannot import backups while stop backup is in progress");
      }
      return backups.importBackup(serverId, kind, sourcePath);
    },
  );

  handleValidated(IPC.backupsFleetSummary, ipcArgSchemas[IPC.backupsFleetSummary], () =>
    backups.getFleetSummary(),
  );

  handleValidated(
    IPC.backupsDismissFleetAlert,
    ipcArgSchemas[IPC.backupsDismissFleetAlert],
    ([alertId, fingerprint]) => {
      backups.dismissFleetAlert(alertId, fingerprint);
    },
  );

  handleValidated(
    IPC.backupsGetDiskAlertSettings,
    ipcArgSchemas[IPC.backupsGetDiskAlertSettings],
    () => backups.getDiskAlertSettings(),
  );

  handleValidated(
    IPC.backupsSetDiskAlertSettings,
    ipcArgSchemas[IPC.backupsSetDiskAlertSettings],
    ([nextSettings]) => backups.setDiskAlertSettings(nextSettings),
  );

  handleValidated(
    IPC.backupsPreviewCleanup,
    ipcArgSchemas[IPC.backupsPreviewCleanup],
    ([options]) => backups.previewCleanup(options),
  );

  handleValidated(IPC.backupsRunCleanup, ipcArgSchemas[IPC.backupsRunCleanup], ([options]) =>
    backups.runCleanup(options),
  );

  handleValidated(IPC.appGetUpdateStatus, ipcArgSchemas[IPC.appGetUpdateStatus], () =>
    appUpdate.getStatus(),
  );

  handleValidated(IPC.appCheckForUpdate, ipcArgSchemas[IPC.appCheckForUpdate], () =>
    appUpdate.checkForUpdate(),
  );

  handleValidated(IPC.appDownloadUpdate, ipcArgSchemas[IPC.appDownloadUpdate], () =>
    appUpdate.downloadUpdate(),
  );

  handleValidated(IPC.appInstallUpdate, ipcArgSchemas[IPC.appInstallUpdate], () =>
    appUpdate.installUpdate(),
  );

  handleValidated(IPC.appOpenYarkReleaseNotes, ipcArgSchemas[IPC.appOpenYarkReleaseNotes], () =>
    appUpdate.openReleaseNotes(),
  );
}
