import { app, BrowserWindow, Menu, dialog, screen, shell, type Tray } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { AppSettingsRepository } from "../backend/infra/db/app-settings-repository";
import {
  createElectronDatabaseRecoveryUi,
  DatabaseRecoveryAbortedError,
  openDatabaseWithOperatorRecovery,
} from "./database-boot-recovery";
import { BackupRepository } from "../backend/infra/db/backup-repository";
import { ServerRepository } from "../backend/infra/db/server-repository";
import { ProcessManager } from "../backend/infra/process/process-manager";
import { BackupService } from "../backend/domains/backups/backup-service";
import { BackupScheduler } from "../backend/domains/backups/backup-scheduler";
import { MaintenanceScheduler } from "../backend/domains/maintenance/maintenance-scheduler";
import { MaintenanceService } from "../backend/domains/maintenance/maintenance-service";
import { MaintenanceRepository } from "../backend/infra/db/maintenance-repository";
import { PlayerSessionWatcher } from "../backend/domains/backups/player-session-watcher";
import { ProcessMetricsSampler } from "../backend/domains/instances/process-metrics-sampler";
import { IniService } from "../backend/domains/config/ini-service";
import { ClusterIniTemplateService } from "../backend/domains/config/cluster-ini-template-service";
import { ClusterIniTemplateApplyService } from "../backend/domains/config/cluster-ini-template-apply-service";
import { ConfigTransferService } from "../backend/domains/config/config-transfer-service";
import { ClusterIniTemplateRepository } from "../backend/infra/db/cluster-ini-template-repository";
import { InstanceService } from "../backend/domains/instances/instance-service";
import { runAutoStartOnLaunch } from "../backend/domains/instances/auto-start";
import {
  isFilesJobOperation,
  isOccupyingFilesJobStatus,
} from "../shared/files-job-priority";
import {
  OPEN_NATIVE_CONSOLE_SETTING_KEY,
  parseOpenNativeConsolePref,
} from "../shared/open-native-console";
import { LogsService } from "../backend/domains/logs/logs-service";
import { LogRetentionScheduler } from "../backend/domains/logs/log-retention-scheduler";
import { UpdateService } from "../backend/domains/updates/update-service";
import { MoveInstallService } from "../backend/domains/instances/move-install-service";
import { ModsService } from "../backend/domains/mods/mods-service";
import { InstanceLockManager } from "../backend/orchestration/instance-lock-manager";
import { AppUpdateService } from "./app-update-service";
import { attachDevToolsShortcuts, isDevToolsAllowed } from "./devtools";
import { collectKnownSecrets } from "../shared/credential-redaction";
import { registerIpcHandlers } from "./ipc-handlers";
import { setIpcDiagnosticKnownSecrets } from "./ipc-validate";
import {
  applyTrayContextMenu,
  createAppTray,
  formatTrayServerStatus,
  showBrowserWindow,
  type AppTrayOptions,
} from "./app-tray";
import { readDesktopShellPreferences } from "./desktop-shell-settings";
import { FleetOsNotifier, showNativeOsNotification } from "./os-notifications";
import { isAllowedExternalUrl } from "../shared/external-url-policy";
import {
  attachWindowStatePersistence,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  readStoredWindowState,
  resolveSplashPlacement,
  resolveWindowCreationOptions,
  type PersistedWindowState,
} from "./window-state";
import { peekStoredWindowState } from "./window-state-peek";
import {
  quitFlagsAfterCancel,
  shouldPreventCloseDuringQuit,
} from "./quit-gate";
import {
  removeLeftRunningProcess,
  upsertLeftRunningProcess,
} from "../backend/infra/process/left-running-store";
import { reattachLeftRunningProcesses } from "../backend/infra/process/left-running-reattach";
import { applyWindowsLoginItem } from "./windows-login-item";
import { APP_VERSION } from "../shared/app-version";
import {
  SPLASH_HEIGHT,
  SPLASH_MAX_MS,
  SPLASH_WIDTH,
  closeSplashWindow,
  createSplashWindow,
  remainingSplashHoldMs,
  shouldShowSplash,
} from "./splash-window";
import type {
  ServerCrashedNotifyPayload,
  SteamCmdJobTerminalPayload,
} from "../shared/os-notification-events";
import { IPC_PUSH, type SteamCmdProgressPush, type ServerStopProgressPush, type MoveInstallProgressPush, type CloneInstallProgressPush, type RconStatusChangedPush, type PlayerListUpdatedPush, type ProcessMetricsUpdatedPush } from "../shared/ipc";
import type { AppUpdateStatus } from "../shared/app-update";
import { normalizeCloneInstallProgress, normalizeServerStopProgress } from "../shared/types";
import type { BackupChangedPush } from "../backend/domains/backups/backup-service";
import type { ServerRuntimeInfo } from "../shared/types";

