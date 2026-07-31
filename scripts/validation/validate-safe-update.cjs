/**
 * Real-host safe-update validation (manual Windows only — not CI).
 *
 * Drives the compiled Electron app via Playwright + window.api against a
 * disposable ASA server profile.
 *
 * IMPORTANT:
 * - Does NOT rename or replace the operator's real steamcmd.exe.
 * - Scenario C points Settings at a temporary failing stub under os.tmpdir(),
 *   then restores the previous SteamCMD path.
 * - Requires an interactive Windows session with a display.
 *
 * Usage:
 *   npm run build
 *   Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
 *   node scripts/validation/validate-safe-update.cjs --confirm
 *
 * Flags:
 *   --confirm     Required. Acknowledge disposable-profile + Settings mutation risk.
 *   --force       Alias of --confirm.
 *   --dry-run     Print plan / prereq checks and exit without launching the app.
 *
 * Env:
 *   YARK_VALIDATE_SERVER_ID   Override server id (default: islandia test profile)
 *   YARK_VALIDATE_SCENARIOS   Comma list: C,E,B,A,F,D (default all)
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ARGS = new Set(process.argv.slice(2));
const CONFIRM = ARGS.has("--confirm") || ARGS.has("--force");
const DRY_RUN = ARGS.has("--dry-run");

const DEFAULT_SERVER_ID = "f3f15932-d57a-4ce1-ae11-d10777c93d0c"; // islandia
const SERVER_ID = process.env.YARK_VALIDATE_SERVER_ID || DEFAULT_SERVER_ID;
const SCENARIOS = new Set(
  (process.env.YARK_VALIDATE_SCENARIOS || "C,E,B,A,F,D")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
);

const projectRoot = path.resolve(__dirname, "..", "..");
const userData = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "yark-server-manager",
);
const dbPath = path.join(userData, "yark-server-manager.db");
const realSteamCmdCandidate = path.join(userData, "steamcmd", "steamcmd.exe");

const evidence = {
  date: new Date().toISOString(),
  commit: null,
  serverId: SERVER_ID,
  scenarios: {},
  notes: [],
};

/** @type {string | null} */
let previousSteamCmdPath = null;
/** @type {string | null} */
let failingStubDir = null;

function requireNodeSqlite() {
  try {
    // Built-in since Node 22.5+ (same module the Electron app uses).
    return require("node:sqlite");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `node:sqlite is unavailable (need Node 22.5+). ${detail}`,
    );
  }
}

