import { app, BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
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

export {
  SPLASH_HEIGHT,
  SPLASH_MAX_MS,
  SPLASH_MIN_MS,
  SPLASH_WIDTH,
  remainingSplashHoldMs,
  shouldShowSplash,
} from "./splash-policy";

const splashTempDirs = new WeakMap<BrowserWindow, string>();

function firstExisting(paths: string[]): string | undefined {
  return paths.find((candidate) => existsSync(candidate));
}

function resolveSplashHtmlPath(): string | undefined {
  return firstExisting([
    join(__dirname, "splash/splash.html"),
    join(__dirname, "../../src/main/splash/splash.html"),
  ]);
}

function resolveSplashSvgPath(): string | undefined {
  return firstExisting([
    join(__dirname, "splash/splashscreen.svg"),
    join(__dirname, "../../brand/splashscreen.svg"),
  ]);
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

export function createSplashWindow(options: {
  version: string;
  icon?: string;
  x?: number;
  y?: number;
}): BrowserWindow {
  const win = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    ...(options.x !== undefined && options.y !== undefined
      ? { x: options.x, y: options.y }
      : { center: true }),
    show: false,
    title: "YARK server manager",
    backgroundColor: "#0c1427",
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
