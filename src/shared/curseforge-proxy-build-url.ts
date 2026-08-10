declare const __YARK_CURSEFORGE_PROXY_URL__: string;

/**
 * Official CurseForge proxy base URL injected at electron-vite build time.
 * Empty unless `YARK_CURSEFORGE_PROXY_URL` is set during build (release workflow).
 * See docs/curseforge-proxy.md.
 */
function readBuildUrl(): string {
  try {
    return typeof __YARK_CURSEFORGE_PROXY_URL__ === "string"
      ? __YARK_CURSEFORGE_PROXY_URL__.trim()
      : "";
  } catch {
    return "";
  }
}

export const BUILD_CURSEFORGE_PROXY_URL: string = readBuildUrl();