function openDb() {
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `YARK database not found at ${dbPath}. Launch the app once, or set APPDATA.`,
    );
  }
  const { DatabaseSync } = requireNodeSqlite();
  try {
    return new DatabaseSync(dbPath);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open YARK database at ${dbPath}: ${detail}`);
  }
}

function listBackupsSince(db, serverId, sinceIso) {
  return db
    .prepare(
      `SELECT id, type, kind, status, created_at AS createdAt
       FROM backups
       WHERE server_id = ? AND created_at >= ?
       ORDER BY created_at ASC`,
    )
    .all(serverId, sinceIso);
}

function listEventsSince(db, serverId, sinceIso) {
  return db
    .prepare(
      `SELECT type, severity, message, created_at AS createdAt
       FROM events
       WHERE server_id = ? AND created_at >= ?
       ORDER BY created_at ASC`,
    )
    .all(serverId, sinceIso);
}

function readSetting(key) {
  const db = openDb();
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
    return row?.value == null ? null : String(row.value);
  } finally {
    db.close();
  }
}

function writeSetting(key, value) {
  const db = openDb();
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run(key, value, now);
  } finally {
    db.close();
  }
}

function readQueue() {
  const raw = readSetting("criticalJobsQueue.v1");
  if (raw === null || raw.trim().length === 0) return [];
  return JSON.parse(raw);
}

function writeQueue(queue) {
  writeSetting("criticalJobsQueue.v1", JSON.stringify(queue));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function redactEvidence(value) {
  // Defense in depth: never echo passwords/PII-looking fields if they leak in.
  const json = JSON.stringify(value);
  return json
    .replace(/("adminPassword"\s*:\s*")[^"]*(")/gi, "$1***$2")
    .replace(/("serverPassword"\s*:\s*")[^"]*(")/gi, "$1***$2")
    .replace(/("admin_password"\s*:\s*")[^"]*(")/gi, "$1***$2")
    .replace(/("server_password"\s*:\s*")[^"]*(")/gi, "$1***$2");
}

function assertPrerequisites() {
  if (process.platform !== "win32") {
    throw new Error(
      "This validation script only runs on Windows (process.platform === \"win32\").",
    );
  }

  if (!CONFIRM && !DRY_RUN) {
    throw new Error(
      [
        "Refusing to run without --confirm.",
        "This script drives a real ASA profile, may start/stop the server, and for scenario C",
        "temporarily points YARK Settings at a temporary failing SteamCMD stub (then restores).",
        "It never renames your real steamcmd.exe.",
        "",
        "Re-run with: node scripts/validation/validate-safe-update.cjs --confirm",
        "  (--force is accepted as an alias of --confirm)",
        "Or inspect only:  node scripts/validation/validate-safe-update.cjs --dry-run",
      ].join("\n"),
    );
  }

  delete process.env.ELECTRON_RUN_AS_NODE;

  const mainJs = path.join(projectRoot, "out", "main", "index.js");
  if (!fs.existsSync(mainJs)) {
    throw new Error(
      `Built app missing (${mainJs}). Run: npm run build`,
    );
  }

  try {
    require.resolve("playwright");
  } catch {
    throw new Error(
      "playwright is not installed. Run: npm install (devDependency).",
    );
  }

  requireNodeSqlite();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`YARK DB not found: ${dbPath}`);
  }

  const configured = readSetting("steamcmdPath");
  const steamOk =
    (configured != null && fs.existsSync(configured)) ||
    fs.existsSync(realSteamCmdCandidate);
  if (!steamOk) {
    throw new Error(
      "No SteamCMD executable found (Settings steamcmdPath or userData/steamcmd/steamcmd.exe).",
    );
  }

  console.log("Prerequisites OK");
  console.log(`  project: ${projectRoot}`);
  console.log(`  userData: ${userData}`);
  console.log(`  serverId: ${SERVER_ID}`);
  console.log(`  scenarios: ${[...SCENARIOS].join(",")}`);
  console.log(`  steamcmdPath setting: ${configured ?? "(unset)"}`);
}

/**
 * Build a temporary always-failing steamcmd.exe under os.tmpdir().
 * Never writes into the operator's AppData steamcmd folder.
 */
function ensureFailingSteamCmdStub() {
  failingStubDir = fs.mkdtempSync(path.join(os.tmpdir(), "yark-steamcmd-fail-"));
  const stubExe = path.join(failingStubDir, "steamcmd.exe");
  const stubPs1 = path.join(failingStubDir, "build-stub.ps1");
  const escaped = stubExe.replace(/'/g, "''");
  fs.writeFileSync(
    stubPs1,
    [
      "$ErrorActionPreference = 'Stop'",
      "$code = @'",
      "using System;",
      "static class P {",
      "  static int Main(string[] args) {",
      "    Console.Error.WriteLine(\"yark-validate forced SteamCMD failure\");",
      "    return 1;",
      "  }",
      "}",
      "'@",
      `Add-Type -OutputType ConsoleApplication -OutputAssembly '${escaped}' -TypeDefinition $code`,
      `if (-not (Test-Path -LiteralPath '${escaped}')) { throw 'stub missing' }`,
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", stubPs1],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to compile temporary failing SteamCMD stub in ${failingStubDir}: ${detail}`,
    );
  }

  if (!fs.existsSync(stubExe)) {
    throw new Error(`Temporary SteamCMD stub was not created at ${stubExe}`);
  }
  return stubExe;
}

function cleanupFailingStub() {
  if (failingStubDir != null && fs.existsSync(failingStubDir)) {
    fs.rmSync(failingStubDir, { recursive: true, force: true });
  }
  failingStubDir = null;
}

