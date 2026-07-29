/**
 * E2E: Server Workspace Mods tab (add Project ID, enable/disable, cleanup).
 *
 * Usage: node scripts/e2e-mods.cjs
 * Requires: prior npm run build
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const DEMO_MOD_ID = "947033";

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function waitForCardByName(page, name, timeout = 15000) {
  const card = page.locator("[data-server-card]", {
    has: page.getByText(name, { exact: true }),
  });
  await card.first().waitFor({ state: "visible", timeout });
  return card.first();
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

  await card.getByRole("button", { name: "More options" }).click();
  const deleteAction = page.getByRole("menuitem", { name: "Delete server" });
  if ((await deleteAction.count()) === 0) {
    await page.keyboard.press("Escape");
    return;
  }

  await deleteAction.click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await card.waitFor({ state: "detached", timeout: 15000 });
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

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const runId = uniqueSuffix();
  const serverName = `E2E-Mods-${runId}`;

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
    const installDir = `C:\\asa-e2e\\${runId}`;

    await createServer(page, serverName, installDir, ports);
    await openModsTab(page);

    const addInput = page.getByLabel("Add CurseForge Project ID or mod URL");
    await addInput.fill(DEMO_MOD_ID);
    await page.getByRole("button", { name: "Add mod" }).click();

    await page.getByText(DEMO_MOD_ID, { exact: true }).first().waitFor({
      state: "visible",
      timeout: 30000,
    });

    const disableSwitch = page.getByRole("switch", { name: /Disable /i }).first();
    await disableSwitch.waitFor({ state: "attached", timeout: 10000 });
    assert.equal(await disableSwitch.isChecked(), true);

    await disableSwitch.evaluate((el) => {
      el.scrollIntoView({ block: "center", inline: "center" });
      el.click();
    });
    const enableSwitch = page.getByRole("switch", { name: /Enable /i }).first();
    await enableSwitch.waitFor({ state: "attached", timeout: 10000 });
    // Mantine may keep the same control; wait until unchecked.
    await page.waitForFunction(() => {
      const el = document.querySelector('input[role="switch"][aria-label^="Enable "]');
      return el instanceof HTMLInputElement && !el.checked;
    }, null, { timeout: 10000 });
    assert.equal(await enableSwitch.isChecked(), false);

    await enableSwitch.evaluate((el) => {
      el.scrollIntoView({ block: "center", inline: "center" });
      el.click();
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('input[role="switch"][aria-label^="Disable "]');
      return el instanceof HTMLInputElement && el.checked;
    }, null, { timeout: 10000 });
    assert.equal(await disableSwitch.isChecked(), true);

    await page.getByLabel(/Back to servers/i).click();
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
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
