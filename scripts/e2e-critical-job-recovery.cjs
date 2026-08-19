/**
 * E2E: critical-job startup recovery and operator actions (#19).
 *
 * Usage: npm run build && npm run e2e:critical-job-recovery
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
const fixtureName = `critical-job-${runId}`;
const profileDir = path.join(profilesRoot, fixtureName);
const serverDir = path.join(serversRoot, fixtureName);
const dbPath = path.join(profileDir, "yark-server-manager.db");
const serverId = `e2e-critical-${runId}`;
const serverName = `Critical recovery ${runId}`;

function assertFixturePath(root, target) {
  const relative = path.relative(root, target);
  assert.ok(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(path.basename(target), fixtureName);
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

function job(id, type, targetServerId, status, phase, context = {}) {
  const now = "2026-08-01T00:00:00.000Z";
  return {
    id,
    type,
    serverId: targetServerId,
    attempts: status === "cancelled" ? 0 : 2,
    maxAttempts: 3,
    status,
    phase,
    createdAt: now,
    updatedAt: now,
    lastError: status === "cancelled" ? null : "Interrupted E2E fixture",
    recoveryReason: status === "cancelled" ? "Cancelled before restart." : null,
    idempotencyKey: `${type}:${targetServerId}:`,
    operatorRetryAllowed: false,
    context,
  };
}

function seedDatabase() {
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO servers (
      id, name, map, install_dir, session_name, game_port, query_port,
      rcon_port, server_password, admin_password, cluster_id, cluster_dir,
      extra_args, mods, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    serverId,
    serverName,
    "TheIsland_WP",
    serverDir,
    `Session ${serverName}`,
    28777,
    28015,
    28020,
    null,
    "admin1234",
    null,
    null,
    "[]",
    "[]",
    now,
    now,
  );

  const updateJobs = [
    job("update-blocked", "update", serverId, "running", "applying-files", {
      wasRunning: true,
    }),
    {
      ...job(
        "install-retryable",
        "install-files",
        serverId,
        "blocked",
        "restarting-server",
        { wasRunning: false },
      ),
      operatorRetryAllowed: true,
    },
    job("verify-cancelled", "verify-files", serverId, "cancelled", "cancelled"),
    job("missing-profile", "install-files", "deleted-server", "running", "validating"),
  ];
  const backupJobs = [
    {
      ...job("restore-blocked", "restore", serverId, "running", "applying-restore"),
      backupId: "missing-backup-e2e",
      idempotencyKey: `restore:${serverId}:missing-backup-e2e`,
    },
  ];
  const set = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  set.run("criticalJobsQueue.v1", JSON.stringify(updateJobs), now);
  set.run("backupCriticalJobsQueue.v1", JSON.stringify(backupJobs), now);
  db.close();
}

async function openRecoveryUi(app, errors) {
  const page = await app.firstWindow();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  await page.locator("[data-downloads-page]").waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await page.locator('[data-download-row="update-blocked"]').waitFor({
    state: "visible",
    timeout: 15_000,
  });
  return page;
}

async function expectText(locator, value) {
  await locator.getByText(value, { exact: false }).first().waitFor({ state: "visible" });
}

async function assertRecoveryState(page, expectCancelled, expectRetryable) {
  const update = page.locator('[data-download-row="update-blocked"]');
  await expectText(update, "blocked");
  await expectText(update, "Applying files");
  assert.equal(await update.getByRole("button", { name: /Retry/i }).count(), 1);
  assert.equal(await update.getByRole("button", { name: /Dismiss/i }).count(), 1);

  const restore = page.locator('[data-download-row="restore-blocked"]');
  await restore.waitFor({ state: "visible" });
  await expectText(restore, "blocked");
  assert.equal(await restore.getByRole("button", { name: /Retry/i }).count(), 1);

  const missing = page.locator('[data-download-row="missing-profile"]');
  await expectText(missing, "failed");
  assert.equal(await missing.getByRole("button", { name: /Retry/i }).count(), 0);
  assert.equal(await missing.getByRole("button", { name: /Dismiss/i }).count(), 1);

  const cancelled = page.locator('[data-download-row="verify-cancelled"]');
  if (expectCancelled) {
    await expectText(cancelled, "cancelled");
    assert.equal(await cancelled.getByRole("button", { name: /Retry/i }).count(), 1);
    assert.equal(await cancelled.getByRole("button", { name: /Dismiss/i }).count(), 1);
  } else {
    assert.equal(await cancelled.count(), 0);
  }

  const retryable = page.locator('[data-download-row="install-retryable"]');
  if (expectRetryable) {
    await expectText(retryable, "Restarting server");
    assert.equal(await retryable.getByRole("button", { name: /Retry/i }).count(), 1);
  } else {
    assert.equal(await retryable.count(), 0);
  }
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Critical-job E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(serversRoot, serverDir);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(serverDir, { recursive: true });

  let app = null;
  let succeeded = false;
  const errors = [];
  try {
    // Initialize the real embedded schema before seeding interrupted states.
    app = await launchApp();
    await app.firstWindow();
    await quitApp(app);
    app = null;
    seedDatabase();

    app = await launchApp();
    let page = await openRecoveryUi(app, errors);
    await assertRecoveryState(page, true, true);

    // Retry a replay-safe recovered finish path through rendered UI and IPC.
    // wasRunning=false avoids launching an ASA process while still exercising
    // queue routing, the instance lock, durable removal, and progress refresh.
    const retryable = page.locator('[data-download-row="install-retryable"]');
    await retryable.getByRole("button", { name: /Retry/i }).click();
    await retryable.waitFor({ state: "detached", timeout: 10_000 });

    // Exercise terminal dismissal through the same renderer/preload/main path.
    const cancelled = page.locator('[data-download-row="verify-cancelled"]');
    await cancelled.getByRole("button", { name: /Dismiss/i }).click();
    await cancelled.waitFor({ state: "detached", timeout: 10_000 });
    await quitApp(app);
    app = null;

    // Second restart proves recovered states and the dismissal persisted.
    app = await launchApp();
    page = await openRecoveryUi(app, errors);
    await assertRecoveryState(page, false, false);

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(`E2E_CRITICAL_JOB_RECOVERY_OK profile=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitApp(app);
      } catch (error) {
        console.warn(`E2E_CRITICAL_JOB_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      assertFixturePath(profilesRoot, profileDir);
      assertFixturePath(serversRoot, serverDir);
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(serverDir, { recursive: true, force: true });
    } else {
      console.error(`E2E_CRITICAL_JOB_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_CRITICAL_JOB_SERVER_PRESERVED ${serverDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_CRITICAL_JOB_RECOVERY_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
