/**
 * E2E: Save and apply cluster tribute settings without dropping an unrelated GUS key.
 *
 * Usage: npm run build && npm run e2e:cluster-tribute
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createE2eFixtureRoots,
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  stubFolderPicker,
  removeFixtureDir,
} = require("./e2e-launch.cjs");
const {
  ADMIN_PASSWORD,
  createServer,
  leaveWorkspaceToServers,
  uniquePorts,
  resolvedInstallDir,
  gameUserSettingsPath,
  writeText,
  identityGameUserSettings,
  waitForFileText,
  pageErrorFilter,
} = require("./e2e-server-fixture.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Cluster tribute E2E requires Windows paths");

  const { profileDir, serversDir, runId } = createE2eFixtureRoots("cluster-tribute");
  const serverName = `E2E-Trib-${runId}`;
  const installDir = path.join(serversDir, "base");
  const clusterShareDir = path.join(serversDir, "cluster-share");
  const clusterId = `e2e-trib-${runId}`.toLowerCase();
  const ports = uniquePorts();
  const gusPath = gameUserSettingsPath(resolvedInstallDir(installDir, serverName));
  fs.mkdirSync(clusterShareDir, { recursive: true });

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
    writeText(
      gusPath,
      identityGameUserSettings({
        sessionName: `Session ${serverName}`,
        gamePort: ports.game,
        queryPort: ports.query,
        rconPort: ports.rcon,
        adminPassword: ADMIN_PASSWORD,
        extraServerSettings: "MatingIntervalMultiplier=2.5\n",
      }),
    );

    await page.getByRole("button", { name: "Clusters", exact: true }).first().click();
    await page.locator("[data-clusters-page]").waitFor({ state: "visible", timeout: 15000 });
    await page
      .getByRole("button", { name: /create cluster/i })
      .first()
      .click();
    const createDialog = page.getByRole("dialog", { name: /create cluster/i });
    await createDialog.waitFor({ state: "visible", timeout: 10000 });
    const row = createDialog.getByRole("button", { name: new RegExp(serverName, "i") });
    await row.first().waitFor({ state: "visible", timeout: 10000 });
    if ((await row.first().getAttribute("aria-pressed")) !== "true") {
      await row.first().click();
    }
    assert.match((await createDialog.textContent()) ?? "", /1 selected/i);
    await createDialog.getByRole("button", { name: /continue/i }).click();
    const idInput = createDialog.getByLabel(/cluster id/i);
    await idInput.clear();
    await idInput.fill(clusterId);
    await stubFolderPicker(app, clusterShareDir);
    await createDialog.getByRole("button", { name: /browse/i }).click();
    await createDialog.getByText(clusterShareDir, { exact: false }).waitFor({ state: "visible", timeout: 5000 });
    await createDialog.getByRole("button", { name: /continue/i }).click();
    await createDialog.getByRole("button", { name: /^create cluster$/i }).click();
    await createDialog.waitFor({ state: "hidden", timeout: 20000 });
    await page.locator(`[data-cluster-detail="${clusterId}"]`).waitFor({ state: "visible", timeout: 15000 });

    await page.getByRole("button", { name: "Edit transfer settings" }).click();
    const editor = page.getByRole("dialog", { name: "Edit cluster transfer settings" });
    await editor.waitFor({ state: "visible", timeout: 10000 });
    const survivors = editor.locator("#cluster-tribute-TributeCharacterExpirationSeconds");
    await survivors.waitFor({ state: "visible", timeout: 10000 });
    await survivors.fill("123456");
    await editor.getByRole("button", { name: "More save options" }).click();
    await page.getByRole("menuitem", { name: "Save and apply to servers" }).click();
    try {
      await editor.waitFor({ state: "hidden", timeout: 20000 });
    } catch (error) {
      const detail = (await editor.textContent()) ?? "";
      throw new Error(`Tribute dialog stayed open. ${detail}\n${error?.message ?? error}`);
    }

    const text = await waitForFileText(
      gusPath,
      (value) =>
        value.includes("TributeCharacterExpirationSeconds=123456") && value.includes("MatingIntervalMultiplier=2.5"),
    );
    assert.match(text, /TributeCharacterExpirationSeconds=123456/);
    assert.match(text, /MatingIntervalMultiplier=2\.5/);

    assert.deepEqual(pageErrorFilter(pageErrors), []);
    succeeded = true;
    console.log("E2E_CLUSTER_TRIBUTE_OK");
    console.log(`E2E_CLUSTER_ID=${clusterId}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_CLUSTER_TRIBUTE_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
    } else {
      console.error(`E2E_CLUSTER_TRIBUTE_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_CLUSTER_TRIBUTE_SERVERS_PRESERVED ${serversDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_CLUSTER_TRIBUTE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
