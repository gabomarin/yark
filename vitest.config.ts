import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

const packageJsonPath = resolve(__dirname, "package.json");
const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonRaw) as { version?: unknown };
const appVersion =
  typeof packageJson.version === "string" && packageJson.version.trim().length > 0
    ? packageJson.version
    : "0.0.0";

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    // Unit tests always use an empty bake so local env cannot leak into hermetic runs (#151).
    __YARK_CURSEFORGE_PROXY_URL__: JSON.stringify(""),
  },
  resolve: {
    alias: {
      "@app": resolve(__dirname, "src/renderer/src/app"),
      "@layout": resolve(__dirname, "src/renderer/src/layout"),
      "@shared": resolve(__dirname, "src/shared"),
      "@backend": resolve(__dirname, "src/backend"),
      "@features": resolve(__dirname, "src/renderer/src/features"),
      "@renderer": resolve(__dirname, "src/renderer/src"),
      "@theme": resolve(__dirname, "src/renderer/src/shared/theme"),
      "@ui": resolve(__dirname, "src/renderer/src/shared/ui"),
    },
  },
  test: {
    // Backend/unit files do not need jsdom or the Mantine/React setup file.
    // A few tests/ files opt into jsdom with `// @vitest-environment jsdom`
    // (legacy localStorage). Renderer suites stay on jsdom (#281).
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["tests/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "renderer",
          include: [
            "src/renderer/src/**/*.test.ts",
            "src/renderer/src/**/*.test.tsx",
          ],
          environment: "jsdom",
          setupFiles: [resolve(__dirname, "src/renderer/src/test/setup.ts")],
        },
      },
    ],
  },
});
