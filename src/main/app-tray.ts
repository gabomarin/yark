import { Menu, Tray, nativeImage, type BrowserWindow, type NativeImage } from "electron";
import { existsSync } from "node:fs";

export { formatTrayServerStatus } from "@shared/app-tray-status";

export interface AppTrayOptions {
  iconPath: string | undefined;
  onShow: () => void;
  onQuit: () => void;
  /** Disabled status line, e.g. "2 servers running". */
  getStatusLabel: () => string;
}

/**
 * Create (or replace) the Windows/Linux system tray icon for YARK.
 * Returns null when no usable icon file exists.
 */
export function createAppTray(options: AppTrayOptions): Tray | null {
  const image = loadTrayImage(options.iconPath);
  if (image === null) {
    console.warn(
      "[yark] System tray icon could not be loaded; tray will be unavailable.",
      options.iconPath ?? "(no icon path)",
    );
    return null;
  }

  const tray = new Tray(image);
  tray.setToolTip("YARK");
  applyTrayContextMenu(tray, options);
  tray.on("double-click", () => options.onShow());
  tray.on("click", () => options.onShow());
  return tray;
}

export function applyTrayContextMenu(tray: Tray, options: AppTrayOptions): void {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show YARK",
        click: () => options.onShow(),
      },
      { type: "separator" },
      {
        label: options.getStatusLabel(),
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Quit YARK",
        click: () => options.onQuit(),
      },
    ]),
  );
}

function loadTrayImage(iconPath: string | undefined): NativeImage | null {
  if (iconPath === undefined || !existsSync(iconPath)) {
    return null;
  }
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    return null;
  }
  return image;
}

export function showBrowserWindow(win: BrowserWindow | null): void {
  if (win === null || win.isDestroyed()) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}
