/**
 * E2E by user personas (beginner and experienced)
 * + baseline visual checks at 1280x720, 1920x1080, and 2560x1440.
 *
 * Usage: npm run build && npm run e2e:personas
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");
const {
  createE2eFixtureRoots,
  launchElectronApp,
  pickPathField,
  quitElectronApp,
  removeFixtureDir,
  waitForOverview,
} = require("./e2e-launch.cjs");

const viewports = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

async function waitOverviewReady(page) {
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-overview-content]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-server-list]").waitFor({ state: "visible", timeout: 10000 });
}

async function goToOverview(page) {
  const nav = page.getByRole("button", { name: "Servers" });
  if ((await nav.count()) > 0) {
    await nav.first().click();
  }
  await waitOverviewReady(page);
}

async function setViewportAndCapture(page, outDir, label, size) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await waitOverviewReady(page);
  const shot = path.join(outDir, `${label}-${size.name}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  return shot;
}

async function createServerAsBeginner(app, page, name, baseDir, ports) {
  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({ timeout: 10000 });

  await page.getByRole("textbox", { name: /^Name$/ }).fill(name);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(`Session ${name}`);
  await pickPathField(app, page, "Base folder", baseDir);
  await page.getByLabel("Game port").fill(String(ports.game));
  await page.getByLabel("Query port").fill(String(ports.query));
  await page.getByLabel("RCON port").fill(String(ports.rcon));
  await page.locator("input[type='password']").last().fill("admin1234");

  await page.getByRole("button", { name: "Create server" }).first().click();

  // Create opens workspace onboarding; dismiss, then return to overview.
  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }

  await leaveWorkspaceToServers(page);

  await waitOverviewReady(page);
  await page.getByText(name).first().waitFor({ timeout: 15000 });
  await page.getByText(/need(s)? attention/i).first().waitFor({ timeout: 10000 });
}

async function openWorkspaceAndAssistant(page, serverName) {
  await page
    .getByRole("button", { name: `Open settings for ${serverName}` })
    .first()
    .click();

  await page.getByRole("tab", { name: "Server" }).waitFor({ timeout: 10000 });
  await page.getByRole("tab", { name: "INI Files" }).waitFor({ timeout: 10000 });
  await page.getByRole("tab", { name: "Mods" }).waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: "Configuration wizard" }).click();
  await page.getByText("Configuration wizard").first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Cancel" }).first().click();

  await page.getByRole("button", { name: "Configuration wizard" }).waitFor({ timeout: 10000 });
}

async function runExperiencedFlow(page, serverName) {
  await leaveWorkspaceToServers(page);

  const search = page.getByRole("textbox", { name: "Search servers" });
  await search.fill(serverName);
  await page.getByText(serverName).first().waitFor({ timeout: 10000 });

  const card = page.locator("[data-server-card]", {
    has: page.getByText(serverName, { exact: true }),
  }).first();
  await card.waitFor({ state: "visible", timeout: 10000 });

  await card.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Clone" }).click();

  const dialog = page.getByRole("dialog", { name: /Clone server/i });
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  const expectedCloneName = `${serverName}-copy`;
  const nameField = dialog.getByRole("textbox", { name: /Server name/i });
  await nameField.waitFor({ state: "visible", timeout: 10_000 });
  assert.equal((await nameField.inputValue()).trim(), expectedCloneName);
  await dialog.getByRole("button", { name: "Clone server" }).click();
  await dialog.waitFor({ state: "hidden", timeout: 15_000 });

  const cloneTitle = page.locator("[data-server-card]", {
    has: page.getByText(expectedCloneName, { exact: true }),
  }).first();
  await cloneTitle.waitFor({ state: "visible", timeout: 15_000 });
  const cloneName =
    (await cloneTitle.getAttribute("data-server-name"))?.trim() ?? expectedCloneName;
  assert.equal(cloneName, expectedCloneName);

  // Experienced-user navigation through operational sections.
  await page.getByRole("button", { name: "Logs" }).first().click();
  await page.getByRole("heading", { name: "Logs" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByRole("heading", { name: "Settings" }).waitFor({ timeout: 10000 });
  assert.equal(
    await page.getByText("Preferences that apply to the whole app").count(),
    0,
    "Settings must not use a restating page subtitle",
  );
  await page.getByRole("button", { name: "Servers" }).first().click();
  await waitOverviewReady(page);

  await search.fill(cloneName);
  const cloneCard = page.locator("[data-server-card]", {
    has: page.getByText(cloneName, { exact: true }),
  }).first();
  await cloneCard.waitFor({ state: "visible", timeout: 10000 });

  await cloneCard.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Delete server" }).click();
  await page.getByRole("radio", { name: "Delete everything" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();

  await cloneCard.waitFor({ state: "detached", timeout: 15000 });

  return cloneName;
}

async function deleteServerIfPresent(page, serverName) {
  await goToOverview(page);

  // Empty Overview has no search toolbar — nothing to clean up.
  const search = page.getByRole("textbox", { name: "Search servers" });
  if ((await search.count()) === 0) {
    return;
  }
  await search.fill(serverName);

  const card = page.locator("[data-server-card]", {
    has: page.getByText(serverName, { exact: true }),
  }).first();

  if ((await card.count()) === 0) {
    await search.fill("");
    return;
  }

  await card.waitFor({ state: "visible", timeout: 5000 });
  await card.getByRole("button", { name: "More options" }).click();
  const deleteAction = page.getByRole("menuitem", { name: "Delete server" });
  if ((await deleteAction.count()) > 0) {
    await deleteAction.click();
    await page.getByRole("radio", { name: "Delete everything" }).click();
    await page.getByRole("button", { name: "Delete everything" }).click();
    await card.waitFor({ state: "detached", timeout: 15000 });
  }

  // Deleting the last server removes the search toolbar.
  if ((await search.count()) > 0 && (await search.isVisible().catch(() => false))) {
    await search.fill("");
  }
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-e2e-personas");
  fs.mkdirSync(outDir, { recursive: true });

  const fixtures = createE2eFixtureRoots("personas");
  const runId = fixtures.runId;
  const beginnerServerName = `Beginner-${runId}`;
  const beginnerBaseDir = fixtures.serversDir;
  const beginnerPorts = {
    game: 23000 + Math.floor(Math.random() * 1000),
    query: 24000 + Math.floor(Math.random() * 1000),
    rcon: 25000 + Math.floor(Math.random() * 1000),
  };

  console.log(`E2E_BEGINNER_PORTS=${JSON.stringify(beginnerPorts)}`);
  console.log(`E2E_PROFILE=${fixtures.profileDir}`);

  const app = await launchElectronApp({ profileDir: fixtures.profileDir });
  const page = await waitForOverview(app);
  const errors = [];
  const artifacts = [];
  let cloneName = null;

  try {
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      errors.push(`pageerror: ${error.message}`);
    });
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // Prior cleanup in case a previous run left leftovers.
    await deleteServerIfPresent(page, beginnerServerName);

    // Baseline visual pass per protocol (Overview) before actions.
    for (const vp of viewports) {
      const shot = await setViewportAndCapture(page, outDir, "overview-initial", vp);
      artifacts.push(shot);
    }

    // Beginner persona.
    await createServerAsBeginner(app, page, beginnerServerName, beginnerBaseDir, beginnerPorts);
    await openWorkspaceAndAssistant(page, beginnerServerName);

    // Experienced persona.
    cloneName = await runExperiencedFlow(page, beginnerServerName);

    // Final captures at required viewports.
    for (const vp of viewports) {
      const shot = await setViewportAndCapture(page, outDir, "overview-final", vp);
      artifacts.push(shot);
    }

    // Final cleanup: remove the beginner-created server.
    await deleteServerIfPresent(page, beginnerServerName);

    if (errors.length > 0) {
      throw new Error(`UI errors detected:\n${errors.join("\n")}`);
    }

    console.log("E2E_PERSONAS_OK");
    console.log(`ARTIFACTS_DIR=${outDir}`);
    for (const artifact of artifacts) {
      console.log(`ARTIFACT=${artifact}`);
    }
    if (cloneName !== null) {
      console.log(`E2E_CLONED_SERVER=${cloneName}`);
    }
  } finally {
    await quitElectronApp(app);
    removeFixtureDir(fixtures.profileDir);
    removeFixtureDir(fixtures.serversDir);
  }
}

run().catch((error) => {
  console.error("E2E_PERSONAS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
