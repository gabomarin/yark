/**
 * E2E: Import existing ASA install (#254).
 *
 * Seeds a lightweight ready dedicated root (KB-scale), opens Import install from
 * Overview empty state, stubs the folder picker, completes the wizard, and asserts:
 * - profile row in SQLite (absolute installDir, mods all disabled)
 * - GameUserSettings.ini / Game.ini bytes unchanged (import is profile-only)
 * - re-import of the same folder shows Already managed
 * - nested Win64 path shows Nested folder + Use suggested folder
 *
 * Usage: npm run build && npm run e2e:import-install
 *
 * Requires Windows + display. Clears ELECTRON_RUN_AS_NODE.
 * Fixtures live under C:\asa-e2e and are deleted on success.
 */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");
const e2eRoot = path.resolve("C:\\asa-e2e");
const profilesRoot = path.join(e2eRoot, "profiles");
const serversRoot = path.join(e2eRoot, "servers");
const runId = `${Date.now()}-${process.pid}`;
const fixtureName = `import-install-${runId}`;
const profileDir = path.join(profilesRoot, fixtureName);
const serversDir = path.join(serversRoot, fixtureName);
const dbPath = path.join(profileDir, "yark-server-manager.db");

const PORT_BASE = 29600 + (process.pid % 200);
const PORTS = {
  game: PORT_BASE,
  query: PORT_BASE + 1,
  rcon: PORT_BASE + 2,
};

const installName = `ImportReady${runId}`;
const installDir = path.join(serversDir, installName);
const nestedWin64 = path.join(
  installDir,
  "ShooterGame",
  "Binaries",
  "Win64",
);
const gusMarker = `YARK_E2E_IMPORT_GUS_${runId}`;
const gameMarker = `YARK_E2E_IMPORT_GAME_${runId}`;
const MOD_ID = "928837";

