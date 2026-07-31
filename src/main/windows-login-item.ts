import { app } from "electron";

/**
 * Register or clear the Windows “open at login” entry for this app.
 * Safe no-op on non-Windows. Uses Electron's login-item API so toggling does
 * not leave duplicate Run-key entries for the same executable.
 */
export function applyWindowsLoginItem(openAtLogin: boolean): void {
  if (process.platform !== "win32") {
    return;
  }

  // Packaged: process.execPath is YARK.exe.
  // Dev (`electron .`): open the Electron binary with the app path as argv.
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin,
      path: process.execPath,
      args: [],
    });
    return;
  }

  app.setLoginItemSettings({
    openAtLogin,
    path: process.execPath,
    args: [app.getAppPath()],
  });
}
