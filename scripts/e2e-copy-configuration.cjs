/**
 * E2E: Copy configuration (#95) — isolated one-shot A → B/C transfer.
 *
 * Creates a source server with varied INI settings, mods, and launch args,
 * creates two stopped targets, then copies selected categories to both.
 *
 * Usage (Windows GUI):
 *   npm run build
 *   npm run e2e:copy-configuration
 *
 * Isolates SQLite via YARK_E2E_USER_DATA under os.tmpdir().
 * Unset ELECTRON_RUN_AS_NODE before running.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");
const profilesRoot = path.join(os.tmpdir(), "yark-e2e-profiles");
const fixtureName = `copy-config-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const profileDir = path.join(profilesRoot, fixtureName);
const serversRoot = path.join(os.tmpdir(), "yark-e2e-servers", fixtureName);

const SOURCE_MODS = ["947033", "928988"];
const SOURCE_EXTRA_ARGS = ["-NoBattlEye", "-servergamelog"];
const SOURCE_GUS = [
  "[ServerSettings]",
  "XPMultiplier=2.5",
  "TamingSpeedMultiplier=4",
  "HarvestAmountMultiplier=3",
  "",
  "[SessionSettings]",
  "SessionName=SourceSessionShouldNotCopy",
  "",
].join("\n");
const SOURCE_GAME = [
  "[/Script/ShooterGame.ShooterGameMode]",
  "BabyMatureSpeedMultiplier=10",
  "EggHatchSpeedMultiplier=8",
  "",
].join("\n");
const TARGET_GUS = [
  "[ServerSettings]",
  "XPMultiplier=1",
  "TamingSpeedMultiplier=1",
  "",
].join("\n");

function assertFixturePath(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  assert.ok(
    resolvedTarget === resolvedRoot ||
      resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`),
    `Refusing to use path outside fixture root: ${resolvedTarget}`,
  );
}

function uniquePorts(offset) {
  const base = 24000 + (offset % 400) * 10 + Math.floor(Math.random() * 5);
  return { game: base, query: base + 1, rcon: base + 2 };
}

/** Matches `resolveServerInstallDir(baseFolder, name)` on create. */
function resolvedInstallDir(baseFolder, serverName) {
  return path.join(baseFolder, serverName);
}

function iniDir(installDir) {
  return path.join(
    installDir,
    "ShooterGame",
    "Saved",
    "Config",
    "WindowsServer",
  );
}

function writeIniPair(installDir, gus, game) {
  const dir = iniDir(installDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "GameUserSettings.ini"), gus, "utf8");
  fs.writeFileSync(path.join(dir, "Game.ini"), game, "utf8");
}

function readIni(installDir, fileName) {
  return fs.readFileSync(path.join(iniDir(installDir), fileName), "utf8");
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
      setTimeout(
        () => reject(new Error("Electron did not quit within 20 seconds")),
        20_000,
      ),
    ),
  ]);
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

async function openServerWorkspace(page, name) {
  const card = page.locator(`[data-server-card][data-server-name="${name}"]`).first();
  await card.waitFor({ state: "visible", timeout: 15000 });
  await card
    .getByRole("button", { name: new RegExp(`Open settings for ${escapeRegExp(name)}`, "i") })
    .click();
  await page.locator("[data-workspace-scroll]").waitFor({
    state: "visible",
    timeout: 15000,
  });
}

async function backToOverview(page) {
  await leaveWorkspaceToServers(page);
}

async function configureSourceProfile(page, name, installDir) {
  await openServerWorkspace(page, name);

  // Mods / Extra args live on workspace tabs (#93), not the Server form.
  await page.getByRole("tab", { name: "Mods" }).click();
  const addInput = page.getByLabel("Add CurseForge Project ID or mod URL");
  await addInput.waitFor({ state: "visible", timeout: 10000 });
  await addInput.fill(SOURCE_MODS.join(", "));
  await page.getByRole("button", { name: "Add mod" }).click();
  for (const modId of SOURCE_MODS) {
    await page.getByText(modId, { exact: true }).first().waitFor({
      state: "visible",
      timeout: 30000,
    });
  }
  // Configured mod IDs are enough for copy (new adds start disabled by design).

  await page.getByRole("tab", { name: "Launch" }).click();
  const extra = page.getByLabel(/^Extra arguments$/i);
  await extra.waitFor({ state: "visible", timeout: 10000 });
  await extra.fill(SOURCE_EXTRA_ARGS.join(" "));
  await extra.blur(); // Launch persists raw Extra arguments on blur (#93)
  await page.waitForTimeout(800);
  await backToOverview(page);

  // Persist varied INI on disk (same path the transfer service reads).
  writeIniPair(installDir, SOURCE_GUS, SOURCE_GAME);
}

