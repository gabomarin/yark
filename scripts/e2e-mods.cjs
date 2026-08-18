/**
 * E2E: Server Workspace Mods tab (add Project ID, enable/disable, cleanup).
 *
 * Isolates SQLite + install dirs via `createE2eFixtureRoots` /
 * `launchElectronApp` (`cwd` is the repo root; `YARK_E2E_USER_DATA` skips
 * splash and the first-run wizard). Default install parent is
 * `C:\asa-e2e\servers\mods-*` on Windows (`os.tmpdir()/yark-e2e/...` elsewhere).
 *
 * Usage: node scripts/e2e-mods.cjs
 * Requires: prior `npm run build`, Playwright as a project `devDependency`, Windows GUI preferred.
 * Unset ELECTRON_RUN_AS_NODE before running.
 *
 * Env (optional):
 *   E2E_MODS_ID              CurseForge Project ID to add (default 947033)
 *   E2E_MODS_INSTALL_ROOT    parent folder for the temporary server install path
 */
const assert = require("node:assert/strict");
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

function envOr(name, fallback) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

const DEMO_MOD_ID = envOr("E2E_MODS_ID", "947033");

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

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

  await page.getByRole("tab", { name: "Mods" }).waitFor({ state: "visible", timeout: 15000 });
}

async function openModsTab(page) {
  const modsTab = page.getByRole("tab", { name: "Mods" });
  await modsTab.click();
  await page.getByRole("heading", { name: "Mods", exact: true, level: 3 }).waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function clickModSwitch(page, ariaPrefix) {
  const switchInput = page.getByRole("switch", { name: new RegExp(`^${ariaPrefix} `, "i") }).first();
  await switchInput.waitFor({ state: "attached", timeout: 10000 });
  await switchInput.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" });
    el.click();
  });
  return switchInput;
}

async function waitForModSwitchChecked(page, ariaPrefix, checked) {
  await page.waitForFunction(
    ({ prefix, wantChecked }) => {
      const nodes = [
        ...document.querySelectorAll('input[role="switch"][aria-label]'),
      ];
      const match = nodes.find((el) =>
        (el.getAttribute("aria-label") ?? "")
          .toLowerCase()
          .startsWith(prefix.toLowerCase()),
      );
      return match instanceof HTMLInputElement && match.checked === wantChecked;
    },
    { prefix: `${ariaPrefix} `, wantChecked: checked },
    { timeout: 10000 },
  );
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const { profileDir, serversDir } = createE2eFixtureRoots("mods");
  const runId = uniqueSuffix();
  const serverName = `E2E-Mods-${runId}`;
  const installDir = envOr("E2E_MODS_INSTALL_ROOT", serversDir);
  console.log(`E2E_MODS_START server=${serverName} modId=${DEMO_MOD_ID} root=${installDir}`);

  let app = null;
  let succeeded = false;
  try {
    app = await launchElectronApp({ profileDir });
    const page = await waitForOverview(app);
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.getByRole("button", { name: "Servers", exact: true }).first().click();
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });

    await removeServerIfPresent(page, serverName);

    const ports = {
      game: 23000 + Math.floor(Math.random() * 1000),
      query: 24000 + Math.floor(Math.random() * 1000),
      rcon: 25000 + Math.floor(Math.random() * 1000),
    };

    await createServer(app, page, serverName, path.join(installDir, runId), ports);
    await openModsTab(page);

    const addInput = page.getByLabel("Add CurseForge Project ID or mod URL");
    await addInput.fill(DEMO_MOD_ID);
    await page.getByRole("button", { name: "Add mod" }).click();

    try {
      await page.getByText(DEMO_MOD_ID, { exact: true }).first().waitFor({
        state: "visible",
        timeout: 30000,
      });
    } catch (error) {
      throw new Error(
        `Mod ${DEMO_MOD_ID} did not appear after Add mod (Worker/network?). ${error?.message ?? error}`,
      );
    }

    // Enable/disable: assert the control exists, toggle both ways, assert final states.
    const modSwitch = page.getByRole("switch", { name: /^(Disable|Enable) /i }).first();
    await modSwitch.waitFor({ state: "attached", timeout: 10000 });
    console.log("E2E_MODS_SWITCH_ATTACHED");

    const initiallyEnabled = await modSwitch.isChecked();
    if (initiallyEnabled) {
      await clickModSwitch(page, "Disable");
      await waitForModSwitchChecked(page, "Enable", false);
      assert.equal(
        await page.getByRole("switch", { name: /^Enable /i }).first().isChecked(),
        false,
      );
      await clickModSwitch(page, "Enable");
      await waitForModSwitchChecked(page, "Disable", true);
      assert.equal(
        await page.getByRole("switch", { name: /^Disable /i }).first().isChecked(),
        true,
      );
    } else {
      await clickModSwitch(page, "Enable");
      await waitForModSwitchChecked(page, "Disable", true);
      assert.equal(
        await page.getByRole("switch", { name: /^Disable /i }).first().isChecked(),
        true,
      );
      await clickModSwitch(page, "Disable");
      await waitForModSwitchChecked(page, "Enable", false);
      assert.equal(
        await page.getByRole("switch", { name: /^Enable /i }).first().isChecked(),
        false,
      );
    }

    await leaveWorkspaceToServers(page, 10000);
    await removeServerIfPresent(page, serverName);

    console.log("E2E_MODS_OK");
    console.log(`E2E_MODS_SERVER=${serverName}`);
    console.log(`E2E_MODS_ID=${DEMO_MOD_ID}`);
    succeeded = true;
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_MODS_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
    } else {
      console.error(`E2E_MODS_PROFILE_PRESERVED ${profileDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_MODS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
