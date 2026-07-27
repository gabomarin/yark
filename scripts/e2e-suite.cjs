const assert = require("node:assert/strict");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

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
  const card = page.locator("[data-server-card]", {
    has: page.getByText(name, { exact: true }),
  }).first();
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

  // Create flow opens workspace onboarding; dismiss, then return to overview.
  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }

  const backToServers = page.getByRole("button", { name: /Back to servers/i });
  await backToServers.first().waitFor({ state: "visible", timeout: 10000 });
  await backToServers.first().click();

  await page.locator("[data-overview-page]").waitFor({
    state: "visible",
    timeout: 15000,
  });

  return await waitForCardByName(page, serverName);
}

async function cloneServer(page, serverName) {
  const card = await waitForCardByName(page, serverName);
  await card.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Clone" }).click();

  const cloneNamePrefix = `${serverName} (copy`;
  const escapedPrefix = cloneNamePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cloneCard = page.locator("[data-server-card]", {
    has: page.getByText(new RegExp(`^${escapedPrefix}`)),
  }).first();
  await cloneCard.waitFor({ state: "visible", timeout: 10000 });

  const cloneName = await cloneCard.getAttribute("data-server-name");
  assert.ok(cloneName !== null && cloneName.includes("(copy"));

  return cloneName;
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const runId = uniqueSuffix();
  const serverName = `E2E-${runId}`;
  let cloneName = null;

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

    await removeServerIfPresent(page, serverName);

    const ports = {
      game: 20000 + Math.floor(Math.random() * 1000),
      query: 21000 + Math.floor(Math.random() * 1000),
      rcon: 22000 + Math.floor(Math.random() * 1000),
    };
    const installDir = `C:\\asa-e2e\\${runId}`;

    await createServer(page, serverName, installDir, ports);
    cloneName = await cloneServer(page, serverName);

    // Shell navigation smoke across main routes
    for (const label of ["Clusters", "Backups", "Logs", "Settings", "Servers"]) {
      await page.getByRole("button", { name: label, exact: true }).first().click();
      await page.waitForTimeout(250);
    }
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });

    await removeServerIfPresent(page, serverName);
    if (cloneName !== null) {
      await removeServerIfPresent(page, cloneName);
    }

    console.log("E2E_SUITE_OK");
    console.log(`E2E_CREATED_SERVER=${serverName}`);
    if (cloneName !== null) {
      console.log(`E2E_CLONED_SERVER=${cloneName}`);
    }
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("E2E_SUITE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
