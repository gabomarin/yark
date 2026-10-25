/**
 * E2E: Create and restore a world backup of a disposable fake save.
 *
 * Usage: npm run build && npm run e2e:backup-restore
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createE2eFixtureRoots,
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  openWorkspaceTab,
  removeFixtureDir,
} = require("./e2e-launch.cjs");
const {
  MAP_TOKEN,
  createServer,
  openServerFromOverview,
  leaveWorkspaceToServers,
  uniquePorts,
  resolvedInstallDir,
  worldArkPath,
  writeText,
  seedReadyInstall,
  pageErrorFilter,
} = require("./e2e-server-fixture.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const MARKER_A = "E2E-WORLD-A\n";
const MARKER_B = "E2E-WORLD-B\n";

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Backup restore E2E requires Windows paths");

  const { profileDir, serversDir, runId } = createE2eFixtureRoots("backup-restore");
  const serverName = `E2E-Bak-${runId}`;
  const installDir = path.join(serversDir, "base");
  const serverDir = resolvedInstallDir(installDir, serverName);
  const arkPath = worldArkPath(serverDir, MAP_TOKEN);

  let app = null;
  let succeeded = false;
  const pageErrors = [];

  try {
    app = await launchElectronApp({ profileDir });
    const page = await waitForOverview(app);
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await page.setViewportSize({ width: 1600, height: 1000 });

    await createServer(app, page, serverName, installDir, uniquePorts());
    await leaveWorkspaceToServers(page);
    seedReadyInstall(serverDir);
    writeText(arkPath, MARKER_A);
    await page.getByRole("button", { name: "Check Servers Health" }).click();
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find((node) =>
          /servers health/i.test(node.textContent ?? ""),
        );
        return (
          button instanceof HTMLButtonElement &&
          !button.disabled &&
          button.textContent?.trim() === "Check Servers Health"
        );
      },
      null,
      { timeout: 20000 },
    );
    await openServerFromOverview(page, serverName);
    await openWorkspaceTab(page, "Backups");
    await page.locator("[data-backup-list]").waitFor({ state: "visible", timeout: 15000 });
    const lock = page.locator("[data-backup-install-lock]");
    if ((await lock.count()) > 0 && (await lock.first().isVisible())) {
      throw new Error(`Backup create stayed locked: ${await lock.first().innerText()}`);
    }
    const create = page.getByRole("button", { name: "Backup now" });
    await create.waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find(
          (node) => node.textContent?.trim() === "Backup now",
        );
        return button instanceof HTMLButtonElement && !button.disabled;
      },
      null,
      { timeout: 20000 },
    );
    await create.click();
    const row = page.locator("[data-backup-row]").first();
    await row.waitFor({ state: "visible", timeout: 30000 });
    const backupId = await row.getAttribute("data-backup-id");
    assert.ok(backupId, "World backup row is missing data-backup-id");

    writeText(arkPath, MARKER_B);
    await page.getByRole("button", { name: `Restore backup ${backupId}` }).click();
    const dialog = page.getByRole("dialog", { name: "Restore backup?" });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    const profiles = dialog.getByRole("checkbox", { name: "Restore player profiles / tribes" });
    if (await profiles.isChecked()) {
      await profiles.click();
    }
    await dialog.getByRole("button", { name: "Restore", exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 30000 });

    const started = Date.now();
    let last = "";
    while (Date.now() - started < 20000) {
      last = fs.readFileSync(arkPath, "utf8");
      if (last === MARKER_A) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(last, MARKER_A);

    assert.deepEqual(pageErrorFilter(pageErrors), []);
    succeeded = true;
    console.log("E2E_BACKUP_RESTORE_OK");
    console.log(`E2E_BACKUP_ID=${backupId}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_BACKUP_RESTORE_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
    } else {
      console.error(`E2E_BACKUP_RESTORE_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_BACKUP_RESTORE_SERVERS_PRESERVED ${serversDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_BACKUP_RESTORE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
