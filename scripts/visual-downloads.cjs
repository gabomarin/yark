/**
 * Downloads queue visual review per docs/visual-testing.md (#201).
 *
 * 1) Needs attention — no SteamCMD. Seeds + boot recovery + operator cancel.
 * 2) Happy path — hanging SteamCMD stub so Active / Queued / Paused stay live.
 *
 * Usage: npm run build && node scripts/visual-downloads.cjs
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");
const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

const FLEET = [
  { id: "visual-dl-0", name: "Island", map: "TheIsland_WP" },
  { id: "visual-dl-1", name: "Scorched", map: "ScorchedEarth_WP" },
  { id: "visual-dl-2", name: "Aberration", map: "Aberration_WP" },
  { id: "visual-dl-3", name: "Extinction", map: "Extinction_WP" },
  { id: "visual-dl-4", name: "Valguero", map: "Valguero_WP" },
  { id: "visual-dl-5", name: "Center", map: "TheCenter_WP" },
];

function launchEnv(userData, extra = {}) {
  const env = { ...process.env, YARK_E2E_USER_DATA: userData, ...extra };
  if (typeof extra.STEAMCMD_PATH !== "string" || extra.STEAMCMD_PATH.trim() === "") {
    delete env.STEAMCMD_PATH;
  }
  return env;
}

async function launchApp(userData, extraEnv = {}) {
  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env: launchEnv(userData, extraEnv),
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

async function goNav(page, label) {
  const btn = page.getByRole("button", { name: label, exact: true }).first();
  await btn.waitFor({ state: "visible", timeout: 10_000 });
  await btn.click();
  await page.waitForTimeout(250);
}

function job(id, type, serverId, status, phase, extra = {}) {
  const now = "2026-08-18T12:00:00.000Z";
  return {
    id,
    type,
    serverId,
    attempts: extra.attempts ?? (status === "failed" ? 3 : status === "cancelled" ? 1 : 2),
    maxAttempts: 3,
    status,
    phase,
    createdAt: now,
    updatedAt: now,
    lastError:
      extra.lastError
      ?? (status === "failed" || status === "blocked" ? "Visual fixture interruption" : null),
    recoveryReason: extra.recoveryReason ?? null,
    idempotencyKey: extra.idempotencyKey ?? `${type}:${serverId}:`,
    operatorRetryAllowed: extra.operatorRetryAllowed === true,
    context: extra.context ?? {},
  };
}

function seedServers(db, userData) {
  db.prepare("DELETE FROM servers").run();
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
  FLEET.forEach((server, index) => {
    const installDir = path.join(userData, "servers", `server-${index}`);
    fs.mkdirSync(installDir, { recursive: true });
    insert.run(
      server.id,
      server.name,
      server.map,
      installDir,
      1,
      `Session ${server.name}`,
      18000 + index * 10,
      38000 + index * 10,
      39000 + index * 10,
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
}

function writeJobs(db, jobs, steamCmdPath) {
  const now = new Date().toISOString();
  const set = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  set.run("criticalJobsQueue.v1", JSON.stringify(jobs), now);
  if (steamCmdPath) {
    set.run("steamcmdPath", steamCmdPath, now);
  }
}

function openDb(userData) {
  const dbPath = path.join(userData, "yark-server-manager.db");
  assert.ok(fs.existsSync(dbPath), `DB missing at ${dbPath}`);
  return new DatabaseSync(dbPath);
}

function seedAttentionJobs(userData) {
  const db = openDb(userData);
  seedServers(db, userData);
  writeJobs(db, [
    job("job-paused", "install-files", "visual-dl-0", "paused", "applying-files", {
      recoveryReason: "Paused by the operator. Resume to continue.",
    }),
    job("job-pending-legacy", "update", "visual-dl-1", "pending", "queued"),
    job("job-cancelled", "verify-files", "visual-dl-2", "cancelled", "cancelled", {
      recoveryReason: "Cancelled by the operator during execution.",
    }),
    job("job-blocked-ambiguous", "update", "visual-dl-3", "blocked", "applying-files", {
      operatorRetryAllowed: true,
      recoveryReason: "The app stopped during an ambiguous phase.",
      context: { wasRunning: true },
    }),
    job("job-failed-retry", "install-files", "visual-dl-4", "failed", "failed", {
      operatorRetryAllowed: true,
      lastError: "SteamCMD validate exited with code 1",
      recoveryReason: "Retry limit reached after 3 attempts.",
    }),
    job("job-failed-dismiss", "update", "visual-dl-5", "failed", "failed", {
      operatorRetryAllowed: false,
      lastError: "This validation failure is not safe to retry automatically.",
      recoveryReason: "This validation, security, cancellation, or missing-resource failure is not safe to retry automatically.",
    }),
    job("job-missing-profile", "install-files", "deleted-server", "running", "validating"),
    job("job-crash-ambiguous", "verify-files", "visual-dl-3", "running", "stopping-server", {
      idempotencyKey: "verify-files:visual-dl-3:crash",
      context: { wasRunning: true },
    }),
  ]);
  db.close();
}

function seedHappyJobs(userData, steamCmdPath) {
  const db = openDb(userData);
  seedServers(db, userData);
  writeJobs(
    db,
    [
      job("job-island-verify", "verify-files", "visual-dl-0", "pending", "queued"),
      job("job-scorched-verify", "verify-files", "visual-dl-1", "pending", "queued"),
      job("job-aberration-update", "update", "visual-dl-2", "pending", "queued"),
      job("job-extinction-paused", "install-files", "visual-dl-3", "paused", "applying-files", {
        recoveryReason: "Paused by the operator. Resume to continue.",
      }),
    ],
    steamCmdPath,
  );
  db.close();
}

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
      "      Console.WriteLine(\"Update state (0x0) 0/1, 0 -- [ 12%]\");",
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

async function screenshot(page, outDir, name) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
}

async function measureDownloads(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const pageRoot = document.querySelector("[data-downloads-page]");
    const footer = document.querySelector("[data-downloads-footer]");
    const groups = [...document.querySelectorAll("[data-queue-group]")];
    const rows = [...document.querySelectorAll("[data-download-row]")];
    const steamCmdBar = document.querySelector('[role="group"][aria-label="SteamCMD process"]');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      pageVisible: pageRoot !== null,
      footerVisible: footer !== null,
      footerText: footer ? footer.textContent.replace(/\s+/g, " ").trim() : "",
      reviewBadge: footer ? /Review/.test(footer.textContent) : false,
      groups: groups.map((group) => group.getAttribute("data-queue-group")),
      rows: rows.map((row) => ({
        id: row.getAttribute("data-download-row"),
        kind: row.getAttribute("data-kind"),
        text: (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
      })),
      steamCmdBar: steamCmdBar !== null,
    };
  });
}

async function dumpDownloads(page, label) {
  const metrics = await measureDownloads(page);
  console.error(`DUMP ${label} ${JSON.stringify(metrics, null, 2)}`);
}

function rowByServer(page, kind, serverName) {
  return page.locator(`[data-kind="${kind}"][data-download-row]`).filter({
    hasText: serverName,
  });
}

async function assertRowKind(page, id, kind) {
  const row = page.locator(`[data-download-row="${id}"][data-kind="${kind}"]`);
  await row.waitFor({ state: "visible", timeout: 15_000 });
}

async function openDownloads(page) {
  await goNav(page, "Downloads");
  await page.locator("[data-downloads-page]").waitFor({ state: "visible", timeout: 10_000 });
}

async function openServers(page) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10_000 });
}

async function replaceQueuedVerifyFromOverview(page, serverName) {
  await openServers(page);
  const card = page.locator(`[data-server-card][data-server-name="${serverName}"]`);
  await card.waitFor({ state: "visible", timeout: 15_000 });
  await card.scrollIntoViewIfNeeded();
  const installBtn = card.getByRole("button", { name: "Install server files" });
  await installBtn.waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(
    await installBtn.isEnabled(),
    true,
    `${serverName}: Install should replace a queued Verify`,
  );
  await installBtn.click();
  await page
    .locator(".mantine-Notification-root")
    .filter({ hasText: /replaced Verify/i })
    .first()
    .waitFor({ state: "visible", timeout: 8_000 });
}

async function bootSeededApp(userData, extraEnv = {}) {
  let app = await launchApp(userData, extraEnv);
  await app.firstWindow();
  await quitApp(app);
  return app;
}

async function runAttentionScenario(outDir, findings, errors) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "yark-visual-dl-attn-"));
  await bootSeededApp(userData);
  seedAttentionJobs(userData);

  const app = await launchApp(userData);
  try {
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`attn console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`attn pageerror: ${error.message}`));
    await page.waitForLoadState("domcontentloaded");
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 20_000 });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(400);
    await screenshot(page, outDir, "attn-overview-teaser-fhd");

    const footer = page.locator("[data-downloads-footer]");
    assert.equal(await footer.count(), 1, "Overview teaser while attention jobs exist");
    assert.equal(await footer.getByText("Review", { exact: true }).count(), 1, "Footer Review badge");
    assert.equal(await footer.getByRole("button", { name: /^Resume$/i }).count(), 0);

    await openDownloads(page);
    await page.locator("[data-steamcmd-missing-banner]").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByText("Needs attention", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("Paused", { exact: true }).waitFor({ state: "visible" });

    await assertRowKind(page, "job-paused", "paused");
    await assertRowKind(page, "job-pending-legacy", "attention");
    await assertRowKind(page, "job-cancelled", "attention");
    await assertRowKind(page, "job-blocked-ambiguous", "attention");
    await assertRowKind(page, "job-failed-retry", "attention");
    await assertRowKind(page, "job-failed-dismiss", "attention");
    await assertRowKind(page, "job-missing-profile", "attention");
    await assertRowKind(page, "job-crash-ambiguous", "attention");

    const pendingLegacy = page.locator('[data-download-row="job-pending-legacy"]');
    assert.equal(await pendingLegacy.getByText("blocked", { exact: true }).count(), 1);
    assert.equal(await pendingLegacy.getByRole("button", { name: /Retry/i }).count(), 1);

    const failedDismiss = page.locator('[data-download-row="job-failed-dismiss"]');
    assert.equal(await failedDismiss.getByRole("button", { name: /Retry/i }).count(), 0);
    assert.equal(await failedDismiss.getByRole("button", { name: /Dismiss/i }).count(), 1);

    const cancelled = page.locator('[data-download-row="job-cancelled"]');
    assert.equal(await cancelled.getByRole("button", { name: /Retry/i }).count(), 1);
    assert.equal(await cancelled.getByRole("button", { name: /Dismiss/i }).count(), 1);

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(300);
      if (size.name === "hd") {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(200);
        await page.mouse.wheel(0, -400);
      }
      const metrics = await measureDownloads(page);
      await screenshot(page, outDir, `attn-queue-${size.name}`);
      findings.push({ step: `attn-queue-${size.name}`, metrics });
      assert.equal(metrics.pageVisible, true);
      assert.equal(metrics.hasHorizontalOverflow, false, `${size.name} horizontal overflow`);
      assert.ok(metrics.groups.includes("paused"), `${size.name} Paused section`);
      assert.ok(metrics.groups.includes("attention"), `${size.name} Needs attention section`);
      assert.equal(metrics.groups.includes("queued"), false, `${size.name} pending leftover must not stay Queued`);
      assert.equal(
        metrics.rows.filter((row) => row.kind === "attention").length >= 7,
        true,
        `${size.name} expected boot-triggered attention rows`,
      );
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    const detailCases = [
      { id: "job-pending-legacy", file: "attn-detail-blocked-missing-steamcmd-fhd", retry: true, dismiss: true },
      { id: "job-cancelled", file: "attn-detail-cancelled-fhd", retry: true, dismiss: true },
      { id: "job-blocked-ambiguous", file: "attn-detail-blocked-ambiguous-fhd", retry: true, dismiss: true },
      { id: "job-failed-retry", file: "attn-detail-failed-retry-fhd", retry: true, dismiss: true },
      { id: "job-failed-dismiss", file: "attn-detail-failed-dismiss-only-fhd", retry: false, dismiss: true },
      { id: "job-missing-profile", file: "attn-detail-missing-profile-fhd", retry: false, dismiss: true },
      { id: "job-crash-ambiguous", file: "attn-detail-crash-ambiguous-fhd", retry: true, dismiss: true },
    ];
    for (const item of detailCases) {
      const row = page.locator(`[data-download-row="${item.id}"]`);
      await row.click();
      await page.waitForTimeout(200);
      const metrics = await measureDownloads(page);
      assert.equal(metrics.steamCmdBar, false, `${item.id} must not show SteamCMD process bar`);
      assert.equal(await page.getByRole("button", { name: /^Retry$/i }).count(), item.retry ? 1 : 0, `${item.id} Retry`);
      assert.equal(await page.getByRole("button", { name: /^Dismiss$/i }).count(), item.dismiss ? 1 : 0, `${item.id} Dismiss`);
      await screenshot(page, outDir, item.file);
    }

    const paused = page.locator('[data-download-row="job-paused"]');
    await paused.click();
    await page.waitForTimeout(200);
    await screenshot(page, outDir, "attn-detail-paused-not-attention-fhd");
    assert.equal(await paused.getByRole("button", { name: /Resume/i }).count(), 1);
    await paused.getByRole("button", { name: /Cancel download/i }).click();
    await page.waitForTimeout(400);
    await assertRowKind(page, "job-paused", "attention");
    await screenshot(page, outDir, "attn-after-cancel-paused-fhd");

    await pendingLegacy.getByRole("button", { name: /Retry/i }).click();
    await page
      .locator(".mantine-Notification-description")
      .filter({ hasText: /Open Settings and install SteamCMD/i })
      .first()
      .waitFor({ state: "visible", timeout: 8_000 });

    await goNav(page, "Downloads");
    await cancelled.click();
    await cancelled.getByRole("button", { name: /Dismiss/i }).click();
    await cancelled.waitFor({ state: "detached", timeout: 10_000 });
    await screenshot(page, outDir, "attn-after-dismiss-cancelled-fhd");
    findings.push({ step: "attention-ok" });
  } finally {
    await quitApp(app).catch(() => app.close().catch(() => {}));
  }
}

async function runHappyPathScenario(outDir, findings, errors, stubExe) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "yark-visual-dl-happy-"));
  await bootSeededApp(userData);
  seedHappyJobs(userData, stubExe);

  const app = await launchApp(userData, { STEAMCMD_PATH: stubExe });
  try {
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`happy console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`happy pageerror: ${error.message}`));
    await page.waitForLoadState("domcontentloaded");
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 20_000 });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    await screenshot(page, outDir, "happy-overview-teaser-fhd");
    const footer = page.locator("[data-downloads-footer]");
    assert.equal(await footer.count(), 1);
    assert.equal(await footer.getByText("Review", { exact: true }).count(), 0, "Happy path footer has no Review badge");

    await openDownloads(page);
    await screenshot(page, outDir, "happy-downloads-boot-fhd");
    assert.equal(await page.locator("[data-steamcmd-missing-banner]").count(), 0);
    const islandActive = rowByServer(page, "active", "Island");
    try {
      await islandActive.waitFor({
        state: "visible",
        timeout: 20_000,
      });
    } catch (error) {
      await dumpDownloads(page, "happy-island-not-active");
      throw error;
    }
    await assertRowKind(page, "job-scorched-verify", "queued");
    await assertRowKind(page, "job-aberration-update", "queued");
    await assertRowKind(page, "job-extinction-paused", "paused");
    assert.equal(
      await page.locator('[data-queue-group="attention"] [data-download-row]').count(),
      0,
      "Happy path must not dump live jobs into Needs attention",
    );

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(300);
      if (size.name === "hd") {
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(200);
        await page.mouse.wheel(0, -300);
      }
      const metrics = await measureDownloads(page);
      await screenshot(page, outDir, `happy-queue-${size.name}`);
      findings.push({ step: `happy-queue-${size.name}`, metrics });
      assert.equal(metrics.hasHorizontalOverflow, false, `${size.name} happy overflow`);
      assert.ok(metrics.groups.includes("active"), `${size.name} Active`);
      assert.ok(metrics.groups.includes("queued"), `${size.name} Queued`);
      assert.ok(metrics.groups.includes("paused"), `${size.name} Paused`);
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await rowByServer(page, "active", "Island").click();
    await page.waitForTimeout(200);
    await page.getByRole("group", { name: "SteamCMD process" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("button", { name: "Cancel SteamCMD" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Remove from queue" }).count(), 0);
    await screenshot(page, outDir, "happy-detail-active-steamcmd-bar-fhd");

    await page.locator('[data-download-row="job-scorched-verify"]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.getByRole("group", { name: "SteamCMD process" }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Remove from queue" }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Cancel SteamCMD" }).count(), 0);
    await screenshot(page, outDir, "happy-detail-queued-no-steamcmd-bar-fhd");

    const aberration = page.locator('[data-download-row="job-aberration-update"]');
    await aberration.getByRole("button", { name: "Move up in queue" }).click();
    await page.waitForTimeout(400);
    await screenshot(page, outDir, "happy-after-move-up-fhd");

    await replaceQueuedVerifyFromOverview(page, "Scorched");
    await screenshot(page, outDir, "happy-overview-replace-verify-fhd");

    await openDownloads(page);
    await page.locator('[data-download-row="job-scorched-verify"]').waitFor({
      state: "detached",
      timeout: 10_000,
    });
    await rowByServer(page, "active", "Island").waitFor({ state: "visible", timeout: 10_000 });
    await assertRowKind(page, "job-extinction-paused", "paused");
    await assertRowKind(page, "job-aberration-update", "queued");
    await rowByServer(page, "queued", "Scorched").waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(
      await page.locator('[data-queue-group="attention"] [data-download-row]').count(),
      0,
      "Replaced Verify must not land in Needs attention",
    );
    assert.equal(
      await page.locator('[data-queue-group="queued"] [data-download-row]').count() >= 1,
      true,
      "Install that replaced Verify stays Queued (Island still holds SteamCMD)",
    );
    await screenshot(page, outDir, "happy-after-replace-verify-fhd");

    await aberration.getByRole("button", { name: /Cancel download|Remove from queue/i }).click();
    await page.waitForTimeout(400);
    await assertRowKind(page, "job-aberration-update", "attention");
    await rowByServer(page, "active", "Island").waitFor({ state: "visible", timeout: 10_000 });
    await assertRowKind(page, "job-extinction-paused", "paused");
    await screenshot(page, outDir, "happy-cancel-queued-goes-to-attention-fhd");

    await rowByServer(page, "active", "Island").click();
    await page.getByRole("button", { name: "Cancel SteamCMD" }).click();
    await rowByServer(page, "attention", "Island").waitFor({ state: "visible", timeout: 20_000 });
    await assertRowKind(page, "job-extinction-paused", "paused");
    await screenshot(page, outDir, "happy-cancel-active-goes-to-attention-fhd");
    findings.push({ step: "happy-ok" });
  } finally {
    await quitApp(app).catch(() => app.close().catch(() => {}));
  }
}

async function run() {
  process.chdir(projectRoot);
  assert.ok(
    fs.existsSync(path.join(projectRoot, "out", "main", "index.js")),
    "Built app missing. Run npm run build first.",
  );

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-downloads");
  fs.mkdirSync(outDir, { recursive: true });
  const findings = [];
  const errors = [];
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "yark-visual-steamcmd-"));

  console.log(`VISUAL_DOWNLOADS_OUTDIR=${outDir}`);
  try {
    await runAttentionScenario(outDir, findings, errors);
    const stubExe = compileHangingSteamCmdStub(stubDir);
    await runHappyPathScenario(outDir, findings, errors, stubExe);

    const actionable = errors.filter(
      (message) => !/Failed to load resource|net::ERR_|Failed to connect to the bus/i.test(message),
    );
    findings.push({ step: "console", errors: actionable });
    console.log(`VISUAL_DOWNLOADS_OK outDir=${outDir}`);
    console.log(JSON.stringify(findings, null, 2));
    if (actionable.length > 0) {
      throw new Error(actionable.join("\n"));
    }
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
