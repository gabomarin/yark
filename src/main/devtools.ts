import { app, type BrowserWindow } from "electron";

/** Unpackaged dev/preview, or packaged builds with YARK_DEVTOOLS=1. */
export function isDevToolsAllowed(): boolean {
  if (!app.isPackaged) {
    return true;
  }
  return process.env["YARK_DEVTOOLS"]?.trim() === "1";
}

function toggleDevTools(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    return;
  }
  if (win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools();
  } else {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

/** F12 / Ctrl+Shift+I — needed because the app menu is intentionally null. */
export function attachDevToolsShortcuts(win: BrowserWindow): void {
  if (!isDevToolsAllowed()) {
    return;
  }

  win.webContents.on("before-input-event", (_event, input) => {
    if (input.type !== "keyDown") {
      return;
    }
    if (input.key === "F12") {
      toggleDevTools(win);
      return;
    }
    if (input.control && input.shift && input.key.toLowerCase() === "i") {
      toggleDevTools(win);
    }
  });
}
