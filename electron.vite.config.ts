import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

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

function copySplashAssetsPlugin(): Plugin {
  const copy = (): void => {
    const dest = resolve(__dirname, "out/main/splash");
    mkdirSync(dest, { recursive: true });
    copyFileSync(
      resolve(__dirname, "src/main/splash/splash.html"),
      resolve(dest, "splash.html"),
    );
    copyFileSync(
      resolve(__dirname, "brand/splashscreen.svg"),
      resolve(dest, "splashscreen.svg"),
    );
  };
  return {
    name: "copy-yark-splash-assets",
    buildStart: copy,
    writeBundle: copy,
  };
}

const rendererAlias = {
  ...sharedAlias,
  "@app": resolve(__dirname, "src/renderer/src/app"),
  "@layout": resolve(__dirname, "src/renderer/src/layout"),
  "@features": resolve(__dirname, "src/renderer/src/features"),
  "@renderer": resolve(__dirname, "src/renderer/src"),
  "@theme": resolve(__dirname, "src/renderer/src/shared/theme"),
  "@ui": resolve(__dirname, "src/renderer/src/shared/ui"),
};

/**
 * Opt-in React Compiler for the renderer only (#404 spike).
 * Set `YARK_REACT_COMPILER=1` before `electron-vite` / use `npm run build:compiler`.
 * See docs/react-compiler-spike.md.
 */
const enableReactCompiler = process.env.YARK_REACT_COMPILER === "1";
const reactCompilerVerbose = process.env.YARK_REACT_COMPILER_VERBOSE === "1";

const reactCompilerPlugin =
  enableReactCompiler
    ? ([
        "babel-plugin-react-compiler",
        {
          target: "19",
          ...(reactCompilerVerbose
            ? {
                logger: {
                  logEvent(
                    filename: string | null,
                    event: {
                      kind?: string;
                      detail?: { reason?: string; description?: string };
                      reason?: string;
                    },
                  ) {
                    if (event.kind === "CompileSuccess") {
                      console.info(`[react-compiler] CompileSuccess`);
                      return;
                    }
                    if (
                      event.kind === "CompileError" ||
                      event.kind === "CompileDiagnostic" ||
                      event.kind === "PipelineError"
                    ) {
                      const reason =
                        event.detail?.reason ??
                        event.detail?.description ??
                        event.reason ??
                        "(no reason)";
                      console.info(
                        `[react-compiler] ${event.kind} ${filename ?? "(unknown)"} :: ${reason}`,
                      );
                    }
                  },
                },
              }
            : {}),
        },
      ] as const)
    : null;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copySplashAssetsPlugin()],
    resolve: { alias: sharedAlias },
    define: appDefines,
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    define: appDefines,
  },
  renderer: {
    plugins: [
      react(
        reactCompilerPlugin
          ? {
              babel: {
                plugins: [reactCompilerPlugin],
              },
            }
          : {},
      ),
    ],
    resolve: { alias: rendererAlias },
    define: appDefines,
    publicDir: resolve(__dirname, "src/renderer/public"),
  },
});
