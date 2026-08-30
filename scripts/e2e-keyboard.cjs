/**
 * Keyboard smoke: Spotlight, Overview card menu, dismissible modal (#476).
 *
 * Local (not PR CI). Isolated YARK_E2E_USER_DATA.
 *
 * Usage: npm run build && npm run e2e:keyboard
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");
const {
  projectRoot,
  createE2eFixtureRoots,
  assertUnderFixtureRoot,
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  pickPathField,
  removeFixtureDir,
} = require("./e2e-launch.cjs");

async function waitForCardByName(page, name, timeout = 15000) {
  const card = page.locator("[data-server-card]", {
    has: page.getByText(name, { exact: true }),
  });
  await card.first().waitFor({ state: "visible", timeout });
  return card.first();
}

async function createServer(app, page, serverName, installDir, ports) {
  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("textbox", { name: /^Name$/ }).fill(serverName);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(`Session ${serverName}`);
  await pickPathField(app, page, "Base folder", installDir);
  await page.getByLabel("Game port").fill(String(ports.game));
  await page.getByLabel("Query port").fill(String(ports.query));
  await page.getByLabel("RCON port").fill(String(ports.rcon));
  await page.locator("input[type='password']").last().fill("admin1234");
  await page.getByRole("button", { name: "Create server" }).click();
  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }
  await leaveWorkspaceToServers(page);
  return waitForCardByName(page, serverName);
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Keyboard E2E requires Windows paths");

  const { profileDir, serversDir, runId, root } =
    createE2eFixtureRoots("keyboard");
  assertUnderFixtureRoot(path.join(root, "profiles"), profileDir);
  assertUnderFixtureRoot(path.join(root, "servers"), serversDir);

  const serverName = `KB-${runId}`;
  let app = null;
  let succeeded = false;

  try {
    app = await launchElectronApp({ profileDir });
    const page = await waitForOverview(app);
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.keyboard.press("Control+K");
    await page.getByLabel("Quick jump search").waitFor({
      state: "visible",
      timeout: 8000,
    });
    await page.keyboard.press("Escape");
    await page.getByLabel("Quick jump search").waitFor({
      state: "hidden",
      timeout: 5000,
    });

    const ports = {
      game: 22000 + (process.pid % 700),
      query: 23000 + (process.pid % 700),
      rcon: 24000 + (process.pid % 700),
    };
    const installDir = path.join(serversDir, "kb-install");
    const card = await createServer(app, page, serverName, installDir, ports);

    await card.focus();
    await page.keyboard.press("Shift+F10");
    await page.getByRole("menu").waitFor({ state: "visible", timeout: 5000 });
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "hidden", timeout: 5000 });

    await card.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Delete server" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 8000 });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 8000 });

    succeeded = true;
    console.log("E2E_OK");
    console.log(`E2E_PROFILE=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.error("quit failed", error);
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
    } else {
      console.error(`E2E_KEEP_PROFILE ${profileDir}`);
      console.error(`E2E_KEEP_SERVERS ${serversDir}`);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
