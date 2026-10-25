/**
 * E2E: a cancelled SteamCMD update is Cancelled in Logs, and Downloads can open
 * that file or explain when none was saved (#86).
 *
 * Usage: npm run build && npm run e2e:cancelled-update-log
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  projectRoot,
  createE2eFixtureRoots,
  assertUnderFixtureRoot,
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  removeFixtureDir,
  seedAppearance,
} = require("./e2e-launch.cjs");

const SERVER_WITH_LOG = "e2e-cancel-island";
const SERVER_WITHOUT_LOG = "e2e-cancel-scorched";
const JOB_WITH_LOG = "job-with-log";
const JOB_WITHOUT_LOG = "job-without-log";
const CANCEL_FILE = `${SERVER_WITH_LOG}-2026-10-19T16-20-00-000Z.log`;

function insertServer(db, server, installDir, now) {
  db.prepare(
    `INSERT INTO servers (
      id, name, map, install_dir, enabled, session_name,
      game_port, query_port, rcon_port,
      server_password, admin_password,
      cluster_id, cluster_dir, extra_args, mods,
      disabled_mods, mod_metadata_cache, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    server.id,
    server.name,
    server.map,
    installDir,
    1,
    `Session ${server.name}`,
    server.gamePort,
    server.queryPort,
    server.rconPort,
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
}

function cancelledJob(id, serverId, updateLogPath, now) {
  return {
    id,
    type: "update",
    serverId,
    latestEventId: null,
    attempts: 1,
    maxAttempts: 3,
    status: "cancelled",
    phase: "cancelled",
    createdAt: now,
    updatedAt: now,
    lastError: "Operation cancelled by the user",
    recoveryReason: "Stopped before game files changed",
    idempotencyKey: `update:${serverId}:${id}`,
    operatorRetryAllowed: true,
    context: {
      wasRunning: false,
      ...(updateLogPath !== null ? { updateLogPath } : {}),
    },
  };
}

function seed(profileDir, serversDir) {
  seedAppearance(profileDir, { family: "fluent", scheme: "dark" });
  const dbPath = path.join(profileDir, "yark-server-manager.db");
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  const islandDir = path.join(serversDir, "island");
  const scorchedDir = path.join(serversDir, "scorched");
  fs.mkdirSync(islandDir, { recursive: true });
  fs.mkdirSync(scorchedDir, { recursive: true });
  insertServer(
    db,
    {
      id: SERVER_WITH_LOG,
      name: "Cancel Island",
      map: "TheIsland_WP",
      gamePort: 18286,
      queryPort: 38286,
      rconPort: 39286,
    },
    islandDir,
    now,
  );
  insertServer(
    db,
    {
      id: SERVER_WITHOUT_LOG,
      name: "Cancel Scorched",
      map: "ScorchedEarth_WP",
      gamePort: 18296,
      queryPort: 38296,
      rconPort: 39296,
    },
    scorchedDir,
    now,
  );

  const updatesDir = path.join(profileDir, "update-logs");
  fs.mkdirSync(updatesDir, { recursive: true });
  const cancelPath = path.join(updatesDir, CANCEL_FILE);
  fs.writeFileSync(
    cancelPath,
    [
      `time=${now}`,
      "server=Cancel Island",
      `installDir=${islandDir}`,
      "exitCode=1",
      "outcome=cancelled",
      `startedAt=${now}`,
      "durationMs=4000",
      "--- stdout ---",
      "Operation cancelled by the user.",
      "--- stderr ---",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(updatesDir, `${SERVER_WITH_LOG}-2026-10-19T16-10-00-000Z.log`),
    ["exitCode=8", "durationMs=4000", "--- stdout ---", "ERROR! Failed to install app.", ""].join("\n"),
    "utf8",
  );

  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(
    "criticalJobsQueue.v1",
    JSON.stringify([
      cancelledJob(JOB_WITH_LOG, SERVER_WITH_LOG, cancelPath, now),
      cancelledJob(JOB_WITHOUT_LOG, SERVER_WITHOUT_LOG, null, now),
    ]),
    now,
  );
  db.close();
}

async function openDownloads(page) {
  await page.getByRole("button", { name: "Downloads", exact: true }).first().click();
  await page.locator("[data-downloads-page]").waitFor({ state: "visible", timeout: 15_000 });
}

async function run() {
  process.chdir(projectRoot);
  const { profileDir, serversDir, fixtureName, root } = createE2eFixtureRoots("cancelled-update-log");
  assert.ok(serversDir, "serversDir required");
  assertUnderFixtureRoot(path.join(root, "profiles"), profileDir);
  assertUnderFixtureRoot(path.join(root, "servers"), serversDir);
  seed(profileDir, serversDir);

  let app = null;
  let succeeded = false;
  const errors = [];
  try {
    app = await launchElectronApp({ profileDir });
    const early = await app.firstWindow();
    const watchPage = (target) => {
      target.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      target.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    };
    watchPage(early);
    app.on("window", watchPage);
    const page = await waitForOverview(app);
    await page.setViewportSize({ width: 1440, height: 900 });

    await openDownloads(page);
    const withLog = page.locator(`[data-download-row="${JOB_WITH_LOG}"]`);
    await withLog.waitFor({ state: "visible", timeout: 15_000 });
    assert.equal(await withLog.getAttribute("data-kind"), "cancelled");
    await withLog.getByRole("button", { name: "Open in Logs" }).click();

    await page.locator("[data-server-logs-panel]").waitFor({ state: "visible", timeout: 15_000 });
    await page.locator('[data-selected-update-status="cancelled"]').waitFor({ state: "visible", timeout: 15_000 });
    await page.getByText("outcome=cancelled").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator('[data-update-log-status="failed"]').waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await page.locator('[data-selected-update-status="failed"]').count(), 0);

    await openDownloads(page);
    const withoutLog = page.locator(`[data-download-row="${JOB_WITHOUT_LOG}"]`);
    await withoutLog.waitFor({ state: "visible", timeout: 15_000 });
    await withoutLog.getByRole("button", { name: "Open in Logs" }).click();
    await page.locator('[data-update-log-missing="never-written"]').waitFor({ state: "visible", timeout: 15_000 });
    await page.getByText("No update log for this download").waitFor({ state: "visible", timeout: 10_000 });

    const actionableErrors = errors.filter((message) => !/Failed to load resource|net::ERR_/i.test(message));
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(`E2E_CANCELLED_UPDATE_LOG_OK fixture=${fixtureName}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_CANCELLED_UPDATE_LOG_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
    } else {
      console.warn(`E2E_CANCELLED_UPDATE_LOG_KEEP profile=${profileDir}`);
    }
  }
}

run().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
