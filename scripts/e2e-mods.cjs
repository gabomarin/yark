/**
 * E2E: Server Workspace Mods tab (add Project ID, enable/disable, cleanup).
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
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

function envOr(name, fallback) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

const DEMO_MOD_ID = envOr("E2E_MODS_ID", "947033");
const INSTALL_ROOT = envOr(
  "E2E_MODS_INSTALL_ROOT",
  process.platform === "win32" ? "C:\\asa-e2e" : path.join(os.tmpdir(), "asa-e2e"),
);

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

async function createServer(page, serverName, installDir, ports) {
  await page.getByRole("button", { name: "New server" }).click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  await page.getByRole("textbox", { name: /^Name$/ }).fill(serverName);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(`Session ${serverName}`);
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

  const runId = uniqueSuffix();
  const serverName = `E2E-Mods-${runId}`;
  console.log(`E2E_MODS_START server=${serverName} modId=${DEMO_MOD_ID} root=${INSTALL_ROOT}`);

  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
  });

  try {
    const page = await app.firstWindow();
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: "Servers", exact: true }).first().click();
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });

    await removeServerIfPresent(page, serverName);

    const ports = {
      game: 23000 + Math.floor(Math.random() * 1000),
      query: 24000 + Math.floor(Math.random() * 1000),
      rcon: 25000 + Math.floor(Math.random() * 1000),
    };
    const installDir = path.join(INSTALL_ROOT, runId);

    await createServer(page, serverName, installDir, ports);
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
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("E2E_MODS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
