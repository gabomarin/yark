/** Boot splash is skipped in E2E and when an operator opts out. */
export const SPLASH_WIDTH = 520;
export const SPLASH_HEIGHT = 560;
export const SPLASH_SVG_PLACEHOLDER = "__YARK_SPLASH_SVG__";
/** Short floor so the lockup is visible; splash still waits for main ready. */
export const SPLASH_MIN_MS = 1_500;
export const SPLASH_MAX_MS = 30_000;

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

export function buildSplashDocument(html: string, svg: string, version: string): string {
  return applySplashVersion(html, version).replaceAll(
    SPLASH_SVG_PLACEHOLDER,
    stripSvgProlog(svg),
  );
}
