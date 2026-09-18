/**
 * Local E2E performance snapshot: cold Electron launch → Overview (#219).
 *
 * This is an informational developer measurement, not a CI budget gate.
 * Usage: npm run build && npm run e2e:perf
 * Isolates SQLite via YARK_E2E_USER_DATA. Clears ELECTRON_RUN_AS_NODE.
 */
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const path = require("node:path");
const {
  projectRoot,
  createE2eFixtureRoots,
  assertUnderFixtureRoot,
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  removeFixtureDir,
} = require("./e2e-launch.cjs");

async function run() {
  process.chdir(projectRoot);
  const { profileDir, fixtureName, root } = createE2eFixtureRoots("perf", {
    createServers: false,
  });
  assertUnderFixtureRoot(path.join(root, "profiles"), profileDir);

  let app = null;
  let succeeded = false;
  try {
    const startedAt = performance.now();
    app = await launchElectronApp({ profileDir });
    await waitForOverview(app);
    const elapsedMs = Math.round(performance.now() - startedAt);

    assert.ok(Number.isFinite(elapsedMs) && elapsedMs >= 0, "Invalid startup timing");
    succeeded = true;
    console.log("E2E_PERF_OK");
    console.log(`COLD_START_OVERVIEW_MS=${elapsedMs}`);
    console.log(`E2E_PERF_PROFILE=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_PERF_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir).catch((error) => {
        console.warn(`E2E_PERF_CLEANUP_WARN ${error?.message ?? String(error)}`);
      });
    } else {
      console.error(`E2E_PERF_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_PERF_FIXTURE ${fixtureName}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_PERF_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