function assertFixturePath(root, target) {
  const relative = path.relative(root, target);
  assert.ok(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(path.basename(target), fixtureName);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function iniPaths(root) {
  const dir = path.join(
    root,
    "ShooterGame",
    "Saved",
    "Config",
    "WindowsServer",
  );
  return {
    dir,
    gus: path.join(dir, "GameUserSettings.ini"),
    game: path.join(dir, "Game.ini"),
  };
}

function writeReadyInstall(root) {
  const binDir = path.join(root, "ShooterGame", "Binaries", "Win64");
  const modsDir = path.join(binDir, "ShooterGame", "Mods", "83374", `${MOD_ID}_1`);
  const savedDir = path.join(root, "ShooterGame", "Saved", "SavedArks");
  const { dir: iniDir, gus, game } = iniPaths(root);

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(modsDir, { recursive: true });
  fs.mkdirSync(savedDir, { recursive: true });
  fs.mkdirSync(iniDir, { recursive: true });

  fs.writeFileSync(path.join(binDir, "ArkAscendedServer.exe"), "fake-asa-binary\n");
  fs.writeFileSync(path.join(savedDir, "TheIsland_WP.ark"), "world\n");
  fs.writeFileSync(
    gus,
    [
      "[SessionSettings]",
      `SessionName=Import Session ${runId}`,
      `Port=${PORTS.game}`,
      `QueryPort=${PORTS.query}`,
      `${gusMarker}=1`,
      "",
      "[ServerSettings]",
      `RCONPort=${PORTS.rcon}`,
      "ServerAdminPassword=admin1234",
      "ServerPassword=",
      "RCONEnabled=False",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    game,
    [
      "[/Script/ShooterGame.ShooterGameMode]",
      "XPMultiplier=1",
      `${gameMarker}=1`,
      "",
    ].join("\n"),
    "utf8",
  );
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

async function expectText(locator, value) {
  if (typeof value === "string") {
    await locator.getByText(value, { exact: false }).first().waitFor({ state: "visible" });
    return;
  }
  await locator.getByText(value).first().waitFor({ state: "visible" });
}

function readImportedServer() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db
    .prepare(
      `SELECT name, install_dir, game_port, query_port, rcon_port, mods, disabled_mods
       FROM servers WHERE install_dir = ? COLLATE NOCASE`,
    )
    .get(installDir);
  db.close();
  return row;
}

async function openImportWizard(page) {
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15_000 });

  const emptyImport = page.getByRole("button", {
    name: /Import existing install/i,
  });
  try {
    await emptyImport.waitFor({ state: "visible", timeout: 5_000 });
    await emptyImport.click();
  } catch {
    await page
      .getByRole("button", { name: /More (?:add|new)-server options/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /Import install/i }).click();
  }
  const dialog = page.getByRole("dialog", { name: /Import install/i });
  await dialog.waitFor({ state: "visible", timeout: 15_000 });
  return dialog;
}

async function browseAndWaitReady(app, page, dialog, folder) {
  await stubFolderPicker(app, folder);
  await dialog.getByRole("button", { name: /^Browse$/i }).click();
  await expectText(dialog, folder);
  await dialog.getByText("Ready", { exact: true }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Import-install E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(serversRoot, serversDir);

  fs.mkdirSync(profileDir, { recursive: true });
  writeReadyInstall(installDir);

  const gusBefore = sha256File(iniPaths(installDir).gus);
  const gameBefore = sha256File(iniPaths(installDir).game);
  const gusTextBefore = fs.readFileSync(iniPaths(installDir).gus, "utf8");
  assert.match(gusTextBefore, /RCONEnabled=False/);

  let app = null;
  let succeeded = false;
  const errors = [];
  try {
    // Initialize embedded schema with an empty fleet.
    app = await launchApp();
    const bootPage = await app.firstWindow();
    await bootPage.waitForLoadState("domcontentloaded");
    await bootPage.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await quitApp(app);
    app = null;

    app = await launchApp();
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await page.waitForLoadState("domcontentloaded");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: 15_000,
    });

    // --- Nested folder gate ---
    let dialog = await openImportWizard(page);
    await stubFolderPicker(app, nestedWin64);
    await dialog.getByRole("button", { name: /^Browse$/i }).click();
    await expectText(dialog, nestedWin64);
    await dialog.getByText("Nested folder", { exact: true }).waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await dialog.getByRole("button", { name: /Use suggested folder/i }).click();
    await expectText(dialog, installDir);
    await dialog.getByText("Ready", { exact: true }).waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await dialog.getByRole("button", { name: /^Cancel$/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });

    // --- Happy-path import ---
    dialog = await openImportWizard(page);
    await browseAndWaitReady(app, page, dialog, installDir);
    await expectText(dialog, /not modified until Start/i);
    await dialog.getByRole("button", { name: /^Continue$/i }).click();

    await expectText(dialog, /Profile only/i);
    await expectText(dialog, /Found 1 mods/i);
    await dialog.getByRole("button", { name: /^Continue$/i }).click();

    // Edit step: name/session/ports should be prefilled; ensure admin password.
    const nameInput = dialog.getByLabel(/^Name$/i);
    await nameInput.waitFor({ state: "visible", timeout: 10_000 });
    const profileName = `Imported ${runId}`;
    await nameInput.fill(profileName);
    const admin = dialog.getByLabel(/Admin password/i);
    const adminValue = await admin.inputValue();
    if (adminValue.trim().length < 4) {
      await admin.fill("admin1234");
    }

    await dialog.getByRole("button", { name: /Import profile/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 30_000 });

    // Workspace should open for the new profile (no create overlay).
    await page
      .getByText(profileName, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 20_000 });

    const row = readImportedServer();
    assert.ok(row, "imported server row missing from SQLite");
    assert.equal(
      path.resolve(String(row.install_dir)).toLowerCase(),
      path.resolve(installDir).toLowerCase(),
    );
    assert.equal(Number(row.game_port), PORTS.game);
    assert.equal(Number(row.query_port), PORTS.query);
    assert.equal(Number(row.rcon_port), PORTS.rcon);
    const mods = JSON.parse(String(row.mods));
    const disabled = JSON.parse(String(row.disabled_mods));
    assert.deepEqual(mods, [MOD_ID]);
    assert.deepEqual(disabled, [MOD_ID]);

    assert.equal(
      sha256File(iniPaths(installDir).gus),
      gusBefore,
      "Import must not rewrite GameUserSettings.ini",
    );
    assert.equal(
      sha256File(iniPaths(installDir).game),
      gameBefore,
      "Import must not rewrite Game.ini",
    );
    const gusAfter = fs.readFileSync(iniPaths(installDir).gus, "utf8");
    assert.match(gusAfter, /RCONEnabled=False/);
    assert.match(gusAfter, new RegExp(gusMarker));

    // --- Already managed ---
    await leaveWorkspaceToServers(page);

    dialog = await openImportWizard(page);
    await stubFolderPicker(app, installDir);
    await dialog.getByRole("button", { name: /^Browse$/i }).click();
    await expectText(dialog, installDir);
    await dialog.getByText("Already managed", { exact: true }).waitFor({
      state: "visible",
      timeout: 20_000,
    });
    const continueBtn = dialog.getByRole("button", { name: /^Continue$/i });
    assert.equal(await continueBtn.isDisabled(), true);
    await dialog.getByRole("button", { name: /^Cancel$/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(`E2E_IMPORT_INSTALL_OK profile=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitApp(app);
      } catch (error) {
        console.warn(`E2E_IMPORT_INSTALL_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      assertFixturePath(profilesRoot, profileDir);
      assertFixturePath(serversRoot, serversDir);
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(serversDir, { recursive: true, force: true });
    } else {
      console.error(`E2E_IMPORT_INSTALL_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_IMPORT_INSTALL_SERVERS_PRESERVED ${serversDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_IMPORT_INSTALL_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
