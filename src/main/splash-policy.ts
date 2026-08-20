import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Boot splash is skipped in E2E and when an operator opts out. */
export const SPLASH_WIDTH = 520;
export const SPLASH_HEIGHT = 560;
const SPLASH_SVG_PLACEHOLDER = "__YARK_SPLASH_SVG__";
/** Short floor so the lockup is visible; splash still waits for main ready. */
export const SPLASH_MIN_MS = 1_500;
export const SPLASH_MAX_MS = 30_000;
/** Chromium `url::kMaxURLChars` (2 MiB). Stay strictly under for `loadURL`. */
export const SPLASH_MAX_DATA_URL_CHARS = 2 * 1024 * 1024;
export const FALLBACK_SPLASH_TEMPLATE = `<!DOCTYPE html><html lang="en" data-yark-splash="1"><head><meta charset="utf-8"/><title>YARK</title><style>html,body{margin:0;height:100%;background:#0c1427;color:#b4c2d8;font:600 13px "Segoe UI",sans-serif;display:grid;place-items:center}</style></head><body><p>__YARK_VERSION__</p></body></html>`;

/** Ms to keep the splash after main is ready (0 = hand off now). */
export function remainingSplashHoldMs(
  shownAtMs: number,
  nowMs: number,
  minMs: number = SPLASH_MIN_MS,
): number {
  return Math.max(0, minMs - (nowMs - shownAtMs));
}

export function shouldShowSplash(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env["YARK_SKIP_SPLASH"] === "1") {
    return false;
  }
  const e2eUserData = env["YARK_E2E_USER_DATA"]?.trim();
  if (e2eUserData !== undefined && e2eUserData !== "") {
    return false;
  }
  return true;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function applySplashVersion(html: string, version: string): string {
  const label = version.trim() === "" ? "" : `v${escapeHtml(version.trim())}`;
  return html.replaceAll("__YARK_VERSION__", label);
}

export function stripSvgProlog(svg: string): string {
  return svg
    .replace(/^\uFEFF/, "")
    .replace(/^<\?xml[\s\S]*?\?>\s*/i, "")
    .replace(/<!DOCTYPE[\s\S]*?>\s*/i, "");
}

/** Drop SMIL so splash HTML CSS can honor prefers-reduced-motion instead. */
export function stripSvgSmiAnimations(svg: string): string {
  return svg
    .replace(/<animate\b[^>]*\/>/gi, "")
    .replace(/<animate\b[^>]*>[\s\S]*?<\/animate>/gi, "");
}

export function buildSplashDocument(html: string, svg: string, version: string): string {
  return applySplashVersion(html, version).replaceAll(
    SPLASH_SVG_PLACEHOLDER,
    stripSvgSmiAnimations(stripSvgProlog(svg)),
  );
}

export function splashDocumentDataUrl(html: string): string {
  return `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`;
}

/** Undefined when the URL would exceed Chromium's navigation length limit. */
export function splashDocumentDataUrlIfSafe(html: string): string | undefined {
  const url = splashDocumentDataUrl(html);
  return url.length < SPLASH_MAX_DATA_URL_CHARS ? url : undefined;
}

export function privateSplashDirName(id: string): string {
  return `yark-splash-${id}`;
}

/** Unique dir + exclusive file create. Caller must delete the directory. */
export function writePrivateSplashDocument(html: string, tempRoot: string, id: string): string {
  const dir = join(tempRoot, privateSplashDirName(id));
  mkdirSync(dir);
  const filePath = join(dir, "splash.html");
  try {
    writeFileSync(filePath, html, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw error;
  }
  return filePath;
}
