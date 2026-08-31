/**
 * E2E: Workspace Maintenance tab — Up next, restart schedule, wipe toggle, warnings Off (#489).
 *
 * Usage: npm run build && npm run e2e:maintenance
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");
const {
  createE2eFixtureRoots,
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  pickPathField,
  removeFixtureDir,
} = require("./e2e-launch.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

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

async function removeServerIfPresent(page, name) {
  const card = page
    .locator("[data-server-card]", {
      has: page.getByText(name, { exact: true }),
    })
    .first();
  if ((await card.count()) === 0) {
    return;
  }

  await dismissOpenMenus(page);
  await card.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menu").waitFor({ state: "visible", timeout: 5000 });
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

  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }

  await page.getByRole("tab", { name: "Maintenance" }).waitFor({
    state: "visible",
    timeout: 15000,
  });
}

async function clickSwitch(page, name) {
  const switchInput = page.getByRole("switch", { name });
  await switchInput.waitFor({ state: "attached", timeout: 10000 });
  await switchInput.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" });
    el.click();
  });
  return switchInput;
}

async function openMaintenanceTab(page) {
  const tab = page.getByRole("tab", { name: "Maintenance" });
  await tab.click();
  await page.locator("[data-maintenance-panel]").waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Maintenance E2E requires Windows paths");

  const { profileDir, serversDir, runId } = createE2eFixtureRoots("maintenance");
  const serverName = `E2E-Maint-${runId}`;
  const installDir = path.join(serversDir, "base");
  fs.mkdirSync(installDir, { recursive: true });

  const ports = {
    game: 26000 + Math.floor(Math.random() * 1000),
    query: 27000 + Math.floor(Math.random() * 1000),
    rcon: 28000 + Math.floor(Math.random() * 1000),
  };

  let app = null;
  let succeeded = false;
  const consoleErrors = [];
  const pageErrors = [];

  try {
    app = await launchElectronApp({ profileDir });
    const page = await waitForOverview(app);
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.getByRole("button", { name: "Servers", exact: true }).first().click();
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
    await removeServerIfPresent(page, serverName);

    await createServer(app, page, serverName, installDir, ports);
    await openMaintenanceTab(page);

    const upNext = page.locator("[data-maintenance-up-next]");
    await upNext.getByRole("heading", { name: "Nothing scheduled" }).waitFor({
      state: "visible",
      timeout: 5000,
    });
    await upNext.getByText("Wild dino wipe", { exact: true }).waitFor({
      state: "visible",
      timeout: 5000,
    });

    const restartSwitch = page.getByRole("switch", {
      name: "Enable restart schedule",
    });
    assert.equal(await restartSwitch.isChecked(), false);
    await clickSwitch(page, "Enable restart schedule");
    await page.waitForFunction(
      () => {
        const heading = document.querySelector("[data-maintenance-up-next] h2");
        return heading !== null && !heading.textContent?.includes("Nothing scheduled");
      },
      { timeout: 10000 },
    );
    await page.getByText("On these days").waitFor({ state: "visible", timeout: 10000 });

    await page.getByRole("button", { name: "Mon", exact: true }).click();
    await page.getByRole("button", { name: "Off", exact: true }).click();
    await page.getByText(/No in-game warnings before this job/i).waitFor({
      state: "visible",
      timeout: 5000,
    });

    const wipeSwitch = page.getByRole("switch", { name: "Enable wild dino wipe" });
    await clickSwitch(page, "Enable wild dino wipe");
    assert.equal(await wipeSwitch.isChecked(), true);
    await upNext.getByText("After scheduled restart").waitFor({
      state: "visible",
      timeout: 5000,
    });

    await clickSwitch(page, "Enable auto-update");
    await page.getByText(/when a new Ark server version is available/i).waitFor({
      state: "visible",
      timeout: 10000,
    });

    const runUpdateNow = page.getByRole("button", { name: "Run update now" });
    assert.equal(await runUpdateNow.isDisabled(), true);

    await leaveWorkspaceToServers(page);
    await removeServerIfPresent(page, serverName);

    const relevantPageErrors = pageErrors.filter(
      (msg) => !/ResizeObserver|Non-Error promise rejection/i.test(msg),
    );
    assert.equal(
      relevantPageErrors.length,
      0,
      `Unexpected page errors: ${relevantPageErrors.join(" | ")}`,
    );

    succeeded = true;
    console.log("E2E_MAINTENANCE_OK");
    console.log(`E2E_CREATED_SERVER=${serverName}`);
    if (consoleErrors.length > 0) {
      console.log("E2E_MAINTENANCE_WARN_CONSOLE=" + consoleErrors.slice(0, 5).join(" | "));
    }
  } finally {
    if (app !== null) {
      try {
        const page = app.windows()[0];
        if (page !== undefined) {
          page.on("dialog", async (dialog) => {
            await dialog.accept();
          });
          try {
            await leaveWorkspaceToServers(page);
            await removeServerIfPresent(page, serverName);
          } catch {
            // Best-effort cleanup.
          }
        }
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_MAINTENANCE_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
    } else {
      console.error(`E2E_MAINTENANCE_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_MAINTENANCE_SERVERS_PRESERVED ${serversDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_MAINTENANCE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
