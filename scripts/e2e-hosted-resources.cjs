/**
 * E2E: Create a Hosted Resource and save its URL into BanListURL.
 *
 * Usage: npm run build && npm run e2e:hosted-resources
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
  createServer,
  openServerFromOverview,
  leaveWorkspaceToServers,
  uniquePorts,
  resolvedInstallDir,
  gameUserSettingsPath,
  clickIniSave,
  waitForFileText,
  pageErrorFilter,
} = require("./e2e-server-fixture.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const RESOURCE_NAME = "E2E ban list";

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Hosted Resources E2E requires Windows paths");

  const { profileDir, serversDir, runId } = createE2eFixtureRoots("hosted-resources");
  const serverName = `E2E-Host-${runId}`;
  const installDir = path.join(serversDir, "base");
  const ports = uniquePorts();
  const gusPath = gameUserSettingsPath(resolvedInstallDir(installDir, serverName));

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

    await createServer(app, page, serverName, installDir, ports);
    await leaveWorkspaceToServers(page);
    const existing = fs.readFileSync(gusPath, "utf8");
    const withMarker = /^MatingIntervalMultiplier=/m.test(existing)
      ? existing
      : `${existing.replace(/\s*$/, "")}\nMatingIntervalMultiplier=2.5\n`;
    fs.writeFileSync(gusPath, withMarker);

    await page.getByRole("button", { name: "Hosted Resources", exact: true }).first().click();
    await page.locator("[data-hosted-resources-page]").waitFor({ state: "visible", timeout: 15000 });
    const enabled = page.getByRole("switch", { name: "Enabled" });
    await enabled.waitFor({ state: "visible", timeout: 10000 });
    if (!(await enabled.isChecked())) {
      await enabled.click();
    }
    await page.getByText("Hosted Resources is enabled").waitFor({ state: "visible", timeout: 10000 });

    await page.getByRole("button", { name: "New resource" }).click();
    const dialog = page.getByRole("dialog", { name: "Create hosted resource" });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await dialog.getByLabel("Display name").fill(`${RESOURCE_NAME} ${runId}`);
    await dialog.getByLabel("Type").click();
    await page.getByRole("option", { name: "Ban list", exact: true }).click();
    await dialog.getByLabel("Resource content").fill("E2E-BAN-1\n");
    await dialog.getByRole("button", { name: "Create resource" }).click();
    await dialog.waitFor({ state: "hidden", timeout: 20000 });
    await page.getByText(`${RESOURCE_NAME} ${runId}`).first().waitFor({ state: "visible", timeout: 15000 });

    await page.getByRole("button", { name: "Servers", exact: true }).first().click();
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
    await openServerFromOverview(page, serverName);
    await openWorkspaceTab(page, "INI Files");
    await page.locator("[data-configuration-editor]").waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("textbox", { name: "Search settings" }).fill("BanListURL");
    const choose = page.getByRole("button", { name: "Choose a YARK Hosted Resource" });
    await choose.waitFor({ state: "visible", timeout: 15000 });
    await choose.click();
    await page.getByRole("option", { name: `${RESOURCE_NAME} ${runId}` }).click();
    await clickIniSave(page);

    const text = await waitForFileText(
      gusPath,
      (value) =>
        value.includes("BanListURL=") && value.includes("/r/") && value.includes("MatingIntervalMultiplier=2.5"),
    );
    assert.match(text, /BanListURL=.*\/r\//);
    assert.match(text, /MatingIntervalMultiplier=2\.5/);

    assert.deepEqual(pageErrorFilter(pageErrors), []);
    succeeded = true;
    console.log("E2E_HOSTED_RESOURCES_OK");
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_HOSTED_RESOURCES_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
    } else {
      console.error(`E2E_HOSTED_RESOURCES_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_HOSTED_RESOURCES_SERVERS_PRESERVED ${serversDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_HOSTED_RESOURCES_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