async function openCopyWizardFromCard(page, sourceName) {
  // Prefer workspace Quick actions (stable button) over the overflow menu.
  await openServerWorkspace(page, sourceName);
  await page.getByRole("button", { name: "Copy configuration", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Copy configuration/i });
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  return dialog;
}

async function completeCopyWizard(page, sourceName, targetNames) {
  const wizard = await openCopyWizardFromCard(page, sourceName);

  for (const targetName of targetNames) {
    const row = wizard.getByRole("checkbox", { name: new RegExp(targetName, "i") });
    await row.first().waitFor({ state: "visible", timeout: 10000 });
    if (!(await row.first().isChecked())) {
      await row.first().click();
    }
  }
  assert.match(
    (await wizard.textContent()) ?? "",
    new RegExp(`${targetNames.length} selected`, "i"),
    "Targets step should show selected count",
  );
  await wizard.getByRole("button", { name: /^Next$/i }).click();

  // Wait for describe IPC — mods count proves source snapshot loaded.
  await wizard.getByText(/Loading source settings/i).waitFor({
    state: "hidden",
    timeout: 20000,
  }).catch(() => {});
  await wizard.getByText(/2 mods/i).waitFor({ state: "visible", timeout: 20000 });

  async function enableCategory(title) {
    const checkbox = wizard.getByRole("checkbox", {
      name: new RegExp(title.replace(".", "\\."), "i"),
    });
    await checkbox.first().waitFor({ state: "visible", timeout: 10000 });
    if (!(await checkbox.first().isChecked())) {
      await checkbox.first().click();
    }
    await checkbox.first().waitFor({ state: "attached", timeout: 5000 });
    assert.ok(
      await checkbox.first().isChecked(),
      `${title} should stay checked`,
    );
  }

  await enableCategory("GameUserSettings.ini");
  await wizard.getByText("XPMultiplier", { exact: true }).waitFor({
    state: "visible",
    timeout: 20000,
  });
  await wizard.getByText(/^[1-9]\d* selected$/i).first().waitFor({
    state: "visible",
    timeout: 10000,
  });

  await enableCategory("Game.ini");
  await enableCategory("Mods");
  await enableCategory("Launch arguments");

  // GUS must still be checked after enabling later categories.
  assert.ok(
    await wizard
      .getByRole("checkbox", { name: /GameUserSettings\.ini/i })
      .first()
      .isChecked(),
    "GUS must remain selected after enabling other categories",
  );

  const previewBtn = wizard.getByRole("button", { name: /^Preview$/i });
  await expectEnabled(previewBtn);
  await previewBtn.click();
  await wizard
    .getByText(/Overwrite selected settings/i)
    .waitFor({ state: "visible", timeout: 30000 });
  await wizard.getByText(/INI changes/i).first().waitFor({
    state: "visible",
    timeout: 10000,
  });
  const previewText = (await wizard.textContent()) ?? "";
  assert.match(
    previewText,
    /[1-9]\d* INI changes/,
    "Preview should report INI rate/breeding changes",
  );

  await wizard
    .getByRole("checkbox", { name: /Overwrite selected settings/i })
    .click();
  await wizard.getByRole("button", { name: /^Apply/i }).click();

  await wizard.getByText("Copied settings to", { exact: false }).waitFor({
    state: "visible",
    timeout: 30000,
  });

  const closeBtn = wizard.getByRole("button", {
    name: /Close and refresh/i,
  });
  await closeBtn.first().click();
  await wizard.waitFor({ state: "hidden", timeout: 15000 });
}

