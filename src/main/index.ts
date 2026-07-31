import { app, BrowserWindow, Notification, dialog, type Tray } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "../backend/infra/db/database";
import { AppSettingsRepository } from "../backend/infra/db/app-settings-repository";
import { BackupRepository } from "../backend/infra/db/backup-repository";
import { ServerRepository } from "../backend/infra/db/server-repository";
import { ProcessManager } from "../backend/infra/process/process-manager";
import { BackupService } from "../backend/domains/backups/backup-service";
import { BackupScheduler } from "../backend/domains/backups/backup-scheduler";
import { PlayerSessionWatcher } from "../backend/domains/backups/player-session-watcher";
import { IniService } from "../backend/domains/config/ini-service";
import { InstanceService } from "../backend/domains/instances/instance-service";
import { LogsService } from "../backend/domains/logs/logs-service";
import { UpdateService } from "../backend/domains/updates/update-service";
import { ModsService } from "../backend/domains/mods/mods-service";
import { InstanceLockManager } from "../backend/orchestration/instance-lock-manager";
import { registerIpcHandlers } from "./ipc-handlers";
import {
  applyTrayContextMenu,
  createAppTray,
  formatTrayServerStatus,
  showBrowserWindow,
  type AppTrayOptions,
} from "./app-tray";
import { readDesktopShellPreferences } from "./desktop-shell-settings";
import { applyWindowsLoginItem } from "./windows-login-item";
import { IPC_PUSH, type SteamCmdProgressPush, type ServerStopProgressPush } from "../shared/ipc";
import type { BackupChangedPush } from "../backend/domains/backups/backup-service";
import type { ServerRuntimeInfo } from "../shared/types";

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else if (process.platform === "win32") {
  // Required for Windows toast notifications to associate with this app.
  app.setAppUserModelId("com.yark.servermanager");
}

let mainWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    return;
  }
  const { webContents } = mainWindow;
  if (webContents.isDestroyed()) {
    return;
  }
  webContents.send(channel, payload);
}

/**
 * Resolve the Windows `BrowserWindow` / tray icon path.
 *
 * Packaging layout (electron-builder on Windows):
 * - `build.extraResources` copies `build/icon.ico` → `<resources>/icon.ico`
 *   beside the asar (not inside it), so packaged apps hit `process.resourcesPath` first.
 * - `build.win.icon` sets the `.exe` / installer icon separately; this helper is only
 *   for the live window chrome and tray.
 * - Dev / unpackaged: fall back to repo `build/icon.ico` via compiled `out/main`
 *   (`__dirname/../../build`) or `app.getAppPath()`.
 */
function resolveAppIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath, "icon.ico"),
    join(__dirname, "../../build/icon.ico"),
    join(app.getAppPath(), "build/icon.ico"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function createWindow(): BrowserWindow {
  const icon = resolveAppIcon();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "YARK server manager",
    backgroundColor: "#0c1427",
    ...(icon !== undefined ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  if (process.env["ELECTRON_RENDERER_URL"] !== undefined) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      mainWindow = createWindow();
    }
    showBrowserWindow(mainWindow);
  });

  void app.whenReady().then(() => {
    const userData = app.getPath("userData");
    const dbPath = join(userData, "yark-server-manager.db");
    const db = openDatabase(dbPath);
    const settings = new AppSettingsRepository(db);
    const repo = new ServerRepository(db);
    const backupRepo = new BackupRepository(db);
    const processManager = new ProcessManager();
    const locks = new InstanceLockManager();
    const backupService = new BackupService(
      repo,
      backupRepo,
      processManager,
      settings,
      join(userData, "backups"),
    );
    const instances = new InstanceService(repo, processManager, backupService, locks);
    const backupScheduler = new BackupScheduler(backupService);
    const playerSessionWatcher = new PlayerSessionWatcher(
      backupService,
      repo,
      processManager,
    );
    const iniService = new IniService(repo, locks);
    const logsService = new LogsService(
      repo,
      backupService,
      join(userData, "update-logs"),
      processManager,
    );
    const updateService = new UpdateService(
      repo,
      backupService,
      instances,
      processManager,
      locks,
      settings,
      join(userData, "update-logs"),
      join(userData, "steamcmd"),
    );
    const modsService = new ModsService({ settings });

    backupScheduler.start();
    playerSessionWatcher.start();
    applyWindowsLoginItem(readDesktopShellPreferences(settings).startWithWindows);

    registerIpcHandlers(
      instances,
      repo,
      iniService,
      logsService,
      updateService,
      modsService,
      backupService,
      {
        app: userData,
        backups: join(userData, "backups"),
        updateLogs: join(userData, "update-logs"),
        steamcmd: join(userData, "steamcmd"),
      },
      settings,
    );

    let allowQuit = false;
    /** True once a real quit is in progress (tray Quit, settle, etc.). */
    let isQuitting = false;
    let pendingQuit: Promise<void> | null = null;

    const requestAppQuit = (): void => {
      // Real quit path — still goes through before-quit (stop-all / settle).
      // #59 will layer Ask / Stop / Leave-running on this same entry point.
      // Must set isQuitting before app.quit() so window `close` does not
      // re-interpret the shutdown as “hide to tray”.
      isQuitting = true;
      app.quit();
    };

    const countActiveServers = (): number =>
      repo.list().filter((profile) => processManager.isActive(profile.id)).length;

    const trayOptions = (): AppTrayOptions => ({
      iconPath: resolveAppIcon(),
      onShow: () => showBrowserWindow(mainWindow),
      onQuit: requestAppQuit,
      getStatusLabel: () => formatTrayServerStatus(countActiveServers()),
    });

    const refreshTrayMenu = (): void => {
      if (appTray === null) {
        return;
      }
      applyTrayContextMenu(appTray, trayOptions());
    };

    let trayRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleTrayMenuRefresh = (): void => {
      if (trayRefreshTimer !== null) {
        return;
      }
      trayRefreshTimer = setTimeout(() => {
        trayRefreshTimer = null;
        refreshTrayMenu();
      }, 300);
    };

    const ensureTray = (): void => {
      if (appTray !== null) {
        scheduleTrayMenuRefresh();
        return;
      }
      appTray = createAppTray(trayOptions());
    };

    processManager.on("status", (info: ServerRuntimeInfo) => {
      sendToRenderer(IPC_PUSH.serverStatus, info);
      scheduleTrayMenuRefresh();
    });

    updateService.on("progress", (payload: SteamCmdProgressPush) => {
      sendToRenderer(IPC_PUSH.steamCmdProgress, payload);
    });

    instances.on("stop-progress", (payload: ServerStopProgressPush) => {
      sendToRenderer(IPC_PUSH.serverStopProgress, payload);
    });

    backupService.on("changed", (payload: BackupChangedPush) => {
      sendToRenderer(IPC_PUSH.backupsChanged, payload);
    });

    mainWindow = createWindow();
    ensureTray();

    const quitAfter = (work: Promise<unknown>): void => {
      if (pendingQuit !== null) return;
      isQuitting = true;
      pendingQuit = work
        .then(() => {
          allowQuit = true;
          app.quit();
        })
        .catch((error: unknown) => {
          pendingQuit = null;
          isQuitting = false;
          showBrowserWindow(mainWindow);
          void dialog.showMessageBox({
            type: "error",
            title: "Could not finish server stop",
            message: "YARK will remain open because the active stop did not finish safely.",
            detail: error instanceof Error ? error.message : String(error),
            buttons: ["OK"],
          });
        });
    };

    const notifyTrayHide = (): void => {
      if (!Notification.isSupported()) {
        return;
      }
      const notification = new Notification({
        title: "YARK",
        body: "Still running in the tray.",
        silent: true,
      });
      notification.on("click", () => {
        showBrowserWindow(mainWindow);
      });
      notification.show();
    };

    mainWindow.on("close", (event) => {
      if (allowQuit || isQuitting) {
        return;
      }

      if (instances.shouldBlockAppQuit()) {
        event.preventDefault();
        showBrowserWindow(mainWindow);
        void dialog.showMessageBox(mainWindow!, {
          type: "info",
          title: "Server operation in progress",
          message: "YARK will close after the active server operation finishes.",
          detail:
            "Keep the application open so stop/restart backup work can complete safely.",
          buttons: ["OK"],
        });
        quitAfter(instances.settleForAppQuit());
        return;
      }

      const { closeWindowToTray } = readDesktopShellPreferences(settings);
      if (closeWindowToTray) {
        event.preventDefault();
        mainWindow?.hide();
        ensureTray();
        notifyTrayHide();
      }
      // When close-to-tray is off, allow the window to destroy; window-all-closed
      // requests a real quit through before-quit (same path as tray Quit / #59).
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
      showBrowserWindow(mainWindow);
    });

    app.on("before-quit", (event) => {
      isQuitting = true;
      if (allowQuit) return;
      if (instances.shouldBlockAppQuit()) {
        event.preventDefault();
        showBrowserWindow(mainWindow);
        quitAfter(instances.settleForAppQuit());
        return;
      }
      // Cancel pending SteamCMD/sync on quit (without requiring a live UI).
      try {
        updateService.cancelSteamCmd();
      } catch {
        // Ignore: the app is shutting down.
      }
      const profiles = repo.list();
      const anyActive = profiles.some((p) => processManager.isActive(p.id));
      if (anyActive) {
        event.preventDefault();
        quitAfter(processManager.stopAll(profiles));
      }
    });

    app.on("will-quit", () => {
      backupScheduler.stop();
      playerSessionWatcher.stop();
      if (trayRefreshTimer !== null) {
        clearTimeout(trayRefreshTimer);
        trayRefreshTimer = null;
      }
      if (appTray !== null) {
        appTray.destroy();
        appTray = null;
      }
    });
  });

  app.on("window-all-closed", () => {
    // Close-to-tray hides the window (does not destroy it), so this does not fire.
    // Closing with close-to-tray off destroys the window and quits here.
    app.quit();
  });
}
