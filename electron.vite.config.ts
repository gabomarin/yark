import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

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
