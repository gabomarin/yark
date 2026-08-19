import { app, type BrowserWindow } from "electron";

/** Unpackaged dev/preview only — packaged installers ship with DevTools disabled. */
export function isDevToolsAllowed(): boolean {
  return !app.isPackaged;
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
