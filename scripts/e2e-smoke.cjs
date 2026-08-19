/**
 * E2E smoke: Electron launch + overview + sidebar nav (#12).
 *
 * Usage: npm run build && npm run e2e:smoke
 * Isolates SQLite via YARK_E2E_USER_DATA. Clears ELECTRON_RUN_AS_NODE.
 */
const assert = require("node:assert/strict");
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
  const { profileDir, fixtureName, root } = createE2eFixtureRoots("smoke", {
    createServers: false,
  });
  assertUnderFixtureRoot(path.join(root, "profiles"), profileDir);

  let app = null;
  let succeeded = false;
  try {
    app = await launchElectronApp({ profileDir });
    const page = await waitForOverview(app);
    await page.setViewportSize({ width: 1280, height: 720 });

    const h1 = await page.locator("h1").first().textContent();
    assert.ok(h1 !== null, "Main UI title was not found");
    assert.ok(
      h1.includes("Servers") || h1.includes("YARK"),
      `Unexpected title. Expected to include 'Servers' or 'YARK', got: ${h1}`,
    );
    assert.equal(
      await page.getByText("Monitor and manage all your ARK servers").count(),
      0,
      "Overview must not restate the nav item in a page subtitle",
    );
    await page.getByText("Create your first server").waitFor({
      state: "visible",
      timeout: 10000,
    });
    await page.getByText("Add a profile on this PC, then install dedicated server files.").waitFor({
      state: "visible",
      timeout: 5000,
    });

    const navLabels = ["Servers", "Clusters", "Backups", "Logs", "Settings"];
    for (const label of navLabels) {
      const btn = page.getByRole("button", { name: label, exact: true }).first();
      assert.ok((await btn.count()) > 0, `Missing sidebar nav: ${label}`);
    }

    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.equal(
      await page.getByText("Preferences that apply to the whole app").count(),
      0,
      "Settings must not use a restating page subtitle",
    );

    succeeded = true;
    console.log("E2E_OK");
    console.log(`UI_H1=${h1}`);
    console.log(`E2E_PROFILE=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_SMOKE_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
    } else {
      console.error(`E2E_SMOKE_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_SMOKE_FIXTURE ${fixtureName}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
