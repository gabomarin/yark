/**
 * E2E: RCON console + Players/BanList UI (no live ASA dedicated).
 *
 * Uses YARK_E2E_RCON_MOCK=1 so InstanceService reports servers as running and
 * answers console commands deterministically (success / empty / failure).
 *
 * Covers:
 * - Submit, success body, empty → "No response", failure, identical-pending,
 *   Clear while a command is pending
 * - BanList names + Unban rewrite (primary Win64 only)
 * - Visual evidence at HD / Full HD / QHD (docs/visual-testing.md)
 *
 * Usage: npm run build && npm run e2e:rcon
 *
 * Requires Windows + display. Unset ELECTRON_RUN_AS_NODE before running.
 * Fixtures live under C:\asa-e2e and are deleted on success.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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
const shotsDir = path.join(os.tmpdir(), `yark-e2e-rcon-${runId}`);

const VIEWPORTS = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

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
const KEEP_NAME = "Bob";
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
    env: {
      ...process.env,
      YARK_E2E_USER_DATA: profileDir,
      YARK_E2E_RCON_MOCK: "1",
    },
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

async function openRconTab(page) {
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
}

async function sendCommand(page, command) {
  const input = page.getByLabel(/rcon command/i);
  await input.fill(command);
  await page.getByRole("button", { name: /^Send$/i }).click();
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "RCON E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(serversRoot, serversDir);

  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(shotsDir, { recursive: true });
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

    await openRconTab(page);
    // Wide layout so SidePanel Save world stays visible next to RCON chips.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByLabel(/rcon command/i).waitFor({ state: "visible" });
    await page.getByText("Online", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Banned", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("tab", { name: "Admins" }).click();
    await page.getByLabel("AdminListURL").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("Current ids", { exact: true }).waitFor({ state: "visible" });
    await page.getByRole("tab", { name: "Survivors" }).click();
    await page.getByText("Console history", { exact: true }).waitFor({ state: "visible" });

    // Mock marks the server running — chips enabled; Send needs a command.
    assert.equal(
      await page.getByRole("button", { name: /^Send$/i }).isDisabled(),
      true,
      "Send stays disabled until a command is typed",
    );
    assert.equal(
      await page.getByRole("button", { name: "SaveWorld" }).isDisabled(),
      false,
      "SaveWorld chip should be enabled while mock-running",
    );

    // Success with a body.
    await sendCommand(page, "GetChat");
    await page.getByText("E2E:GetChat", { exact: true }).waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.getByText("ok", { exact: true }).first().waitFor({ state: "visible" });

    // Empty success → "No response".
    await sendCommand(page, "E2E_EMPTY");
    await page.getByText("No response", { exact: true }).waitFor({
      state: "visible",
      timeout: 10_000,
    });

    // Failure.
    await sendCommand(page, "E2E_FAIL");
    await page
      .locator("p")
      .filter({ hasText: /^E2E mock failure$/ })
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("failed", { exact: true }).waitFor({ state: "visible" });

    // Identical pending + Clear keeps in-flight.
    await sendCommand(page, "E2E_SLOW");
    await page.getByText("Sending…", { exact: true }).waitFor({
      state: "visible",
      timeout: 5_000,
    });
    await page.getByLabel(/rcon command/i).fill("E2E_SLOW");
    assert.equal(
      await page.getByRole("button", { name: /^Send$/i }).isDisabled(),
      true,
      "Identical pending command must disable Send",
    );
    await page.getByRole("button", { name: "Clear RCON history" }).click();
    await page.getByText("Sending…", { exact: true }).waitFor({
      state: "visible",
      timeout: 5_000,
    });
    await page.getByText("E2E:slow", { exact: true }).waitFor({
      state: "visible",
      timeout: 10_000,
    });

    // SidePanel Save world + RCON Broadcast chip (prefill) → history.
    await page.getByRole("button", { name: "Save world" }).click();
    await page.getByText("No response", { exact: true }).first().waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "ServerChat" }).click();
    const chatInput = page.getByLabel(/rcon command/i);
    await chatInput.waitFor({ state: "visible" });
    assert.equal(
      await chatInput.inputValue(),
      "ServerChat ",
      "ServerChat chip should prefill the command input",
    );
    await chatInput.fill("ServerChat E2E hello");
    await page.getByRole("button", { name: /^Send$/i }).click();
    await page.getByText("E2E:ServerChat E2E hello", { exact: true }).waitFor({
      state: "visible",
      timeout: 10_000,
    });

    // Clear history removes completed entries.
    await page.getByRole("button", { name: "Clear RCON history" }).click();
    await page.getByText("RCON responses will appear here.").waitFor({
      state: "visible",
      timeout: 5_000,
    });

    // BanList metadata (id,name,flags) surfaces in the Banned section.
    await page.getByText(KEEP_NAME, { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText(REMOVE_NAME, { exact: true }).waitFor({ state: "visible" });
    await page.getByText(KEEP_ID, { exact: true }).waitFor({ state: "visible" });
    await page.getByText(REMOVE_ID, { exact: true }).waitFor({ state: "visible" });

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
    const altText = fs.readFileSync(
      path.join(installDir, "ShooterGame", "Saved", "BanList.txt"),
      "utf8",
    );
    assert.match(altText, /11111111111111111,StaleAlt,0/);
    assert.doesNotMatch(banListText, /11111111111111111/);

    // Visual matrix (docs/visual-testing.md).
    for (const size of VIEWPORTS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.getByText(/Admin commands for the active server/i).waitFor({
        state: "visible",
      });
      const shot = path.join(shotsDir, `rcon-${size.name}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      assert.ok(fs.existsSync(shot), `missing screenshot ${shot}`);
      console.log(`E2E_RCON_SHOT ${shot}`);
    }

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(`E2E_RCON_OK profile=${profileDir} shots=${shotsDir}`);
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
      console.error(`E2E_RCON_SHOTS_PRESERVED ${shotsDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_RCON_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
