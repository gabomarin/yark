/**
 * E2E suite: create → clone → route nav → delete (#12).
 *
 * Usage: npm run build && npm run e2e
 * Isolates SQLite + install dirs under C:\asa-e2e (or tmp). Clears ELECTRON_RUN_AS_NODE.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
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

/** Close leftover Mantine menu portals so they cannot intercept the next click. */
async function dismissOpenMenus(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const openMenu = page.locator('[role="menu"]');
    if ((await openMenu.count()) === 0) {
      return;
    }
    await page.keyboard.press("Escape");
    try {
      await openMenu.first().waitFor({ state: "hidden", timeout: 1500 });
      return;
    } catch {
      // Menu still present — try Escape again.
    }
  }
}

async function openServerMoreMenu(page, card) {
  await dismissOpenMenus(page);
  await card.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menu").waitFor({ state: "visible", timeout: 5000 });
}

async function removeServerIfPresent(page, name) {
  const card = page
    .locator("[data-server-card]", {
      has: page.getByText(name, { exact: true }),
    })
    .first();
  if ((await card.count()) === 0) {
    return;
  }

  await openServerMoreMenu(page, card);
  const deleteAction = page.getByRole("menuitem", { name: "Delete server" });
  if ((await deleteAction.count()) === 0) {
    await dismissOpenMenus(page);
    return;
  }

  await deleteAction.click();
  await page.getByRole("radio", { name: "Delete everything" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await card.waitFor({ state: "detached", timeout: 15000 });
  await dismissOpenMenus(page);
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

  // Create flow opens workspace onboarding; dismiss, then return to overview.
  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }

  await leaveWorkspaceToServers(page);

  return await waitForCardByName(page, serverName);
}

async function cloneServer(page, serverName) {
  const card = await waitForCardByName(page, serverName);
  await openServerMoreMenu(page, card);
  await page.getByRole("menuitem", { name: "Clone" }).click();

  const dialog = page.getByRole("dialog", { name: /Clone server/i });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const expectedCloneName = `${serverName}-copy`;
  const nameField = dialog.getByRole("textbox", { name: /Server name/i });
  await nameField.waitFor({ state: "visible", timeout: 5000 });
  // Dialog defaults to `${source}-copy`; keep that contract explicit for the assertion.
  assert.equal((await nameField.inputValue()).trim(), expectedCloneName);
  await dialog.getByRole("button", { name: "Clone server" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 15000 });

  const cloneCard = await waitForCardByName(page, expectedCloneName, 15000);
  const cloneName = await cloneCard.getAttribute("data-server-name");
  assert.equal(cloneName, expectedCloneName);

  return cloneName;
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "CRUD E2E suite requires Windows paths");

  const { profileDir, serversDir, runId, fixtureName, root } =
    createE2eFixtureRoots("suite");
  assertUnderFixtureRoot(path.join(root, "profiles"), profileDir);
  assertUnderFixtureRoot(path.join(root, "servers"), serversDir);

  const serverName = `E2E-${runId}`;
  let cloneName = null;
  let app = null;
  let succeeded = false;

  try {
    app = await launchElectronApp({ profileDir });
    const page = await waitForOverview(app);
    await page.setViewportSize({ width: 1920, height: 1080 });

    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    const ports = {
      game: 20000 + (process.pid % 700) + Math.floor(Math.random() * 50),
      query: 21000 + (process.pid % 700) + Math.floor(Math.random() * 50),
      rcon: 22000 + (process.pid % 700) + Math.floor(Math.random() * 50),
    };
    const installDir = path.join(serversDir, "base");
    fs.mkdirSync(installDir, { recursive: true });

    await createServer(app, page, serverName, installDir, ports);
    cloneName = await cloneServer(page, serverName);

    // Shell navigation: titles stay, restating subtitles stay gone.
    await page.getByRole("button", { name: "Clusters", exact: true }).first().click();
    await page.locator("[data-clusters-page]").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(
      await page.getByText("Compatibility checks and guidance for Cluster ID").count(),
      0,
    );

    await page.getByRole("button", { name: "Backups", exact: true }).first().click();
    await page.getByRole("heading", { name: "Backups", level: 1 }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.equal(
      await page.getByText(/Backup health, disk usage, and shared destination settings/i).count(),
      0,
    );

    await page.getByRole("button", { name: "Logs", exact: true }).first().click();
    await page.getByRole("heading", { name: "Logs", level: 1 }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.equal(
      await page.getByText(/Recent problems and activity across servers/i).count(),
      0,
    );

    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.equal(
      await page.getByText("Preferences that apply to the whole app").count(),
      0,
    );

    await page.getByRole("button", { name: "Servers", exact: true }).first().click();
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(
      await page.getByText("Monitor and manage all your ARK servers").count(),
      0,
    );

    await removeServerIfPresent(page, serverName);
    if (cloneName !== null) {
      await removeServerIfPresent(page, cloneName);
    }

    succeeded = true;
    console.log("E2E_SUITE_OK");
    console.log(`E2E_CREATED_SERVER=${serverName}`);
    if (cloneName !== null) {
      console.log(`E2E_CLONED_SERVER=${cloneName}`);
    }
    console.log(`E2E_PROFILE=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_SUITE_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
    } else {
      console.error(`E2E_SUITE_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_SUITE_SERVERS_PRESERVED ${serversDir}`);
      console.error(`E2E_SUITE_FIXTURE ${fixtureName}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_SUITE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
