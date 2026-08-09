/**
 * E2E: Clusters create / add / remove membership (#41 + #42).
 *
 * Usage (Windows GUI):
 *   npm run build
 *   npm run e2e:clusters-membership
 *
 * Isolates SQLite via YARK_E2E_USER_DATA under os.tmpdir().
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");
const profilesRoot = path.join(os.tmpdir(), "yark-e2e-profiles");
const fixtureName = `clusters-membership-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const profileDir = path.join(profilesRoot, fixtureName);
const serversRoot = path.join(os.tmpdir(), "yark-e2e-servers", fixtureName);
const clusterShareDir = path.join(serversRoot, "cluster-share");

function assertFixturePath(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  assert.ok(
    resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`),
    `Refusing to use path outside fixture root: ${resolvedTarget}`,
  );
}

function uniquePorts(offset) {
  const base = 23000 + (offset % 400) * 10 + Math.floor(Math.random() * 5);
  return { game: base, query: base + 1, rcon: base + 2 };
}

async function launchApp() {
  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env: { ...process.env, YARK_E2E_USER_DATA: profileDir },
  });
}

async function quitApp(app) {
  const proc = app.process();
  const exited =
    proc == null || proc.exitCode != null
      ? Promise.resolve()
      : new Promise((resolve) => proc.once("exit", resolve));
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Electron did not quit within 20 seconds")), 20_000),
    ),
  ]);
}

async function stubFolderPicker(app, folderPath) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [chosen],
    });
  }, folderPath);
}

async function dismissOnboarding(page) {
  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }
  await leaveWorkspaceToServers(page);
}

async function createServer(page, name, installDir, ports) {
  fs.mkdirSync(installDir, { recursive: true });
  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("textbox", { name: /^Name$/ }).fill(name);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(`Session ${name}`);
  const baseFolder = page.getByRole("textbox", { name: /^Base folder$/ });
  if ((await baseFolder.count()) > 0) {
    await baseFolder.fill(installDir);
  } else {
    await page.getByPlaceholder("C:\\ark_servers").fill(installDir);
  }
  await page.getByLabel("Game port").fill(String(ports.game));
  await page.getByLabel("Query port").fill(String(ports.query));
  await page.getByLabel("RCON port").fill(String(ports.rcon));
  await page.locator("input[type='password']").last().fill("admin1234");
  await page.getByRole("button", { name: "Save" }).click();
  await dismissOnboarding(page);
  await page
    .locator("[data-server-card]", { has: page.getByText(name, { exact: true }) })
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
}

async function goNav(page, label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(300);
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Clusters membership E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(path.dirname(serversRoot), serversRoot);

  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(clusterShareDir, { recursive: true });

  const runId = `${Date.now().toString(36)}`;
  const nameA = `E2E-Clust-A-${runId}`;
  const nameB = `E2E-Clust-B-${runId}`;
  const nameC = `E2E-Clust-C-${runId}`;
  const clusterId = `e2e-cluster-${runId}`;

  let app = null;
  let succeeded = false;
  const errors = [];

  try {
    app = await launchApp();
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.waitForLoadState("domcontentloaded");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 20000 });

    await createServer(page, nameA, path.join(serversRoot, "a"), uniquePorts(1));
    await createServer(page, nameB, path.join(serversRoot, "b"), uniquePorts(2));
    await createServer(page, nameC, path.join(serversRoot, "c"), uniquePorts(3));

    // --- Create cluster (#42) with A + B ---
    await goNav(page, "Clusters");
    await page.locator("[data-clusters-page]").waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: /create cluster/i }).first().click();
    const createDialog = page.getByRole("dialog", { name: /create cluster/i });
    await createDialog.waitFor({ state: "visible", timeout: 10000 });

    // Toggle A and B in (first eligible may already be selected).
    for (const name of [nameA, nameB]) {
      const row = createDialog.getByRole("button", { name: new RegExp(name, "i") });
      if ((await row.count()) > 0) {
        const pressed = await row.first().getAttribute("aria-pressed");
        if (pressed !== "true") {
          await row.first().click();
        }
      }
    }
    assert.match(
      (await createDialog.textContent()) ?? "",
      /2 selected/i,
      "Create cluster should show 2 selected servers",
    );

    await createDialog.getByRole("button", { name: /continue/i }).click();
    const idInput = createDialog.getByLabel(/cluster id/i);
    await idInput.clear();
    await idInput.fill(clusterId);
    await stubFolderPicker(app, clusterShareDir);
    await createDialog.getByRole("button", { name: /browse/i }).click();
    await createDialog.getByText(clusterShareDir, { exact: false }).waitFor({
      state: "visible",
      timeout: 5000,
    });
    await createDialog.getByRole("button", { name: /continue/i }).click();
    await createDialog.getByRole("button", { name: /^create cluster$/i }).click();
    await createDialog.waitFor({ state: "hidden", timeout: 20000 });

    await page.locator(`[data-cluster-detail="${clusterId}"]`).waitFor({
      state: "visible",
      timeout: 15000,
    });
    assert.ok(
      await page.getByText(nameA, { exact: true }).first().isVisible(),
      "Cluster detail lists server A",
    );
    assert.ok(
      await page.getByText(nameB, { exact: true }).first().isVisible(),
      "Cluster detail lists server B",
    );

    // --- Add C (#41) ---
    await page.getByRole("button", { name: /add servers/i }).click();
    const addDialog = page.getByRole("dialog", { name: new RegExp(`add servers to ${clusterId}`, "i") });
    await addDialog.waitFor({ state: "visible", timeout: 10000 });
    const cRow = addDialog.getByRole("button", { name: new RegExp(nameC, "i") });
    await cRow.first().waitFor({ state: "visible", timeout: 5000 });
    const cPressed = await cRow.first().getAttribute("aria-pressed");
    if (cPressed !== "true") {
      await cRow.first().click();
    }
    assert.match(
      (await addDialog.textContent()) ?? "",
      /1 selected/i,
      "Add servers should have C selected",
    );
    await addDialog.getByRole("button", { name: /continue/i }).click();
    await addDialog.getByRole("button", { name: /add to cluster/i }).click();
    await addDialog.waitFor({ state: "hidden", timeout: 20000 });

    await page.getByText(nameC, { exact: true }).first().waitFor({
      state: "visible",
      timeout: 15000,
    });

    // --- Remove C (#41) ---
    const detail = page.locator(`[data-cluster-detail="${clusterId}"]`);
    const cMemberRow = detail.locator("[class*='memberRow']", {
      has: page.getByText(nameC, { exact: true }),
    });
    await cMemberRow.getByRole("button", { name: /^remove /i }).click();
    const removeDialog = page.getByRole("dialog", {
      name: new RegExp(`remove from ${clusterId}`, "i"),
    });
    await removeDialog.waitFor({ state: "visible", timeout: 10000 });
    await removeDialog.getByRole("button", { name: /remove from cluster/i }).click();
    await removeDialog.waitFor({ state: "hidden", timeout: 20000 });

    await page.waitForTimeout(500);
    assert.equal(
      await detail.getByText(nameC, { exact: true }).count(),
      0,
      "Removed server should leave the cluster detail list",
    );
    assert.ok(
      await detail.getByText(nameA, { exact: true }).first().isVisible(),
      "Server A remains in the cluster",
    );

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_|dbus|GPU process/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log("E2E_CLUSTERS_MEMBERSHIP_OK");
    console.log(`E2E_CLUSTER_ID=${clusterId}`);
    console.log(`E2E_PROFILE=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitApp(app);
      } catch (error) {
        console.warn(`E2E_CLUSTERS_MEMBERSHIP_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      assertFixturePath(profilesRoot, profileDir);
      assertFixturePath(path.dirname(serversRoot), serversRoot);
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(serversRoot, { recursive: true, force: true });
    } else {
      console.error(`E2E_CLUSTERS_MEMBERSHIP_PROFILE_PRESERVED ${profileDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_CLUSTERS_MEMBERSHIP_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
