/**
 * Shared Electron E2E launch helpers (#12).
 *
 * - Clears ELECTRON_RUN_AS_NODE (Playwright `_electron` otherwise misbehaves).
 * - Isolates app data under a disposable YARK_E2E_USER_DATA directory.
 * - Emits launch diagnostics when firstWindow / overview never appears.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");

/**
 * @param {string} [label]
 * @returns {{ profileDir: string; serversDir: string; runId: string; fixtureName: string }}
 */
function createE2eFixtureRoots(label = "e2e") {
  const runId = `${Date.now()}-${process.pid}`;
  const fixtureName = `${label}-${runId}`;
  const preferAsa = process.platform === "win32";
  const root = preferAsa
    ? path.resolve("C:\\asa-e2e")
    : path.join(os.tmpdir(), "yark-e2e");
  const profileDir = path.join(root, "profiles", fixtureName);
  const serversDir = path.join(root, "servers", fixtureName);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(serversDir, { recursive: true });
  return { profileDir, serversDir, runId, fixtureName, root };
}

/**
 * @param {string} root
 * @param {string} target
 */
function assertUnderFixtureRoot(root, target) {
  const relative = path.relative(root, target);
  assert.ok(
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative),
    `Refusing path outside fixture root: ${target}`,
  );
}

/**
 * @param {{ profileDir: string; extraEnv?: Record<string, string> }} options
 */
async function launchElectronApp(options) {
  const { profileDir, extraEnv = {} } = options;
  assert.ok(
    fs.existsSync(path.join(projectRoot, "out", "main", "index.js")),
    "Built app missing (out/main/index.js). Run `npm run build` before E2E.",
  );

  let app;
  try {
    app = await electron.launch({
      args: ["."],
      cwd: projectRoot,
      env: {
        ...process.env,
        YARK_E2E_USER_DATA: profileDir,
        ...extraEnv,
      },
    });
  } catch (error) {
    const detail = error?.stack ?? String(error);
    throw new Error(
      `Electron failed to launch (check display / ELECTRON_RUN_AS_NODE / build).\n${detail}`,
    );
  }

  return app;
}

/**
 * @param {import('playwright').ElectronApplication} app
 * @param {{ timeoutMs?: number }} [options]
 */
async function waitForOverview(app, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  let page;
  try {
    page = await app.firstWindow({ timeout: timeoutMs });
  } catch (error) {
    const windows = app.windows();
    throw new Error(
      `Electron launched but no window appeared within ${timeoutMs}ms ` +
        `(windows=${windows.length}). ${error?.message ?? error}`,
    );
  }
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: timeoutMs,
    });
  } catch (error) {
    const title = await page.title().catch(() => "(title unavailable)");
    const bodySnippet = await page
      .locator("body")
      .innerText()
      .then((text) => text.slice(0, 240))
      .catch(() => "(body unavailable)");
    throw new Error(
      `Overview did not render within ${timeoutMs}ms (title=${title}). ` +
        `Body starts: ${JSON.stringify(bodySnippet)}. ${error?.message ?? error}`,
    );
  }
  return page;
}

/**
 * @param {import('playwright').ElectronApplication} app
 */
async function quitElectronApp(app) {
  const proc = app.process();
  const exited =
    proc == null || proc.exitCode != null
      ? Promise.resolve()
      : new Promise((resolve) => proc.once("exit", resolve));
  try {
    await app.evaluate(({ app: electronApp }) => electronApp.quit());
  } catch {
    await app.close().catch(() => {});
    return;
  }
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Electron did not quit within 20 seconds")),
        20_000,
      ),
    ),
  ]).catch(async () => {
    await app.close().catch(() => {});
  });
}

/**
 * Remove a disposable fixture directory with a few EBUSY/EPERM retries (Windows).
 * @param {string} target
 */
async function removeFixtureDir(target) {
  if (!fs.existsSync(target)) return;
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      const code = error?.code;
      if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}

module.exports = {
  projectRoot,
  createE2eFixtureRoots,
  assertUnderFixtureRoot,
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  removeFixtureDir,
};
