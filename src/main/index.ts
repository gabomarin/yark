import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { openDatabase } from "../backend/infra/db/database";
import { ServerRepository } from "../backend/infra/db/server-repository";
import { ProcessManager } from "../backend/infra/process/process-manager";
import { InstanceService } from "../backend/domains/instances/instance-service";
import { registerIpcHandlers } from "./ipc-handlers";
import { IPC_PUSH } from "../shared/ipc";
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
  const dbPath = join(app.getPath("userData"), "ark-server-gbo.db");
  const db = openDatabase(dbPath);
  const repo = new ServerRepository(db);
  const processManager = new ProcessManager();
  const instances = new InstanceService(repo, processManager);

  registerIpcHandlers(instances, repo);

  processManager.on("status", (info: ServerRuntimeInfo) => {
    mainWindow?.webContents.send(IPC_PUSH.serverStatus, info);
  });

  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });

  app.on("before-quit", (event) => {
    const profiles = repo.list();
    const anyActive = profiles.some((p) => processManager.isActive(p.id));
    if (anyActive) {
      event.preventDefault();
      void processManager.stopAll(profiles).finally(() => {
        app.exit(0);
      });
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
