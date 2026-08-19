/**
 * E2E: Pause then Resume an active Install without cancelling it (#201).
 *
 * Hanging SteamCMD stub (not a real depot download). A second queued Install
 * must stay queued while the first is paused.
 *
 * Usage: npm run build && npm run e2e:downloads-pause-resume
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
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
} = require("./e2e-launch.cjs");

const JOB_INSTALL = "job-install";
const JOB_QUEUED = "job-queued";

function compileHangingSteamCmdStub(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const stubExe = path.join(dir, "steamcmd.exe");
  const stubPs1 = path.join(dir, "build-stub.ps1");
  const escaped = stubExe.replace(/'/g, "''");
  fs.writeFileSync(
    stubPs1,
    [
      "$ErrorActionPreference = 'Stop'",
      "$code = @'",
      "using System;",
      "using System.Linq;",
      "static class P {",
      "  static int Main(string[] args) {",
      "    Console.WriteLine(\"Loading Steam API...\");",
      "    var quitOnly = args.Any(a => a == \"+quit\") && !args.Any(a => a == \"+app_update\");",
      "    if (!quitOnly) {",
      "      Console.WriteLine(\"Update state (0x0) 0/1, 0 -- [ 18%]\");",
      "      System.Threading.Thread.Sleep(180000);",
      "    }",
      "    return 0;",
      "  }",
      "}",
      "'@",
      `Add-Type -OutputType ConsoleApplication -OutputAssembly '${escaped}' -TypeDefinition $code`,
      `if (-not (Test-Path -LiteralPath '${escaped}')) { throw 'stub missing' }`,
      "",
    ].join("\n"),
    "utf8",
  );
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", stubPs1],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  assert.ok(fs.existsSync(stubExe), `SteamCMD stub missing at ${stubExe}`);
  return stubExe;
}

function galleryJob(id, type, serverId, status, phase) {
  const now = "2026-08-18T12:00:00.000Z";
  return {
    id,
    type,
    serverId,
    attempts: 0,
    maxAttempts: 3,
    status,
    phase,
    createdAt: now,
    updatedAt: now,
    lastError: null,
    recoveryReason: null,
    idempotencyKey: `${type}:${serverId}:`,
    operatorRetryAllowed: false,
    context: {},
  };
}

function seedFleetAndJobs(userData, serversDir, steamCmdPath) {
  const dbPath = path.join(userData, "yark-server-manager.db");
  assert.ok(fs.existsSync(dbPath), `DB missing at ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO servers (
      id, name, map, install_dir, enabled, session_name,
      game_port, query_port, rcon_port,
      server_password, admin_password,
      cluster_id, cluster_dir, extra_args, mods,
      disabled_mods, mod_metadata_cache, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const servers = [
    { id: "e2e-pause-island", name: "Island", map: "TheIsland_WP", folder: "island" },
    { id: "e2e-pause-scorched", name: "Scorched", map: "ScorchedEarth_WP", folder: "scorched" },
  ];
  servers.forEach((server, index) => {
    const installDir = path.join(serversDir, server.folder);
    fs.mkdirSync(installDir, { recursive: true });
    insert.run(
      server.id,
      server.name,
      server.map,
      installDir,
      1,
      `Session ${server.name}`,
      18100 + index * 10,
      38100 + index * 10,
      39100 + index * 10,
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
  });
  const jobs = [
    galleryJob(JOB_INSTALL, "install-files", "e2e-pause-island", "pending", "queued"),
    galleryJob(JOB_QUEUED, "install-files", "e2e-pause-scorched", "pending", "queued"),
  ];
  const set = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  set.run("criticalJobsQueue.v1", JSON.stringify(jobs), now);
  set.run("steamcmdPath", steamCmdPath, now);
  db.close();
}

async function dumpDownloads(page, label) {
  const metrics = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-download-row]")];
    return {
      groups: [...document.querySelectorAll("[data-queue-group]")].map((el) =>
        el.getAttribute("data-queue-group"),
      ),
      rows: rows.map((row) => ({
        id: row.getAttribute("data-download-row"),
        kind: row.getAttribute("data-kind"),
        text: (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
      })),
      steamCmdBar: document.querySelector('[role="group"][aria-label="SteamCMD process"]') !== null,
    };
  });
  console.error(`DUMP ${label} ${JSON.stringify(metrics, null, 2)}`);
}

async function openDownloads(page) {
  await page.getByRole("button", { name: "Downloads", exact: true }).first().click();
  await page.locator("[data-downloads-page]").waitFor({ state: "visible", timeout: 15_000 });
}

async function waitRowKind(page, id, kind, timeout = 20_000) {
  await page.locator(`[data-download-row="${id}"][data-kind="${kind}"]`).waitFor({
    state: "visible",
    timeout,
  });
}

async function run() {
  assert.equal(
    process.platform,
    "win32",
    "Pause/Resume E2E needs Windows (hanging steamcmd.exe stub).",
  );
  process.chdir(projectRoot);

  const { profileDir, serversDir, fixtureName, root } = createE2eFixtureRoots(
    "downloads-pause",
  );
  assert.ok(serversDir, "serversDir required");
  assertUnderFixtureRoot(path.join(root, "profiles"), profileDir);
  assertUnderFixtureRoot(path.join(root, "servers"), serversDir);

  const stubDir = path.join(profileDir, "steamcmd-stub");
  const stubExe = compileHangingSteamCmdStub(stubDir);

  let app = null;
  let succeeded = false;
  const errors = [];
  try {
    app = await launchElectronApp({
      profileDir,
      extraEnv: { STEAMCMD_PATH: stubExe },
    });
    await waitForOverview(app);
    await quitElectronApp(app);
    app = null;

    seedFleetAndJobs(profileDir, serversDir, stubExe);

    app = await launchElectronApp({
      profileDir,
      extraEnv: { STEAMCMD_PATH: stubExe },
    });
    const page = await waitForOverview(app);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await page.setViewportSize({ width: 1440, height: 900 });

    await openDownloads(page);
    try {
      await waitRowKind(page, JOB_INSTALL, "active", 25_000);
    } catch (error) {
      await dumpDownloads(page, "install-not-active");
      throw error;
    }
    await waitRowKind(page, JOB_QUEUED, "queued", 10_000);
    assert.equal(
      await page.locator('[data-queue-group="attention"] [data-download-row]').count(),
      0,
      "Live installs must not land in Needs attention before Pause",
    );

    await page.locator(`[data-download-row="${JOB_INSTALL}"]`).click();
    await page.getByRole("group", { name: "SteamCMD process" }).waitFor({
      state: "visible",
      timeout: 15_000,
    });
    const pauseBtn = page.getByRole("button", { name: "Pause SteamCMD" });
    await pauseBtn.waitFor({ state: "visible", timeout: 10_000 });
    await pauseBtn.click();

    try {
      await waitRowKind(page, JOB_INSTALL, "paused", 25_000);
    } catch (error) {
      await dumpDownloads(page, "install-not-paused");
      throw error;
    }
    await waitRowKind(page, JOB_QUEUED, "queued", 5_000);
    assert.equal(
      await page.locator(`[data-download-row="${JOB_INSTALL}"][data-kind="attention"]`).count(),
      0,
      "Pause must not move the install to Needs attention",
    );
    assert.equal(
      await page
        .locator(`[data-download-row="${JOB_INSTALL}"]`)
        .getByText("cancelled", { exact: true })
        .count(),
      0,
      "Pause must not mark the install cancelled",
    );
    assert.equal(
      await page.getByRole("group", { name: "SteamCMD process" }).count(),
      0,
      "Paused install must not keep the SteamCMD process bar",
    );
    assert.equal(
      await page.getByRole("button", { name: "Pause SteamCMD" }).count(),
      0,
    );
    await page.locator(`[data-download-row="${JOB_INSTALL}"]`).click();
    const resumeBtn = page.getByRole("button", { name: "Resume this job" });
    await resumeBtn.waitFor({ state: "visible", timeout: 10_000 });
    await resumeBtn.click();

    try {
      await waitRowKind(page, JOB_INSTALL, "active", 25_000);
    } catch (error) {
      await dumpDownloads(page, "install-not-resumed");
      throw error;
    }
    await waitRowKind(page, JOB_QUEUED, "queued", 5_000);
    await page.locator(`[data-download-row="${JOB_INSTALL}"]`).click();
    await page.getByRole("button", { name: "Pause SteamCMD" }).waitFor({
      state: "visible",
      timeout: 15_000,
    });
    assert.equal(
      await page.locator('[data-queue-group="attention"] [data-download-row]').count(),
      0,
      "Resume must not dump jobs into Needs attention",
    );

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(`E2E_DOWNLOADS_PAUSE_RESUME_OK fixture=${fixtureName}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_DOWNLOADS_PAUSE_RESUME_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
    } else {
      console.error(`E2E_DOWNLOADS_PAUSE_RESUME_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_DOWNLOADS_PAUSE_RESUME_SERVER_PRESERVED ${serversDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_DOWNLOADS_PAUSE_RESUME_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
