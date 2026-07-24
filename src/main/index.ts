import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { openDatabase } from "../backend/infra/db/database";
import { AppSettingsRepository } from "../backend/infra/db/app-settings-repository";
import { BackupRepository } from "../backend/infra/db/backup-repository";
import { ServerRepository } from "../backend/infra/db/server-repository";
import { ProcessManager } from "../backend/infra/process/process-manager";
import { BackupService } from "../backend/domains/backups/backup-service";
import { BackupScheduler } from "../backend/domains/backups/backup-scheduler";
import { IniService } from "../backend/domains/config/ini-service";
import { InstanceService } from "../backend/domains/instances/instance-service";
import { LogsService } from "../backend/domains/logs/logs-service";
import { UpdateService } from "../backend/domains/updates/update-service";
import { InstanceLockManager } from "../backend/orchestration/instance-lock-manager";
import { registerIpcHandlers } from "./ipc-handlers";
import { IPC_PUSH, type SteamCmdProgressPush } from "../shared/ipc";
import type { ServerRuntimeInfo } from "../shared/types";

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "ARK Server GBO",
    backgroundColor: "#12141a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env["ELECTRON_RENDERER_URL"] !== undefined) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

void app.whenReady().then(() => {
  const userData = app.getPath("userData");
  const dbPath = join(userData, "ark-server-gbo.db");
  const db = openDatabase(dbPath);
  const settings = new AppSettingsRepository(db);
  const repo = new ServerRepository(db);
  const backupRepo = new BackupRepository(db);
  const processManager = new ProcessManager();
  const instances = new InstanceService(repo, processManager);
  const locks = new InstanceLockManager();
  const backupService = new BackupService(
    repo,
    backupRepo,
    processManager,
    settings,
    join(userData, "backups"),
  );
  const backupScheduler = new BackupScheduler(backupService);
  const iniService = new IniService(repo, locks);
  const logsService = new LogsService(
    repo,
    backupRepo,
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

  backupScheduler.start();

  registerIpcHandlers(instances, repo, iniService, logsService, updateService);

  processManager.on("status", (info: ServerRuntimeInfo) => {
    mainWindow?.webContents.send(IPC_PUSH.serverStatus, info);
  });

  updateService.on("progress", (payload: SteamCmdProgressPush) => {
    mainWindow?.webContents.send(IPC_PUSH.steamCmdProgress, payload);
  });

  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });

  app.on("before-quit", (event) => {
    updateService.cancelSteamCmd();
    const profiles = repo.list();
    const anyActive = profiles.some((p) => processManager.isActive(p.id));
    if (anyActive) {
      event.preventDefault();
      void processManager.stopAll(profiles).finally(() => {
        app.exit(0);
      });
    }
  });

  app.on("will-quit", () => {
    backupScheduler.stop();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
