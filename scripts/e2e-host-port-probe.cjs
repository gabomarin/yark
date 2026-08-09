/**
 * E2E: host TCP/UDP port probe before start (#91).
 *
 * Seeds a ready-looking install, occupies the profile game UDP port, then
 * asserts Start opens the host-port modal (busy + suggested session set),
 * Cancel / Edit ports, and Start this session (probe passes on free ports).
 *
 * Usage: npm run build && npm run e2e:host-port-probe
 *
 * Requires Windows + display. Unset ELECTRON_RUN_AS_NODE before running.
 * Fixtures live under C:\asa-e2e and are deleted on success.
 */
const assert = require("node:assert/strict");
const dgram = require("node:dgram");
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
const fixtureName = `host-port-probe-${runId}`;
const profileDir = path.join(profilesRoot, fixtureName);
const serversDir = path.join(serversRoot, fixtureName);
const dbPath = path.join(profileDir, "yark-server-manager.db");

const PORT_BASE = 29300 + (process.pid % 200);
const PORTS = {
  game: PORT_BASE,
  query: PORT_BASE + 1,
  rcon: PORT_BASE + 2,
};
const SUGGESTED = {
  game: PORTS.game + 10,
  query: PORTS.query + 10,
  rcon: PORTS.rcon + 10,
};

const serverId = `e2e-hpp-${runId}`;
const serverName = `HPP Ready ${runId}`;
const installDir = path.join(serversDir, "ready");

/** @type {import("node:dgram").Socket | null} */
let occupiedUdp = null;

function assertFixturePath(root, target) {
  const relative = path.relative(root, target);
  assert.ok(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(path.basename(target), fixtureName);
}

function writeReadyInstall() {
  fs.mkdirSync(serversDir, { recursive: true });
  const binDir = path.join(installDir, "ShooterGame", "Binaries", "Win64");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, "ArkAscendedServer.exe"), "fake-asa-binary\n");
  fs.writeFileSync(path.join(binDir, "version.txt"), "92.28\n");
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

/**
 * Occupy the profile game UDP port the same way the probe binds
 * (`exclusive: true`) so Start hits HOST_PORT_BUSY.
 */
function occupyGamePort() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.once("error", reject);
    socket.bind({ port: PORTS.game, exclusive: true }, () => {
      occupiedUdp = socket;
      resolve();
    });
  });
}

function releaseGamePort() {
  return new Promise((resolve) => {
    if (occupiedUdp == null) {
      resolve();
      return;
    }
    const socket = occupiedUdp;
    occupiedUdp = null;
    socket.close(() => resolve());
  });
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

function cardFor(page) {
  return page.locator("[data-server-card]", {
    has: page.getByText(serverName, { exact: true }),
  }).first();
}

async function clickStart(page) {
  const card = cardFor(page);
  await card.waitFor({ state: "visible", timeout: 15_000 });
  await card.getByRole("button", { name: "Start server", exact: true }).click();
}

async function waitForProbeModal(page) {
  const modal = page.locator("[data-host-port-probe-modal]");
  await modal.waitFor({ state: "visible", timeout: 15_000 });
  return modal;
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Host-port-probe E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(serversRoot, serversDir);

  fs.mkdirSync(profileDir, { recursive: true });
  writeReadyInstall();
  await occupyGamePort();

  let app = null;
  let succeeded = false;
  const errors = [];
  try {
    // Initialize embedded schema, then seed the ready profile.
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

    // --- Busy modal + Cancel ---
    await clickStart(page);
    let modal = await waitForProbeModal(page);
    assert.equal(await modal.getAttribute("data-host-port-probe-kind"), "busy");
    assert.equal(await modal.getAttribute("data-host-port-probe-suggested"), "true");
    await page.getByRole("dialog").getByText(`Ports in use — ${serverName}`).waitFor({
      state: "visible",
    });
    await page.getByText("Host port busy", { exact: true }).waitFor({ state: "visible" });
    const suggestion = page.locator("[data-host-port-probe-suggestion]");
    await suggestion.waitFor({ state: "visible" });
    const suggestionText = await suggestion.innerText();
    assert.match(
      suggestionText,
      new RegExp(
        `game ${SUGGESTED.game}.*query ${SUGGESTED.query}.*RCON ${SUGGESTED.rcon}`,
        "i",
      ),
    );
    await page
      .getByRole("button", {
        name: `Start this session on ${SUGGESTED.game} / ${SUGGESTED.query} / ${SUGGESTED.rcon}`,
      })
      .waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Cancel" }).click();
    await modal.waitFor({ state: "hidden", timeout: 5_000 });

    // --- Edit ports opens workspace Server tab ---
    await clickStart(page);
    modal = await waitForProbeModal(page);
    await page.locator("[data-host-port-probe-edit]").click();
    await modal.waitFor({ state: "hidden", timeout: 5_000 });
    await page.getByRole("tab", { name: "Server" }).waitFor({
      state: "visible",
      timeout: 15_000,
    });
    await page.getByLabel("Game port").waitFor({ state: "visible", timeout: 10_000 });
    const gamePortValue = await page.getByLabel("Game port").inputValue();
    assert.equal(gamePortValue, String(PORTS.game), "saved profile ports must stay unchanged");

    await leaveWorkspaceToServers(page, 10_000);

    // --- Start this session uses suggested free ports (probe passes) ---
    await clickStart(page);
    modal = await waitForProbeModal(page);
    await page
      .getByRole("button", {
        name: `Start this session on ${SUGGESTED.game} / ${SUGGESTED.query} / ${SUGGESTED.rcon}`,
      })
      .click();
    await modal.waitFor({ state: "hidden", timeout: 10_000 });

    // Probe cleared the gate. Fake ASA binary may fail to spawn — that is OK.
    // Assert we did not re-open the host-port modal and the busy error is gone.
    await page.waitForTimeout(1_500);
    assert.equal(
      await page.locator("[data-host-port-probe-modal]").count(),
      0,
      "host-port modal should stay closed after session start",
    );
    const banner = page.locator('[role="alert"]').filter({ hasText: /HOST_PORT_/i });
    assert.equal(await banner.count(), 0, "must not surface HOST_PORT_* after session start");

    const toast = page.getByText(/Started with session ports/i);
    const sessionNoteVisible = (await toast.count()) > 0;
    // Either toast (spawn accepted) or Overview still visible without probe modal.
    assert.ok(
      sessionNoteVisible || (await page.locator("[data-overview-page]").count()) > 0,
      "session start left the app usable after the host-port gate",
    );

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(
      `E2E_HOST_PORT_PROBE_OK profile=${profileDir} ports=${PORTS.game}/${PORTS.query}/${PORTS.rcon}`,
    );
  } finally {
    await releaseGamePort();
    if (app !== null) {
      try {
        await quitApp(app);
      } catch (error) {
        console.warn(`E2E_HOST_PORT_PROBE_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      assertFixturePath(profilesRoot, profileDir);
      assertFixturePath(serversRoot, serversDir);
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(serversDir, { recursive: true, force: true });
    } else {
      console.error(`E2E_HOST_PORT_PROBE_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_HOST_PORT_PROBE_SERVERS_PRESERVED ${serversDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_HOST_PORT_PROBE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
