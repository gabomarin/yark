/**
 * E2E: Settings log retention (#84).
 *
 * Seeds outdated events + update-log files into an isolated userData profile so
 * Scan is guaranteed to find removable items (not an empty-result flake).
 *
 * Usage: npm run build && npm run e2e:log-retention
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function touchAge(filePath, daysAgo) {
  const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  fs.utimesSync(filePath, when, when);
}

function writeUpdateLog(dir, fileName, exitCode, daysAgo) {
  const fullPath = path.join(dir, fileName);
  fs.writeFileSync(
    fullPath,
    `exitCode=${exitCode}\ndurationMs=12\n--- stdout ---\nseeded for e2e\n`,
    "utf8",
  );
  touchAge(fullPath, daysAgo);
}

/**
 * Insert retention fixtures after the app has created the DB / a server row.
 * Disables auto-cleanup in app_settings so the next launch does not race Scan.
 */
function seedRetentionFixtures(userData) {
  const dbPath = path.join(userData, "yark-server-manager.db");
  assert.ok(fs.existsSync(dbPath), `DB missing: ${dbPath}`);

  const db = new DatabaseSync(dbPath);
  try {
    const server = db.prepare("SELECT id, name FROM servers ORDER BY name LIMIT 1").get();
    assert.ok(server, "Expected at least one server profile to seed update logs");
    const serverId = server.id;

    db.prepare("DELETE FROM events").run();

    const insert = db.prepare(
      `INSERT INTO events (server_id, type, severity, message, created_at, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insert.run(
      serverId,
      "server_started",
      "info",
      "Old routine start (should be removed)",
      daysAgoIso(100),
      null,
    );
    insert.run(
      serverId,
      "server_stopped",
      "info",
      "Recent routine stop (should be kept)",
      daysAgoIso(5),
      null,
    );
    insert.run(
      serverId,
      "update_failed",
      "error",
      "Old failure still inside failure window (should be kept)",
      daysAgoIso(100),
      null,
    );
    insert.run(
      serverId,
      "error",
      "error",
      "Ancient failure outside failure window (should be removed)",
      daysAgoIso(200),
      null,
    );

    const policy = {
      eventsRetainDays: 90,
      eventsFailureRetainDays: 180,
      updateLogsRetainCount: 1,
      updateLogsFailureRetainDays: 180,
      autoCleanupEnabled: false,
    };
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run("logRetention.v1", JSON.stringify(policy), new Date().toISOString());

    const updateLogsDir = path.join(userData, "update-logs");
    fs.mkdirSync(updateLogsDir, { recursive: true });
    for (const name of fs.readdirSync(updateLogsDir)) {
      if (name.startsWith(`${serverId}-`)) {
        fs.unlinkSync(path.join(updateLogsDir, name));
      }
    }

    // Newest successful first by mtime; retain count 1 → two older successes removable.
    writeUpdateLog(updateLogsDir, `${serverId}-success-keep.log`, 0, 1);
    writeUpdateLog(updateLogsDir, `${serverId}-success-old-a.log`, 0, 10);
    writeUpdateLog(updateLogsDir, `${serverId}-success-old-b.log`, 0, 20);
    writeUpdateLog(updateLogsDir, `${serverId}-fail-recent.log`, 1, 20);
    writeUpdateLog(updateLogsDir, `${serverId}-fail-ancient.log`, 1, 200);

    return {
      serverId,
      serverName: server.name,
      // 2 events + 2 success logs + 1 ancient fail = 5 removable under policy above
      expectedMinRemovable: 5,
    };
  } finally {
    db.close();
  }
}

async function dismissOpenMenus(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const openMenu = page.locator('[role="menu"]');
    if ((await openMenu.count()) === 0) {
      return;
    }
    await page.keyboard.press("Escape");
    try {
      await openMenu.first().waitFor({ state: "hidden", timeout: 1500 });
      return;
    } catch {
      // Menu still present — try Escape again.
    }
  }
}

async function removeServerIfPresent(page, name) {
  const card = page.locator("[data-server-card]", {
    has: page.getByText(name, { exact: true }),
  }).first();
  if ((await card.count()) === 0) {
    return;
  }

  await dismissOpenMenus(page);
  await card.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menu").waitFor({ state: "visible", timeout: 5000 });
  const deleteAction = page.getByRole("menuitem", { name: "Delete server" });
  if ((await deleteAction.count()) === 0) {
    await dismissOpenMenus(page);
    return;
  }

  await deleteAction.click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await card.waitFor({ state: "detached", timeout: 15000 });
  await dismissOpenMenus(page);
}

function cleanupDiskArtifacts(userData, installDir) {
  try {
    fs.rmSync(installDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`WARN: could not remove install dir ${installDir}: ${error?.message ?? error}`);
  }
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch (error) {
    console.warn(`WARN: could not remove userData ${userData}: ${error?.message ?? error}`);
  }
}

async function goNav(page, label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(250);
}

async function createSeedServer(page, serverName, installDir, ports) {
  await page.getByRole("button", { name: "New server" }).first().click();
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

  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }

  await leaveWorkspaceToServers(page);
}

async function launchApp(projectRoot, userData) {
  return electron.launch({
    args: [`--user-data-dir=${userData}`, "."],
    cwd: projectRoot,
  });
}

async function waitSettingsReady(page) {
  await goNav(page, "Settings");
  await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({
    timeout: 10000,
  });
  const section = page.getByRole("heading", { name: "Log retention", level: 3 });
  await section.waitFor({ state: "visible", timeout: 10000 });
  await section.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        'input[type="checkbox"][aria-label="Clean up logs automatically"]:not([disabled])',
      );
      return el !== null;
    },
    { timeout: 10000 },
  );
  return section;
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "yark-e2e-log-retention-"));
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const serverName = `E2E-LogRet-${runId}`;
  const installDir =
    process.platform === "win32"
      ? `C:\\asa-e2e\\log-ret-${runId}`
      : path.join(os.tmpdir(), `asa-e2e-log-ret-${runId}`);
  const ports = {
    game: 23000 + Math.floor(Math.random() * 500),
    query: 24000 + Math.floor(Math.random() * 500),
    rcon: 25000 + Math.floor(Math.random() * 500),
  };

  const consoleErrors = [];
  const pageErrors = [];
  let app = await launchApp(projectRoot, userData);

  try {
    let page = await app.firstWindow();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.waitForLoadState("domcontentloaded");
    await page.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: 20000,
    });

    // Disable auto-cleanup before the 60s scheduler can fire.
    await waitSettingsReady(page);
    const autoSwitch = page.getByRole("switch", {
      name: "Clean up logs automatically",
    });
    if (await autoSwitch.isChecked()) {
      await autoSwitch.click({ force: true });
      await page.waitForTimeout(400);
    }
    assert.equal(await autoSwitch.isChecked(), false);

    assert.equal(
      await page.getByRole("button", { name: /^Save$/i }).count(),
      0,
      "Log retention must not show a Save button",
    );

    await goNav(page, "Servers");
    await createSeedServer(page, serverName, installDir, ports);

    await app.close();
    app = null;

    const seeded = seedRetentionFixtures(userData);
    console.log(
      `SEEDED server=${seeded.serverName} id=${seeded.serverId} minRemovable=${seeded.expectedMinRemovable}`,
    );

    app = await launchApp(projectRoot, userData);
    page = await app.firstWindow();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.waitForLoadState("domcontentloaded");
    await page.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: 20000,
    });

    await waitSettingsReady(page);

    const successLogs = page.getByLabel("Keep successful update logs count");
    assert.equal(await successLogs.inputValue(), "1");

    const autoAfterSeed = page.getByRole("switch", {
      name: "Clean up logs automatically",
    });
    assert.equal(await autoAfterSeed.isChecked(), false);

    await page.getByRole("button", { name: /Clean up now/i }).click();
    await page.getByText("Clean up old logs").waitFor({
      state: "visible",
      timeout: 5000,
    });

    const scanBtn = page.getByRole("button", { name: /^Scan$/i });
    await scanBtn.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(
      await page.getByRole("button", { name: /^Remove \d+$/i }).count(),
      0,
      "Remove must stay hidden until Scan finishes with items",
    );

    await scanBtn.click();
    await page.getByRole("button", { name: /^Remove \d+$/i }).waitFor({
      state: "visible",
      timeout: 10000,
    });

    const removeLabel = await page.getByRole("button", { name: /^Remove \d+$/i }).textContent();
    const removeCount = Number((removeLabel ?? "").replace(/\D/g, ""));
    assert.ok(
      removeCount >= seeded.expectedMinRemovable,
      `Expected at least ${seeded.expectedMinRemovable} removable items, got ${removeCount}`,
    );
    assert.equal(
      await page.getByRole("button", { name: /^Scan$/i }).count(),
      0,
      "Scan button should morph into Remove when items exist",
    );
    assert.ok(
      (await page.getByText(/Will remove \d+ items?/i).count()) > 0,
      "Preview summary should list removable items",
    );

    await page.getByRole("button", { name: /^Remove \d+$/i }).click();
    await page.getByText(/Cleanup finished:/i).waitFor({
      state: "visible",
      timeout: 10000,
    });
    await page.getByText("Clean up old logs").waitFor({
      state: "hidden",
      timeout: 5000,
    });

    // Second scan should find nothing left under the same policy.
    await page.getByRole("button", { name: /Clean up now/i }).click();
    await page.getByText("Clean up old logs").waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: /^Scan$/i }).click();
    await page.getByText(/Nothing is old enough to remove yet/i).waitFor({
      state: "visible",
      timeout: 10000,
    });
    assert.ok((await page.getByRole("button", { name: /^Scan$/i }).count()) > 0);
    assert.equal(await page.getByRole("button", { name: /^Remove \d+$/i }).count(), 0);
    await page.getByRole("button", { name: /^Cancel$/i }).click();

    await goNav(page, "Servers");
    await page.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: 10000,
    });
    await removeServerIfPresent(page, serverName);

    const relevantPageErrors = pageErrors.filter(
      (msg) => !/ResizeObserver|Non-Error promise rejection/i.test(msg),
    );
    assert.equal(
      relevantPageErrors.length,
      0,
      `Unexpected page errors: ${relevantPageErrors.join(" | ")}`,
    );

    console.log("E2E_LOG_RETENTION_OK");
    console.log(`REMOVED_COUNT=${removeCount}`);
    if (consoleErrors.length > 0) {
      console.log("E2E_LOG_RETENTION_WARN_CONSOLE=" + consoleErrors.slice(0, 5).join(" | "));
    }
  } finally {
    if (app !== null) {
      try {
        const page = app.windows()[0];
        if (page !== undefined) {
          page.on("dialog", async (dialog) => {
            await dialog.accept();
          });
          try {
            await goNav(page, "Servers");
            await removeServerIfPresent(page, serverName);
          } catch {
            // Best-effort UI delete if the happy-path cleanup did not run.
          }
        }
      } catch {
        // App may already be closing.
      }
      await app.close();
      app = null;
    }
    cleanupDiskArtifacts(userData, installDir);
  }
}

run().catch((error) => {
  console.error("E2E_LOG_RETENTION_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
