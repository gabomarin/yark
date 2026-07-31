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
const appVersionDefine = {
  __APP_VERSION__: JSON.stringify(appVersion),
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
    define: appVersionDefine,
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    define: appVersionDefine,
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: rendererAlias },
    define: appVersionDefine,
    publicDir: resolve(__dirname, "src/renderer/public"),
  },
});