async function withSteamCmdPath(window, nextPath, fn) {
  previousSteamCmdPath =
    (await api(window, "getSteamCmdStatus"))?.executablePath ??
    readSetting("steamcmdPath");
  try {
    await api(window, "setSteamCmdPath", nextPath);
    return await fn();
  } finally {
    if (previousSteamCmdPath != null && fs.existsSync(previousSteamCmdPath)) {
      try {
        await api(window, "setSteamCmdPath", previousSteamCmdPath);
      } catch (err) {
        // Fall back to writing settings if verify refuses the restored path mid-test.
        writeSetting("steamcmdPath", previousSteamCmdPath);
        evidence.notes.push(
          `Restored steamcmdPath via settings write after API failure: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    previousSteamCmdPath = null;
  }
}

async function launchApp() {
  const { _electron: electron } = require("playwright");
  process.chdir(projectRoot);
  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
    timeout: 120_000,
  });
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.locator("[data-overview-page]").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  return { app, window };
}

async function api(window, method, ...args) {
  const result = await window.evaluate(
    async ({ method, args }) => {
      const fn = window.api[method];
      if (typeof fn !== "function") {
        throw new Error(`window.api.${method} is not a function`);
      }
      return fn(...args);
    },
    { method, args },
  );
  if (result && typeof result === "object" && "ok" in result) {
    if (result.ok === false) {
      throw new Error(result.error || `${method} failed`);
    }
    return result.data;
  }
  return result;
}

async function getServerStatus(window, serverId) {
  const statuses = await api(window, "getStatuses");
  const list = Array.isArray(statuses) ? statuses : Object.values(statuses || {});
  const row = list.find((s) => s && s.serverId === serverId);
  return row?.status ?? "stopped";
}

async function waitForStatus(window, serverId, wanted, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getServerStatus(window, serverId);
    if (status === wanted) return status;
    if (wanted === "running" && status === "error") {
      throw new Error("Server entered error while waiting for running");
    }
    await sleep(2000);
  }
  throw new Error(`Timeout waiting for status=${wanted}`);
}

async function waitUntilSteamBusy(window, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await api(window, "getSteamCmdStatus");
    if (st?.busy === true || (st?.queuedCount ?? 0) > 0) return st;
    await sleep(500);
  }
  throw new Error("SteamCMD never became busy");
}

async function waitUntilSteamIdle(window, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = await api(window, "getSteamCmdStatus");
    if (st?.busy !== true && (st?.queuedCount ?? 0) === 0) return st;
    await sleep(2000);
  }
  throw new Error("SteamCMD never became idle");
}

function summarizeBackups(rows) {
  const byType = {};
  for (const row of rows) {
    byType[row.type] = byType[row.type] || [];
    byType[row.type].push(row.kind);
  }
  return byType;
}

async function ensureStopped(window) {
  const status = await getServerStatus(window, SERVER_ID);
  if (status === "running" || status === "starting") {
    await api(window, "stopServer", SERVER_ID);
    await waitForStatus(window, SERVER_ID, "stopped", 180_000);
  }
}

async function scenarioC() {
  const since = new Date().toISOString();
  const stubExe = ensureFailingSteamCmdStub();
  const { app, window } = await launchApp();
  try {
    await ensureStopped(window);

    // Stub prints to stderr and exits 1 — passes setSteamCmdPath verify (sawOutput),
    // then fails the update job so rollback runs. Real AppData steamcmd.exe is untouched.
    await withSteamCmdPath(window, stubExe, async () => {
      let updateError = null;
      try {
        await api(window, "updateServerNow", SERVER_ID);
      } catch (err) {
        updateError = err instanceof Error ? err.message : String(err);
      }
      await waitUntilSteamIdle(window, 180_000).catch(() => undefined);

      const db = openDb();
      const backups = listBackupsSince(db, SERVER_ID, since);
      const events = listEventsSince(db, SERVER_ID, since);
      db.close();

      const byType = summarizeBackups(backups);
      assert.ok(
        (byType.pre_update || []).includes("world") &&
          (byType.pre_update || []).includes("players") &&
          (byType.pre_update || []).includes("ini"),
        `Expected pre_update world/players/ini, got ${JSON.stringify(byType)}`,
      );
      assert.equal(
        byType.pre_stop,
        undefined,
        `Unexpected pre_stop during failed update: ${JSON.stringify(byType)}`,
      );
      assert.ok(
        events.some((e) => e.type === "update_failed") || updateError,
        "Expected update failure",
      );
      assert.ok(
        events.some((e) => e.type === "update_rolled_back"),
        "Expected update_rolled_back event",
      );

      const finalStatus = await getServerStatus(window, SERVER_ID);
      evidence.scenarios.C = {
        pass: true,
        updateError,
        backups: byType,
        finalStatus,
        events: events.map((e) => e.type),
        note:
          "Job retries up to 3 times; each attempt rolls back. Final signal: update failure (not success), runtime usually stopped when wasRunning was false.",
      };
    });
  } finally {
    await app.close().catch(() => undefined);
    cleanupFailingStub();
  }
}

async function scenarioE() {
  const job = {
    id: "validate-e-" + Date.now(),
    type: "verify-files",
    serverId: SERVER_ID,
    attempts: 1,
    maxAttempts: 3,
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastError: "yark-validate prior error context",
  };
  writeQueue([job]);

  const { app, window } = await launchApp();
  try {
    let recovered = null;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const queueAfter = readQueue();
      recovered = queueAfter.find((j) => j.id === job.id) || null;
      if (
        recovered &&
        recovered.lastError === "yark-validate prior error context"
      ) {
        break;
      }
      await sleep(100);
    }
    assert.ok(recovered, "Expected recovered queue job");
    assert.equal(
      recovered.lastError,
      "yark-validate prior error context",
      "lastError must survive crash/reopen reload",
    );
    assert.ok(
      recovered.status === "pending" || recovered.status === "running",
      `Expected pending or running after resume, got ${recovered.status}`,
    );

    try {
      await api(window, "cancelSteamCmd");
    } catch {
      // ignore
    }
    await waitUntilSteamIdle(window, 120_000).catch(() => undefined);
    writeQueue([]);

    evidence.scenarios.E = {
      pass: true,
      recoveredStatus: recovered.status,
      lastError: recovered.lastError,
    };
  } finally {
    writeQueue([]);
    await app.close().catch(() => undefined);
  }
}

async function scenarioB() {
  const since = new Date().toISOString();
  const { app, window } = await launchApp();
  try {
    await ensureStopped(window);

    const updatePromise = api(window, "updateServerNow", SERVER_ID);
    await waitUntilSteamBusy(window, 60_000);
    await updatePromise;
    await waitUntilSteamIdle(window, 30_000);

    const db = openDb();
    const backups = listBackupsSince(db, SERVER_ID, since);
    const events = listEventsSince(db, SERVER_ID, since);
    db.close();
    const byType = summarizeBackups(backups);
    assert.ok(byType.pre_update, "Expected pre_update backups");
    assert.equal(byType.pre_stop, undefined, "No pre_stop on stopped update");
    assert.ok(
      events.some((e) => e.type === "update_completed"),
      "Expected update_completed",
    );

    const finalStatus = await getServerStatus(window, SERVER_ID);
    assert.equal(finalStatus, "stopped", "Stopped update must leave server stopped");

    evidence.scenarios.B = {
      pass: true,
      backups: byType,
      finalStatus,
      events: events.map((e) => e.type),
    };
  } finally {
    await app.close().catch(() => undefined);
  }
}

async function scenarioA() {
  const since = new Date().toISOString();
  const { app, window } = await launchApp();
  try {
    await api(window, "startServer", SERVER_ID, { openNativeConsole: false });
    await waitForStatus(window, SERVER_ID, "running", 600_000);

    const updatePromise = api(window, "updateServerNow", SERVER_ID);
    await waitUntilSteamBusy(window, 120_000);
    await updatePromise;
    await waitUntilSteamIdle(window, 30_000);
    await waitForStatus(window, SERVER_ID, "running", 180_000);

    const db = openDb();
    const backups = listBackupsSince(db, SERVER_ID, since);
    const events = listEventsSince(db, SERVER_ID, since);
    db.close();
    const byType = summarizeBackups(backups);
    assert.ok(
      (byType.pre_update || []).includes("world") &&
        (byType.pre_update || []).includes("players") &&
        (byType.pre_update || []).includes("ini"),
      `Expected one pre_update set, got ${JSON.stringify(byType)}`,
    );
    assert.equal(
      byType.pre_stop,
      undefined,
      `Active update must not create pre_stop: ${JSON.stringify(byType)}`,
    );
    assert.ok(events.some((e) => e.type === "update_completed"));

    evidence.scenarios.A = {
      pass: true,
      backups: byType,
      preUpdateCount: (byType.pre_update || []).length,
      events: events.map((e) => e.type),
    };
  } finally {
    await app.close().catch(() => undefined);
  }
}

async function scenarioF() {
  const since = new Date().toISOString();
  const { app, window } = await launchApp();
  try {
    let status = await getServerStatus(window, SERVER_ID);
    if (status !== "running") {
      await api(window, "startServer", SERVER_ID, { openNativeConsole: false });
      await waitForStatus(window, SERVER_ID, "running", 600_000);
    }

    const verifyPromise = api(window, "verifyServerFiles", SERVER_ID);
    await waitUntilSteamBusy(window, 120_000);
    await verifyPromise;
    await waitUntilSteamIdle(window, 30_000);
    await waitForStatus(window, SERVER_ID, "running", 180_000);

    const db = openDb();
    const backups = listBackupsSince(db, SERVER_ID, since);
    const events = listEventsSince(db, SERVER_ID, since);
    db.close();
    const byType = summarizeBackups(backups);
    assert.equal(
      byType.pre_update,
      undefined,
      `Verify must not create pre_update: ${JSON.stringify(byType)}`,
    );
    assert.ok(events.some((e) => e.type === "update_completed"));

    evidence.scenarios.F = {
      pass: true,
      backups: byType,
      events: events.map((e) => e.type),
    };
  } finally {
    await app.close().catch(() => undefined);
  }
}

async function scenarioD() {
  const { app, window } = await launchApp();
  try {
    await ensureStopped(window);

    const updatePromise = api(window, "updateServerNow", SERVER_ID).then(
      () => ({ outcome: "resolved" }),
      (err) => ({
        outcome: "rejected",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    await waitUntilSteamBusy(window, 120_000);
    await sleep(3000);
    await api(window, "cancelSteamCmd");
    const result = await updatePromise;
    await waitUntilSteamIdle(window, 120_000);

    const msg = (result.message || "").toLowerCase();
    const cancelled =
      result.outcome === "rejected" &&
      (msg.includes("cancel") || msg.includes("cancelled") || msg.includes("canceled"));
    assert.ok(
      cancelled || result.outcome === "rejected",
      `Cancel must not report success: ${JSON.stringify(result)}`,
    );

    evidence.scenarios.D = {
      pass: true,
      result,
    };
  } finally {
    await app.close().catch(() => undefined);
  }
}

async function run() {
  assertPrerequisites();

  if (DRY_RUN) {
    console.log("\n--dry-run: prerequisites passed; not launching Electron.");
    console.log(
      "Scenario C will compile a failing steamcmd.exe under os.tmpdir() and point Settings at it temporarily (then restore).",
    );
    return;
  }

  try {
    evidence.commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      cwd: projectRoot,
    }).trim();
  } catch {
    evidence.commit = "unknown";
  }

  console.log(
    "\nWARNING: Manual real-host run. Uses your YARK userData DB and a disposable ASA profile.",
  );
  console.log(
    "Scenario C temporarily changes steamcmdPath to a temp stub; your real steamcmd.exe is not renamed.",
  );

  const order = ["C", "E", "B", "A", "F", "D"];
  for (const key of order) {
    if (!SCENARIOS.has(key)) continue;
    console.log(`\n=== Scenario ${key} ===`);
    try {
      if (key === "C") await scenarioC();
      else if (key === "E") await scenarioE();
      else if (key === "B") await scenarioB();
      else if (key === "A") await scenarioA();
      else if (key === "F") await scenarioF();
      else if (key === "D") await scenarioD();
      console.log(`PASS ${key}`, redactEvidence(evidence.scenarios[key]));
    } catch (err) {
      evidence.scenarios[key] = {
        pass: false,
        error: err instanceof Error ? err.message : String(err),
      };
      console.error(`FAIL ${key}`, err instanceof Error ? err.message : err);
      writeQueue([]);
      cleanupFailingStub();
    }
  }

  const outPath = path.join(userData, "safe-update-validation-evidence.json");
  const redacted = JSON.parse(redactEvidence(evidence));
  fs.writeFileSync(outPath, JSON.stringify(redacted, null, 2), "utf8");
  console.log("\n=== Evidence written (redact before sharing) ===");
  console.log(outPath);
  console.log(JSON.stringify(redacted, null, 2));

  const failed = Object.entries(evidence.scenarios).filter(([, v]) => !v.pass);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  writeQueue([]);
  cleanupFailingStub();
  console.error("VALIDATE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
