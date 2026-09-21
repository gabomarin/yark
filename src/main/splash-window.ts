import { app, BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { BRAND_PLATE_BACKGROUND } from "../shared/app-chrome";
import {
  FALLBACK_SPLASH_TEMPLATE,
  SPLASH_HEIGHT,
  SPLASH_WIDTH,
  applySplashVersion,
  buildSplashDocument,
  splashDocumentDataUrl,
  splashDocumentDataUrlIfSafe,
  writePrivateSplashDocument,
} from "./splash-policy";

export { SPLASH_HEIGHT, SPLASH_MAX_MS, SPLASH_WIDTH, remainingSplashHoldMs, shouldShowSplash } from "./splash-policy";

const splashTempDirs = new WeakMap<BrowserWindow, string>();

/**
 * Windows this module created for the startup splash. They exist to show the brand plate, so
 * a theme-driven canvas repaint must skip them: repainting the splash to the app canvas would
 * replace the plate with the page colour for the frame before it hands over.
 */
const splashWindows = new WeakSet<BrowserWindow>();

/** True for windows created by `createSplashWindow`. */
export function isSplashWindow(win: BrowserWindow): boolean {
  return splashWindows.has(win);
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((candidate) => existsSync(candidate));
}

function resolveSplashHtmlPath(): string | undefined {
  return firstExisting([join(__dirname, "splash/splash.html"), join(__dirname, "../../src/main/splash/splash.html")]);
}

function resolveSplashSvgPath(): string | undefined {
  return firstExisting([join(__dirname, "splash/splashscreen.svg"), join(__dirname, "../../brand/splashscreen.svg")]);
}

function cleanupSplashTempDir(win: BrowserWindow): void {
  const dir = splashTempDirs.get(win);
  if (dir === undefined) {
    return;
  }
  splashTempDirs.delete(win);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function readSplashDocumentHtml(version: string): string {
  const fallback = applySplashVersion(FALLBACK_SPLASH_TEMPLATE, version);
  try {
    const htmlPath = resolveSplashHtmlPath();
    const svgPath = resolveSplashSvgPath();
    if (htmlPath === undefined || svgPath === undefined) {
      return fallback;
    }
    return buildSplashDocument(readFileSync(htmlPath, "utf8"), readFileSync(svgPath, "utf8"), version);
  } catch {
    return fallback;
  }
}

function loadSplashHtml(win: BrowserWindow, html: string, fallbackHtml: string): void {
  const loadFallback = (): void => {
    if (win.isDestroyed()) {
      return;
    }
    void win.loadURL(splashDocumentDataUrl(fallbackHtml)).catch(() => undefined);
  };
  const dataUrl = splashDocumentDataUrlIfSafe(html);
  if (dataUrl !== undefined) {
    void win.loadURL(dataUrl).catch(loadFallback);
    return;
  }
  try {
    const tempPath = writePrivateSplashDocument(html, app.getPath("temp"), randomUUID());
    splashTempDirs.set(win, dirname(tempPath));
    void win.loadFile(tempPath).catch(loadFallback);
  } catch {
    loadFallback();
  }
}

export function createSplashWindow(options: { version: string; icon?: string; x?: number; y?: number }): BrowserWindow {
  const win = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    ...(options.x !== undefined && options.y !== undefined ? { x: options.x, y: options.y } : { center: true }),
    show: false,
    title: "YARK server manager",
    backgroundColor: BRAND_PLATE_BACKGROUND,
    ...(options.icon !== undefined ? { icon: options.icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) {
      win.show();
    }
  });
  // Registered as soon as the window exists: the tracking must not depend on the loading below
  // succeeding, or a throw in between would leave a live splash window the repaint can find.
  splashWindows.add(win);
  win.on("closed", () => {
    cleanupSplashTempDir(win);
  });

  const fallbackHtml = applySplashVersion(FALLBACK_SPLASH_TEMPLATE, options.version);
  loadSplashHtml(win, readSplashDocumentHtml(options.version), fallbackHtml);
  return win;
}

export function closeSplashWindow(win: BrowserWindow | null): void {
  if (win === null || win.isDestroyed()) {
    return;
  }
  cleanupSplashTempDir(win);
  win.destroy();
}
