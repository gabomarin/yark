import { app, BrowserWindow } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SPLASH_HEIGHT, SPLASH_WIDTH, buildSplashDocument } from "./splash-policy";

export {
  SPLASH_HEIGHT,
  SPLASH_MAX_MS,
  SPLASH_MIN_MS,
  SPLASH_WIDTH,
  remainingSplashHoldMs,
  shouldShowSplash,
} from "./splash-policy";

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

  const htmlPath = resolveSplashHtmlPath();
  const svgPath = resolveSplashSvgPath();
  if (htmlPath !== undefined && svgPath !== undefined) {
    const documentHtml = buildSplashDocument(
      readFileSync(htmlPath, "utf8"),
      readFileSync(svgPath, "utf8"),
      options.version,
    );
    const tmpPath = join(app.getPath("temp"), "yark-splash.html");
    writeFileSync(tmpPath, documentHtml);
    void win.loadFile(tmpPath);
  } else {
    void win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        buildSplashDocument(
          "<!DOCTYPE html><title>YARK</title><p>__YARK_VERSION__</p>",
          "",
          options.version,
        ),
      )}`,
    );
  }
  return win;
}

export function closeSplashWindow(win: BrowserWindow | null): void {
  if (win === null || win.isDestroyed()) {
    return;
  }
  win.destroy();
}
