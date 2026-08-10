import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load gitignored `.env` / `.env.local` into `process.env` for local/dev.
 * Does not override vars already set in the shell (User env / CI). Cursor
 * terminals often miss new User env vars until the IDE restarts (#151).
 */
function loadLocalEnvFiles(): void {
  for (const name of [".env", ".env.local"] as const) {
    const filePath = resolve(__dirname, name);
    if (!existsSync(filePath)) continue;
    for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadLocalEnvFiles();

const packageJsonPath = resolve(__dirname, "package.json");
const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonRaw) as { version?: unknown };
const appVersion =
  typeof packageJson.version === "string" && packageJson.version.trim().length > 0
    ? packageJson.version
    : "0.0.0";
const curseforgeProxyUrl = process.env.YARK_CURSEFORGE_PROXY_URL?.trim() ?? "";
const appDefines = {
  __APP_VERSION__: JSON.stringify(appVersion),
  // Official release builds inject via Actions `vars.YARK_CURSEFORGE_PROXY_URL` (#151).
  __YARK_CURSEFORGE_PROXY_URL__: JSON.stringify(curseforgeProxyUrl),
};

const sharedAlias = {
  "@shared": resolve(__dirname, "src/shared"),
  "@backend": resolve(__dirname, "src/backend"),
};

const rendererAlias = {
  ...sharedAlias,
  "@app": resolve(__dirname, "src/renderer/src/app"),
  "@layout": resolve(__dirname, "src/renderer/src/layout"),
  "@features": resolve(__dirname, "src/renderer/src/features"),
  "@renderer": resolve(__dirname, "src/renderer/src"),
  "@theme": resolve(__dirname, "src/renderer/src/shared/theme"),
  "@ui": resolve(__dirname, "src/renderer/src/shared/ui"),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    define: appDefines,
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    define: appDefines,
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: rendererAlias },
    define: appDefines,
    publicDir: resolve(__dirname, "src/renderer/public"),
  },
});