const e2eUserData = process.env["YARK_E2E_USER_DATA"]?.trim();
if (!app.isPackaged && e2eUserData) {
  // Functional Electron tests use a disposable profile so they never mutate the
  // developer's real %APPDATA% database, preferences, or browser storage.
  app.setPath("userData", e2eUserData);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else if (process.platform === "win32" && app.isPackaged) {
  // Must match electron-builder `appId` / Start Menu shortcut so Windows
  // associates the taskbar button (and toasts) with YARK's .exe icon.
  // Do not set this while unpackaged: an explicit AUMID makes Windows ignore
  // BrowserWindow `{ icon }` and fall back to electron.exe (Electron atom).
  app.setAppUserModelId("com.yark.servermanager");
}

let mainWindow: BrowserWindow | null = null;
let appTray: Tray | null = null;
/** Set once the main window exists; drained if second-instance fired during boot. */
let pendingSecondInstanceReveal = false;

if (gotSingleInstanceLock) {
  // Register early so a second launch during whenReady still focuses the UI.
  app.on("second-instance", () => {
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      showBrowserWindow(mainWindow);
      return;
    }
    pendingSecondInstanceReveal = true;
  });
}

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

function createWindow(
  settings: AppSettingsRepository,
  options?: {
    onReadyToShow?: (win: BrowserWindow) => boolean | void;
    /** Keep off-screen/taskbar until the caller shows it (startup splash). */
    hiddenUntilReveal?: boolean;
  },
): BrowserWindow {
  const icon = resolveAppIcon();
  const displays = screen.getAllDisplays().map((display) => display.workArea);
  const creation = resolveWindowCreationOptions(readStoredWindowState(settings), displays);
  const hiddenUntilReveal = options?.hiddenUntilReveal === true;
  const win = new BrowserWindow({
    width: creation.width,
    height: creation.height,
    ...(creation.x !== undefined && creation.y !== undefined
      ? { x: creation.x, y: creation.y }
      : {}),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    skipTaskbar: hiddenUntilReveal,
    focusable: !hiddenUntilReveal,
    title: "YARK server manager",
    backgroundColor: "#0c1427",
    ...(icon !== undefined ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDevToolsAllowed(),
    },
  });

  attachDevToolsShortcuts(win);

  // maximize() on a hidden window shows it on Windows — wait until `show`.
  if (creation.shouldMaximize) {
    win.once("show", () => {
      if (!win.isDestroyed() && !win.isMaximized()) {
        win.maximize();
      }
    });
  }
  win.once("ready-to-show", () => {
    const deferShow = options?.onReadyToShow?.(win) === false;
    if (!deferShow && !win.isDestroyed() && !win.isVisible()) {
      win.show();
    }
  });
  attachWindowStatePersistence(win, settings);

  // Reinforce window chrome / unpackaged taskbar icon (when no AUMID is set).
  if (icon !== undefined) {
    win.setIcon(icon);
  }

  // The renderer is local-only. Block in-app navigation / new BrowserWindows.
  // Allowlisted http(s) target=_blank links open in the OS browser (Mantine Anchor, etc.).
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
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
  void app.whenReady().then(async () => {
    // No native File/Edit/View/Help bar — Quit lives on the system tray menu.
    Menu.setApplicationMenu(null);

    let splash: BrowserWindow | null = null;
    let splashDismissed = false;
    let splashHoldTimer: ReturnType<typeof setTimeout> | null = null;
    let splashMaxTimer: ReturnType<typeof setTimeout> | null = null;
    let mainReadyToShow = false;
    let splashShownAt = 0;
    /**
     * Assigned after reattach (needs `instances` / SQLite). No-op until then.
     * Skips while splash is still up. Single-flight for the process lifetime
     * (`show` can fire again after hide-to-tray or an early splash-time show).
     */
    let notifyMainUiReadyForAutoStart = (): void => {};
    /** `show` is the trigger; call notify only when `show()` would be a no-op. */
    const showMainThenAutoStart = (win: BrowserWindow): void => {
      if (win.isDestroyed()) {
        return;
      }
      if (!win.isVisible()) {
        win.show();
        return;
      }
      notifyMainUiReadyForAutoStart();
    };
    const clearSplashTimers = (): void => {
      if (splashHoldTimer !== null) {
        clearTimeout(splashHoldTimer);
        splashHoldTimer = null;
      }
      if (splashMaxTimer !== null) {
        clearTimeout(splashMaxTimer);
        splashMaxTimer = null;
      }
    };
    const dismissSplash = (): void => {
      splashDismissed = true;
      clearSplashTimers();
      closeSplashWindow(splash);
      splash = null;
    };
    const revealMainAfterSplash = (): void => {
      const win = mainWindow;
      dismissSplash();
      if (win === null || win.isDestroyed()) {
        return;
      }
      win.setSkipTaskbar(false);
      win.setFocusable(true);
      showMainThenAutoStart(win);
      win.focus();
    };
    const scheduleSplashHandoff = (): void => {
      if (!mainReadyToShow || splashShownAt === 0) {
        return;
      }
      const remaining = remainingSplashHoldMs(splashShownAt, Date.now());
      if (splashHoldTimer !== null) {
        clearTimeout(splashHoldTimer);
      }
      splashHoldTimer = setTimeout(() => {
        splashHoldTimer = null;
        revealMainAfterSplash();
      }, remaining);
    };

    const userData = app.getPath("userData");
    const dbPath = join(userData, "yark-server-manager.db");
    const displayWorkAreas = (): Array<{ x: number; y: number; width: number; height: number }> =>
      screen.getAllDisplays().map((display) => display.workArea);
    const primaryDisplayCenter = (): { x: number; y: number } => {
      const area = screen.getPrimaryDisplay().workArea;
      return {
        x: area.x + Math.floor(area.width / 2),
        y: area.y + Math.floor(area.height / 2),
      };
    };
    const splashPositionForStored = (
      stored: PersistedWindowState | null,
    ): { x: number; y: number } => {
      const displays = displayWorkAreas();
      return resolveSplashPlacement(
        { width: SPLASH_WIDTH, height: SPLASH_HEIGHT },
        resolveWindowCreationOptions(stored, displays),
        displays,
        primaryDisplayCenter(),
      );
    };

    if (shouldShowSplash()) {
      try {
        const placement = splashPositionForStored(peekStoredWindowState(dbPath));
        splash = createSplashWindow({
          version: APP_VERSION,
          icon: resolveAppIcon(),
          x: placement.x,
          y: placement.y,
        });
        splash.once("show", () => {
          splashShownAt = Date.now();
          scheduleSplashHandoff();
        });
        splash.on("closed", () => {
          if (splashDismissed) {
            return;
          }
          if (mainWindow !== null && !mainWindow.isDestroyed()) {
            showMainThenAutoStart(mainWindow);
            return;
          }
          app.quit();
        });
        splashMaxTimer = setTimeout(() => {
          splashMaxTimer = null;
          revealMainAfterSplash();
        }, SPLASH_MAX_MS);
      } catch {
        splash = null;
      }
    }

    let db: DatabaseSync;
    try {
      db = await openDatabaseWithOperatorRecovery(
        dbPath,
        createElectronDatabaseRecoveryUi({
          showMessageBox: (options) => dialog.showMessageBox(options),
          showItemInFolder: (fullPath) => shell.showItemInFolder(fullPath),
          quitApp: () => {
            app.exit(1);
          },
        }),
      );
    } catch (error) {
      dismissSplash();
      if (error instanceof DatabaseRecoveryAbortedError) {
        return;
      }
      throw error;
    }
    const settings = new AppSettingsRepository(db);
    if (splash !== null && !splash.isDestroyed()) {
      const aligned = splashPositionForStored(readStoredWindowState(settings));
      splash.setPosition(aligned.x, aligned.y);
    }
    const repo = new ServerRepository(db);
    setIpcDiagnosticKnownSecrets(() => collectKnownSecrets(repo.list()));
    const backupRepo = new BackupRepository(db);
    const maintenanceRepo = new MaintenanceRepository(db);
    const processManager = new ProcessManager({
      onProcessCheckpoint: (record) => upsertLeftRunningProcess(settings, record),
      onProcessCheckpointCleared: (serverId) =>
        removeLeftRunningProcess(settings, serverId),
      knownSecrets: () => collectKnownSecrets(repo.list()),
    });
    const locks = new InstanceLockManager();
    const backupService = new BackupService(
      repo,
      backupRepo,
      processManager,
      settings,
      join(userData, "backups"),
    );
    const instances = new InstanceService(
      repo,
      processManager,
      backupService,
      locks,
    );
    const backupScheduler = new BackupScheduler(backupService);
    const logsService = new LogsService(
      repo,
      backupService,
      join(userData, "update-logs"),
      processManager,
      settings,
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
    const maintenanceService = new MaintenanceService(
      maintenanceRepo,
      repo,
      processManager,
      instances,
      updateService,
    );
    const maintenanceScheduler = new MaintenanceScheduler(maintenanceService);
    const playerSessionWatcher = new PlayerSessionWatcher(
      backupService,
      repo,
      processManager,
    );
    const processMetricsSampler = new ProcessMetricsSampler(processManager);
    const iniService = new IniService(repo, locks);
    const clusterIniRepo = new ClusterIniTemplateRepository(db);
    const clusterIniService = new ClusterIniTemplateService(clusterIniRepo);
    const clusterIniApplyService = new ClusterIniTemplateApplyService(
      clusterIniRepo,
      repo,
      iniService,
      locks,
      backupService,
      processManager,
    );
    const configTransferService = new ConfigTransferService(
      repo,
      instances,
      iniService,
      locks,
      backupService,
      processManager,
    );
    const moveInstallService = new MoveInstallService(
      repo,
      instances,
      processManager,
      backupService,
      locks,
      join(userData, "move-install-staging.json"),
      join(userData, "move-install-pending-cleanup.json"),
    );
    const modsService = new ModsService();

    // Unify RCON traffic on the persistent session (stop / ListPlayers / console).
    processManager.setRconExecutor((serverId, command) =>
      instances.execRcon(serverId, command, { recordEvent: false }),
    );
    playerSessionWatcher.setListPlayersExecutor((serverId) =>
      instances.execRcon(serverId, "ListPlayers", { recordEvent: false }),
    );

    backupScheduler.start();
    maintenanceScheduler.start();
    playerSessionWatcher.start();
    processMetricsSampler.start();
    const logRetentionScheduler = new LogRetentionScheduler(logsService);
    logRetentionScheduler.start();
    applyWindowsLoginItem(readDesktopShellPreferences(settings).startWithWindows);

    // Drop leftover YARK move-staging dirs from interrupted attempts (#56).
    void moveInstallService.sweepStaleStaging().catch((error: unknown) => {
      console.error("Move-install staging sweep failed", error);
    });

    // Before UI / auto-start: reclaim ASA left after crash / unexpected exit (#59).
    const reattachOutcomes = await reattachLeftRunningProcesses(
      settings,
      repo,
      processManager,
    );

    // Auto-start after the main window is shown (splash dismissed). Native
    // consoles must not open over the splash (#350). Re-read the console pref
    // at that point so a legacy localStorage migrate can land first.
    let autoStartStarted = false;
    notifyMainUiReadyForAutoStart = (): void => {
      if (splash !== null && !splash.isDestroyed()) {
        return;
      }
      if (autoStartStarted) {
        return;
      }
      autoStartStarted = true;
      void (async () => {
        try {
          await updateService.resumeQueuedFileJobsOnLaunch();
        } catch (error: unknown) {
          console.error("Resume pending Downloads on launch failed", error);
        }
        const occupyingServerIds = new Set(
          updateService
            .getSteamCmdStatus()
            .criticalJobs
            .filter(
              (job) =>
                isFilesJobOperation(job.operation)
                && isOccupyingFilesJobStatus(job.status)
                && job.serverId.length > 0,
            )
            .map((job) => job.serverId),
        );
        try {
          await runAutoStartOnLaunch({
            profiles: repo.list().filter((profile) => !occupyingServerIds.has(profile.id)),
            reattachOutcomes,
            processes: processManager,
            repo,
            start: (serverId, options) => instances.start(serverId, options),
            openNativeConsole: parseOpenNativeConsolePref(
              settings.get(OPEN_NATIVE_CONSOLE_SETTING_KEY),
            ),
          });
        } catch (error: unknown) {
          console.error("Auto-start on launch failed", error);
        }
      })();
    };

    const evaluateAppUpdateSafety = ():
      | "servers-running"
      | "critical-job"
      | "operation-in-progress"
      | null => {
      if (instances.shouldBlockAppQuit()) {
        return "operation-in-progress";
      }
      if (repo.list().some((profile) => processManager.isActive(profile.id))) {
        return "servers-running";
      }
      const steam = updateService.getSteamCmdStatus();
      if (steam.busy) {
        return "critical-job";
      }
      const activeCritical = steam.criticalJobs.some(
        (job) =>
          job.status === "pending"
          || job.status === "retrying"
          || job.status === "running",
      );
      if (activeCritical) {
        return "critical-job";
      }
      return null;
    };

    let allowQuit = false;
    /**
     * Quit coordination:
     * - `isQuitting`: real shutdown started (tray Quit / settle / before-quit).
     *   Window `close` must not re-hide to tray while this is true.
     * - `allowQuit`: stop/settle finished; next `app.quit()` / `before-quit` may exit.
     * - `pendingQuit`: single-flight promise for async stop-before-quit work.
     */
    let isQuitting = false;
    let pendingQuit: Promise<void> | null = null;
    let quitPolicyPromptInFlight = false;

    const appUpdateService = new AppUpdateService({
      evaluate: evaluateAppUpdateSafety,
      prepareQuit: () => {
        allowQuit = true;
        isQuitting = true;
      },
    });

    registerIpcHandlers(
      instances,
      repo,
      iniService,
      clusterIniService,
      clusterIniApplyService,
      configTransferService,
      logsService,
      updateService,
      modsService,
      backupService,
      maintenanceService,
      moveInstallService,
      {
        app: userData,
        backups: join(userData, "backups"),
        updateLogs: join(userData, "update-logs"),
        steamcmd: join(userData, "steamcmd"),
      },
      settings,
      playerSessionWatcher,
      processMetricsSampler,
      appUpdateService,
    );

    const requestAppQuit = (): void => {
      // Real quit path — goes through before-quit (#59 confirm Stop / Cancel).
      // Must set isQuitting before app.quit() so window `close` does not
      // re-interpret the shutdown as “hide to tray”.
      isQuitting = true;
      app.quit();
    };

    const countActiveServers = (): number =>
      repo.list().filter((profile) => processManager.isActive(profile.id)).length;

    const hasActiveManagedServers = (): boolean => countActiveServers() > 0;

    /** Recreate the main window if it was destroyed (e.g. cancelled quit after close). */
    const ensureMainWindow = (): BrowserWindow => {
      if (mainWindow === null || mainWindow.isDestroyed()) {
        mainWindow = createWindow(settings);
        attachMainWindowCloseHandler(mainWindow);
      }
      return mainWindow;
    };

    const revealMainWindow = (): void => {
      showBrowserWindow(ensureMainWindow());
    };

    const fleetOsNotifier = new FleetOsNotifier({
      readPrefs: () => readDesktopShellPreferences(settings),
      getMainWindow: () => mainWindow,
      revealMainWindow,
      sendToRenderer,
    });

    const attachMainWindowCloseHandler = (win: BrowserWindow): void => {
      win.on("close", (event) => {
        // Final exit (after stop/settle or clean before-quit): destroy the window.
        // Must run before close-to-tray, or app.quit() would only hide.
        if (allowQuit) {
          return;
        }

        if (
          shouldPreventCloseDuringQuit({
            allowQuit,
            isQuitting,
            hasPendingQuitWork: pendingQuit !== null,
            quitPolicyPromptInFlight,
          })
        ) {
          event.preventDefault();
          revealMainWindow();
          return;
        }

        if (instances.shouldBlockAppQuit()) {
          event.preventDefault();
          revealMainWindow();
          void dialog.showMessageBox(ensureMainWindow(), {
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
          win.hide();
          ensureTray();
          notifyTrayHide();
          return;
        }

        // Close-to-tray off + active servers: do not destroy the window yet.
        // Route through before-quit (#59 Ask/Stop). Cancel must keep UI alive.
        if (hasActiveManagedServers()) {
          event.preventDefault();
          requestAppQuit();
        }
        // No active servers: allow destroy → window-all-closed → quit.
      });
    };

    const trayOptions = (): AppTrayOptions => ({
      iconPath: resolveAppIcon(),
      onShow: () => revealMainWindow(),
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

    instances.on("server-crashed", (payload: ServerCrashedNotifyPayload) => {
      fleetOsNotifier.notifyCrash(payload);
    });

    updateService.on("job-terminal", (payload: SteamCmdJobTerminalPayload) => {
      fleetOsNotifier.notifySteamCmd(payload);
    });

    moveInstallService.on("progress", (payload: MoveInstallProgressPush) => {
      sendToRenderer(IPC_PUSH.moveInstallProgress, payload);
    });

    instances.on("clone-progress", (payload: CloneInstallProgressPush) => {
      sendToRenderer(
        IPC_PUSH.cloneInstallProgress,
        normalizeCloneInstallProgress(payload),
      );
    });

    instances.on("stop-progress", (payload: ServerStopProgressPush) => {
      sendToRenderer(
        IPC_PUSH.serverStopProgress,
        normalizeServerStopProgress(payload),
      );
    });

    backupService.on("changed", (payload: BackupChangedPush) => {
      sendToRenderer(IPC_PUSH.backupsChanged, payload);
    });

    instances.on("rcon-status-changed", (payload: RconStatusChangedPush) => {
      sendToRenderer(IPC_PUSH.rconStatusChanged, payload);
    });

    playerSessionWatcher.on("players-updated", (payload: PlayerListUpdatedPush) => {
      sendToRenderer(IPC_PUSH.playerListUpdated, payload);
    });

    processMetricsSampler.on(
      "metrics-updated",
      (payload: ProcessMetricsUpdatedPush) => {
        sendToRenderer(IPC_PUSH.processMetricsUpdated, payload);
      },
    );

    appUpdateService.onStatus((status: AppUpdateStatus) => {
      sendToRenderer(IPC_PUSH.appUpdate, status);
      if (
        (status.phase === "available" || status.phase === "ready")
        && status.availableVersion !== null
        && status.availableVersion.trim().length > 0
      ) {
        fleetOsNotifier.notifyYarkUpdate({
          phase: status.phase,
          version: status.availableVersion,
        });
      }
    });

    mainWindow = createWindow(settings, {
      hiddenUntilReveal: splash !== null,
      onReadyToShow:
        splash !== null
          ? () => {
              mainReadyToShow = true;
              scheduleSplashHandoff();
              return false;
            }
          : undefined,
    });
    // `show` is the auto-start trigger when the window becomes visible.
    // Direct notify (below) is only for the case the window is already shown
    // so `show` will not fire (listener attached late).
    mainWindow.on("show", () => {
      notifyMainUiReadyForAutoStart();
    });
    if (!mainWindow.isDestroyed() && mainWindow.isVisible()) {
      notifyMainUiReadyForAutoStart();
    }
    if (splash !== null && !splash.isDestroyed()) {
      splash.setAlwaysOnTop(true);
    }
    if (splash !== null && mainWindow.isVisible()) {
      mainWindow.hide();
    }
    attachMainWindowCloseHandler(mainWindow);
    ensureTray();
    appUpdateService.startQuietCheck();
    if (pendingSecondInstanceReveal) {
      pendingSecondInstanceReveal = false;
      revealMainWindow();
    }

    const quitAfter = (work: Promise<unknown>): void => {
      if (pendingQuit !== null) return;
      isQuitting = true;
      quitPolicyPromptInFlight = false;
      pendingQuit = work
        .then(() => {
          allowQuit = true;
          pendingQuit = null;
          app.quit();
        })
        .catch((error: unknown) => {
          const reset = quitFlagsAfterCancel();
          allowQuit = reset.allowQuit;
          isQuitting = reset.isQuitting;
          quitPolicyPromptInFlight = reset.quitPolicyPromptInFlight;
          pendingQuit = null;
          revealMainWindow();
          void dialog.showMessageBox(ensureMainWindow(), {
            type: "error",
            title: "Could not finish server stop",
            message: "YARK will remain open because the active stop did not finish safely.",
            detail: error instanceof Error ? error.message : String(error),
            buttons: ["OK"],
          });
        });
    };

    const notifyTrayHide = (): void => {
      const prefs = readDesktopShellPreferences(settings);
      if (!prefs.osNotifyEnabled || prefs.trayCloseHintDismissed) {
        return;
      }
      showNativeOsNotification({
        title: "YARK",
        body: "Still running in the tray.",
        silent: true,
        onClick: () => {
          revealMainWindow();
        },
      });
    };

    app.on("activate", () => {
      revealMainWindow();
    });

    app.on("before-quit", (event) => {
      if (allowQuit) {
        return;
      }
      if (instances.shouldBlockAppQuit()) {
        isQuitting = true;
        event.preventDefault();
        revealMainWindow();
        quitAfter(instances.settleForAppQuit());
        return;
      }
      // Cancel pending SteamCMD/sync on quit (without requiring a live UI).
      try {
        void updateService.cancelSteamCmd();
      } catch {
        // Ignore: the app is shutting down.
      }
      const profiles = repo.list();
      const activeProfiles = profiles.filter((p) => processManager.isActive(p.id));
      if (activeProfiles.length === 0) {
        // Allow BrowserWindow destroy; otherwise isQuitting + tray hide deadlocks quit.
        allowQuit = true;
        isQuitting = true;
        return;
      }

      // Active servers: always confirm before stop-and-quit (#59).
      event.preventDefault();
      if (pendingQuit !== null || quitPolicyPromptInFlight) {
        return;
      }

      const applyQuitDecision = (decision: "stop" | "cancel"): void => {
        if (decision === "cancel") {
          const reset = quitFlagsAfterCancel();
          allowQuit = reset.allowQuit;
          isQuitting = reset.isQuitting;
          quitPolicyPromptInFlight = reset.quitPolicyPromptInFlight;
          pendingQuit = null;
          revealMainWindow();
          return;
        }
        // Keep UI visible so stop-progress (wait / save / backup) can show.
        // Stopping clears per-server crash-recovery checkpoints as processes exit.
        revealMainWindow();
        quitAfter(instances.stopAllForAppQuit());
      };

      quitPolicyPromptInFlight = true;
      isQuitting = true;
      const win = ensureMainWindow();
      revealMainWindow();
      const count = activeProfiles.length;
      void dialog
        .showMessageBox(win, {
          type: "question",
          buttons: ["Stop", "Cancel"],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
          title: "Quit YARK?",
          message:
            count === 1
              ? "1 server is still running."
              : `${count} servers are still running.`,
          detail:
            "Stop them before quitting. To keep servers and backups running, enable Close window to tray in Settings, then close the window instead of quitting.",
        })
        .then((result) => {
          quitPolicyPromptInFlight = false;
          if (result.response === 0) {
            applyQuitDecision("stop");
          } else {
            applyQuitDecision("cancel");
          }
        })
        .catch(() => {
          const reset = quitFlagsAfterCancel();
          allowQuit = reset.allowQuit;
          isQuitting = reset.isQuitting;
          quitPolicyPromptInFlight = reset.quitPolicyPromptInFlight;
          pendingQuit = null;
          revealMainWindow();
        });
    });

    app.on("will-quit", () => {
      backupScheduler.stop();
      maintenanceScheduler.stop();
      playerSessionWatcher.stop();
      processMetricsSampler.stop();
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