function assertCopiedTo(installDir, expectedSessionName) {
  const gus = readIni(installDir, "GameUserSettings.ini");
  const game = readIni(installDir, "Game.ini");
  assert.match(gus, /XPMultiplier=2\.5/, "GUS XPMultiplier should be copied");
  assert.match(
    gus,
    /TamingSpeedMultiplier=4/,
    "GUS TamingSpeedMultiplier should be copied",
  );
  assert.match(
    gus,
    /HarvestAmountMultiplier=3/,
    "GUS HarvestAmountMultiplier should be copied",
  );
  assert.match(
    gus,
    new RegExp(`SessionName=${escapeRegExp(expectedSessionName)}`),
    "Target session name must stay profile-owned",
  );
  assert.doesNotMatch(
    gus,
    /SourceSessionShouldNotCopy/,
    "Source session name must never land on the target",
  );
  assert.match(
    game,
    /BabyMatureSpeedMultiplier=10/,
    "Game.ini breeding rate should be copied",
  );
  assert.match(
    game,
    /EggHatchSpeedMultiplier=8/,
    "Game.ini egg hatch rate should be copied",
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectEnabled(locator) {
  await locator.waitFor({ state: "visible", timeout: 10000 });
  for (let i = 0; i < 20; i += 1) {
    if (await locator.isEnabled()) return;
    await locator.page().waitForTimeout(100);
  }
  assert.ok(await locator.isEnabled(), "Expected control to become enabled");
}

function assertProfileLists(dbPath, serverName) {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare("SELECT mods, extra_args FROM servers WHERE name = ?")
      .get(serverName);
    assert.ok(row, `Server row missing for ${serverName}`);
    const mods = JSON.parse(row.mods);
    const extraArgs = JSON.parse(row.extra_args);
    assert.deepEqual(mods, SOURCE_MODS, `${serverName} mods should match source`);
    assert.deepEqual(
      extraArgs,
      SOURCE_EXTRA_ARGS,
      `${serverName} launch args should match source`,
    );
  } finally {
    db.close();
  }
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Copy configuration E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(path.dirname(serversRoot), serversRoot);

  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(serversRoot, { recursive: true });

  const runId = Date.now().toString(36);
  const nameSource = `E2E-Copy-Src-${runId}`;
  const nameB = `E2E-Copy-B-${runId}`;
  const nameC = `E2E-Copy-C-${runId}`;
  const dirSource = path.join(serversRoot, "source");
  const dirB = path.join(serversRoot, "b");
  const dirC = path.join(serversRoot, "c");

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

    console.log("E2E_COPY_CONFIG create servers");
    await createServer(page, nameSource, dirSource, uniquePorts(1));
    await createServer(page, nameB, dirB, uniquePorts(2));
    await createServer(page, nameC, dirC, uniquePorts(3));

    const installSource = resolvedInstallDir(dirSource, nameSource);
    const installB = resolvedInstallDir(dirB, nameB);
    const installC = resolvedInstallDir(dirC, nameC);

    console.log("E2E_COPY_CONFIG configure source settings/mods/args");
    await configureSourceProfile(page, nameSource, installSource);
    assert.match(
      readIni(installSource, "GameUserSettings.ini"),
      /XPMultiplier=2\.5/,
      "Source GUS must be seeded before copy",
    );

    // Distinct target baselines so copy results are observable.
    writeIniPair(installB, TARGET_GUS, "[/Script/ShooterGame.ShooterGameMode]\n");
    writeIniPair(installC, TARGET_GUS, "[/Script/ShooterGame.ShooterGameMode]\n");

    console.log("E2E_COPY_CONFIG run wizard source → B+C");
    await completeCopyWizard(page, nameSource, [nameB, nameC]);

    console.log("E2E_COPY_CONFIG verify disk + profile lists");
    assertCopiedTo(installB, `Session ${nameB}`);
    assertCopiedTo(installC, `Session ${nameC}`);

    await quitApp(app);
    app = null;

    const dbPath = path.join(profileDir, "yark-server-manager.db");
    assertProfileLists(dbPath, nameB);
    assertProfileLists(dbPath, nameC);

    succeeded = true;
    console.log("E2E_COPY_CONFIG_OK");
  } catch (error) {
    console.error("E2E_COPY_CONFIG_FAIL", error);
    throw error;
  } finally {
    if (app !== null) {
      try {
        await quitApp(app);
      } catch (quitError) {
        console.warn("WARN: quit failed", quitError?.message ?? quitError);
      }
    }
    if (succeeded) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
        fs.rmSync(serversRoot, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn("WARN: cleanup failed", cleanupError?.message ?? cleanupError);
      }
    } else {
      console.warn(`Left fixtures for inspection:\n  ${profileDir}\n  ${serversRoot}`);
      if (errors.length > 0) {
        console.warn("Renderer errors:\n", errors.join("\n"));
      }
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
