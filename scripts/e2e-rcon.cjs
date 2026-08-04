/**
 * E2E: RCON Players tab UI + BanList (no live ASA dedicated).
 *
 * Seeds a lightweight "ready" install with Win64 BanList.txt, opens the
 * workspace RCON tab while the server is stopped, and checks:
 * - Console chrome (chips, command input, Console history / Clear)
 * - Online stopped copy
 * - Banned list reads names from BanList.txt
 * - Unban while stopped rewrites BanList without resurrecting stale ids
 *
 * Usage: npm run build && npm run e2e:rcon
 *
 * Requires Windows + display. Unset ELECTRON_RUN_AS_NODE before running.
 * Fixtures live under C:\asa-e2e and are deleted on success.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");
const e2eRoot = path.resolve("C:\\asa-e2e");
const profilesRoot = path.join(e2eRoot, "profiles");
const serversRoot = path.join(e2eRoot, "servers");
const runId = `${Date.now()}-${process.pid}`;
const fixtureName = `rcon-${runId}`;
const profileDir = path.join(profilesRoot, fixtureName);
const serversDir = path.join(serversRoot, fixtureName);
const dbPath = path.join(profileDir, "yark-server-manager.db");

const PORT_BASE = 29400 + (process.pid % 200);
const PORTS = {
  game: PORT_BASE,
  query: PORT_BASE + 1,
  rcon: PORT_BASE + 2,
};

const serverId = `e2e-rcon-${runId}`;
const serverName = `RCON Fixture ${runId}`;
const installDir = path.join(serversDir, "ready");
const win64Dir = path.join(installDir, "ShooterGame", "Binaries", "Win64");
const banListPath = path.join(win64Dir, "BanList.txt");

const KEEP_ID = "0002e03af5f4487985e94c6ba4080369";
const KEEP_NAME = "gabomarin26";
const REMOVE_ID = "76561198000000000";
const REMOVE_NAME = "Alice";

function assertFixturePath(root, target) {
  const relative = path.relative(root, target);
  assert.ok(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(path.basename(target), fixtureName);
}

function writeInstallFixture() {
  fs.mkdirSync(win64Dir, { recursive: true });
  fs.writeFileSync(path.join(win64Dir, "ArkAscendedServer.exe"), "fake-asa-binary\n");
  fs.writeFileSync(path.join(win64Dir, "version.txt"), "e2e-rcon-1.0\n");
  fs.writeFileSync(
    banListPath,
    `${KEEP_ID},${KEEP_NAME},0\n${REMOVE_ID},${REMOVE_NAME},0\n`,
    "utf8",
  );
  // Stale alternate BanList must NOT be merged into Win64 on unban.
  const altDir = path.join(installDir, "ShooterGame", "Saved");
  fs.mkdirSync(altDir, { recursive: true });
  fs.writeFileSync(
    path.join(altDir, "BanList.txt"),
    "11111111111111111,StaleAlt,0\n",
    "utf8",
  );
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
    installDir,
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
  assert.equal(process.platform, "win32", "RCON E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(serversRoot, serversDir);

  fs.mkdirSync(profileDir, { recursive: true });
  writeInstallFixture();

  let app = null;
  let succeeded = false;
  const errors = [];
  try {
    app = await launchApp();
    await app.firstWindow();
    await quitApp(app);
    app = null;
    seedDatabase();

    app = await launchApp();
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await page.waitForLoadState("domcontentloaded");
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15_000 });

    const card = cardFor(page, serverName);
    await card.waitFor({ state: "visible", timeout: 15_000 });
    await card
      .getByRole("button", { name: new RegExp(`Open settings for ${serverName}`, "i") })
      .click();
    await page.getByRole("tab", { name: "RCON" }).waitFor({
      state: "visible",
      timeout: 15_000,
    });
    await page.getByRole("tab", { name: "RCON" }).click();

    await page.getByText(/Admin commands for the active server/i).waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.getByLabel(/rcon command/i).waitFor({ state: "visible" });
    await page.getByText("Online", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Banned", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Console history", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Clear RCON history" }).waitFor({
      state: "visible",
    });

    // Server is stopped — Send / quick chips stay disabled (no live RCON).
    assert.equal(
      await page.getByRole("button", { name: /^Send$/i }).isDisabled(),
      true,
      "Send should be disabled while the server is stopped",
    );
    assert.equal(
      await page.getByRole("button", { name: "SaveWorld" }).isDisabled(),
      true,
      "SaveWorld chip should be disabled while stopped",
    );
    await page.getByText("Server stopped.", { exact: true }).waitFor({
      state: "visible",
      timeout: 5_000,
    });

    // BanList metadata (id,name,flags) surfaces in the Banned section.
    await page.getByText(KEEP_NAME, { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText(REMOVE_NAME, { exact: true }).waitFor({ state: "visible" });
    await page.getByText(KEEP_ID, { exact: true }).waitFor({ state: "visible" });
    await page.getByText(REMOVE_ID, { exact: true }).waitFor({ state: "visible" });

    // Unban while stopped still rewrites Win64 BanList.txt (no RCON needed).
    await page.getByRole("button", { name: `Unban ${REMOVE_NAME}` }).click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5_000 });
    await page.getByRole("dialog").getByRole("button", { name: /^Unban$/i }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10_000 });
    await page.getByText(REMOVE_NAME, { exact: true }).waitFor({
      state: "detached",
      timeout: 10_000,
    });
    await page.getByText(KEEP_NAME, { exact: true }).waitFor({ state: "visible" });

    const banListText = fs.readFileSync(banListPath, "utf8");
    assert.match(banListText, new RegExp(`${KEEP_ID},${KEEP_NAME},0`));
    assert.doesNotMatch(banListText, new RegExp(REMOVE_ID));
    // Alternate BanList must remain untouched / not merged into primary.
    const altText = fs.readFileSync(
      path.join(installDir, "ShooterGame", "Saved", "BanList.txt"),
      "utf8",
    );
    assert.match(altText, /11111111111111111,StaleAlt,0/);
    assert.doesNotMatch(banListText, /11111111111111111/);

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(`E2E_RCON_OK profile=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitApp(app);
      } catch (error) {
        console.warn(`E2E_RCON_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      assertFixturePath(profilesRoot, profileDir);
      assertFixturePath(serversRoot, serversDir);
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(serversDir, { recursive: true, force: true });
    } else {
      console.error(`E2E_RCON_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_RCON_SERVERS_PRESERVED ${serversDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_RCON_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
