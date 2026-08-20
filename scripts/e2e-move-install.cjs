/**
 * E2E: Move installation copy/rename → verify → commit (#56).
 *
 * Seeds a lightweight ready install (KB-scale), opens Move installation from
 * the Server tab, stubs the folder picker, runs a same-volume move, and asserts
 * the success dialog, new profile path, and that Saved data survived.
 *
 * Usage: npm run build && npm run e2e:move-install
 *
 * Requires Windows + display. Unset ELECTRON_RUN_AS_NODE before running.
 * Fixtures live under C:\asa-e2e and are deleted on success.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");
const { stubFolderPicker, initProfileDatabase } = require("./e2e-launch.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");
const e2eRoot = path.resolve("C:\\asa-e2e");
const profilesRoot = path.join(e2eRoot, "profiles");
const serversRoot = path.join(e2eRoot, "servers");
const runId = `${Date.now()}-${process.pid}`;
const fixtureName = `move-install-${runId}`;
const profileDir = path.join(profilesRoot, fixtureName);
const serversDir = path.join(serversRoot, fixtureName);
const dbPath = path.join(profileDir, "yark-server-manager.db");

const PORT_BASE = 29400 + (process.pid % 200);
const PORTS = {
  game: PORT_BASE,
  query: PORT_BASE + 1,
  rcon: PORT_BASE + 2,
};

const serverId = `e2e-move-${runId}`;
const serverName = `Move Ready ${runId}`;
const sourceDir = path.join(serversDir, "source");
const destDir = path.join(serversDir, "dest");
const saveMarker = "yark-e2e-save-marker";

function assertFixturePath(root, target) {
  const relative = path.relative(root, target);
  assert.ok(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(path.basename(target), fixtureName);
}

function writeReadyInstall(root) {
  const binDir = path.join(root, "ShooterGame", "Binaries", "Win64");
  const savedDir = path.join(root, "ShooterGame", "Saved");
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(savedDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, "ArkAscendedServer.exe"), "fake-asa-binary\n");
  fs.writeFileSync(path.join(binDir, "version.txt"), "e2e-move-1.0\n");
  fs.writeFileSync(path.join(savedDir, "save.ark"), `${saveMarker}\n`);
}

function seedDatabase() {
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO servers (
      id, name, map, install_dir, enabled, session_name,
      game_port, query_port, rcon_port,
      server_password, admin_password,
      cluster_id, cluster_dir, extra_args, mods,
      disabled_mods, mod_metadata_cache, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    serverId,
    serverName,
    "TheIsland_WP",
    sourceDir,
    1,
    `Session ${serverName}`,
    PORTS.game,
    PORTS.query,
    PORTS.rcon,
    null,
    "admin1234",
    null,
    null,
    "[]",
    "[]",
    "[]",
    "{}",
    now,
    now,
  );
  db.close();
}

function readInstallDirFromDb() {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const row = db.prepare("SELECT install_dir FROM servers WHERE id = ?").get(serverId);
  db.close();
  assert.ok(row, "seeded server row missing after move");
  return String(row.install_dir);
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

function cardFor(page, name) {
  return page.locator("[data-server-card]", {
    has: page.getByText(name, { exact: true }),
  }).first();
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Move-install E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(serversRoot, serversDir);

  fs.mkdirSync(profileDir, { recursive: true });
  writeReadyInstall(sourceDir);

  let app = null;
  let succeeded = false;
  const errors = [];
  try {
    initProfileDatabase(dbPath);
    seedDatabase();

    app = await launchApp();
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await page.waitForLoadState("domcontentloaded");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15_000 });

    const card = cardFor(page, serverName);
    await card.waitFor({ state: "visible", timeout: 15_000 });
    await card
      .getByRole("button", { name: new RegExp(`Open settings for ${serverName}`, "i") })
      .click();
    await page.getByRole("tab", { name: "Server" }).waitFor({
      state: "visible",
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /Move installation/i }).click();
    const dialog = page.getByRole("dialog", { name: /Move installation/i });
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
    await expectText(dialog, sourceDir);
    await expectText(dialog, /new folder must be empty/i);

    // Empty base + Create folder (default) → dest\source.
    fs.mkdirSync(destDir, { recursive: true });
    const finalDest = path.join(destDir, "source");
    await stubFolderPicker(app, destDir);
    await dialog.getByRole("button", { name: /^Browse$/i }).click();
    await expectText(dialog, destDir);
    await expectText(dialog, finalDest);

    await dialog.getByRole("button", { name: /^Start move$/i }).click();
    // Clean success toasts (#240); Done appears when the move finished without a leftover folder.
    await dialog.getByRole("button", { name: /^Done$/i }).waitFor({
      state: "visible",
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: /^Done$/i }).click();
    await dialog.waitFor({ state: "hidden", timeout: 15_000 });

    // Profile + disk evidence.
    const committedDir = readInstallDirFromDb();
    assert.equal(
      path.resolve(committedDir).toLowerCase(),
      path.resolve(finalDest).toLowerCase(),
    );
    assert.equal(fs.existsSync(sourceDir), false, "previous install folder should be removed");
    assert.ok(
      fs.existsSync(path.join(finalDest, "ShooterGame", "Binaries", "Win64", "ArkAscendedServer.exe")),
      "destination should contain the ASA binary",
    );
    const movedSave = fs.readFileSync(
      path.join(finalDest, "ShooterGame", "Saved", "save.ark"),
      "utf8",
    );
    assert.match(movedSave, new RegExp(saveMarker));

    // UI shows the new install path on the Server tab after Done refresh.
    await page.getByRole("tab", { name: "Server" }).click();
    await expectText(page.locator("[data-server-form-scroll]"), finalDest);

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(`E2E_MOVE_INSTALL_OK profile=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitApp(app);
      } catch (error) {
        console.warn(`E2E_MOVE_INSTALL_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      assertFixturePath(profilesRoot, profileDir);
      assertFixturePath(serversRoot, serversDir);
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(serversDir, { recursive: true, force: true });
    } else {
      console.error(`E2E_MOVE_INSTALL_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_MOVE_INSTALL_SERVERS_PRESERVED ${serversDir}`);
    }
  }
}

async function expectText(locator, value) {
  if (typeof value === "string") {
    await locator.getByText(value, { exact: false }).first().waitFor({ state: "visible" });
    return;
  }
  await locator.getByText(value).first().waitFor({ state: "visible" });
}

run().catch((error) => {
  console.error("E2E_MOVE_INSTALL_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
