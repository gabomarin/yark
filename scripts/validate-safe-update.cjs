/**
 * Real-host safe-update validation for GitHub #14.
 * Drives the compiled Electron app via Playwright + window.api against a
 * disposable server profile (default: islandia).
 *
 * Usage (Windows, display available):
 *   npm run build
 *   Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
 *   node scripts/validate-safe-update.cjs
 *
 * Optional env:
 *   YARK_VALIDATE_SERVER_ID  — override server id
 *   YARK_VALIDATE_SCENARIOS  — comma list: C,E,B,A,F,D (default all)
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const DEFAULT_SERVER_ID = "f3f15932-d57a-4ce1-ae11-d10777c93d0c"; // islandia
const SERVER_ID = process.env.YARK_VALIDATE_SERVER_ID || DEFAULT_SERVER_ID;
const SCENARIOS = new Set(
  (process.env.YARK_VALIDATE_SCENARIOS || "C,E,B,A,F,D")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
);

const userData = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "yark-server-manager",
);
const dbPath = path.join(userData, "yark-server-manager.db");
const steamcmdExe = path.join(userData, "steamcmd", "steamcmd.exe");
const steamcmdBak = path.join(userData, "steamcmd", "steamcmd.exe.yark-validate-bak");
const steamcmdFail = path.join(userData, "steamcmd", "steamcmd-fail.cmd");

const evidence = {
  date: new Date().toISOString(),
  commit: null,
  serverId: SERVER_ID,
  scenarios: {},
  notes: [],
};

function openDb() {
  return new DatabaseSync(dbPath);
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

function readQueue() {
  const db = openDb();
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get("criticalJobsQueue.v1");
    if (!row || !row.value) return [];
    return JSON.parse(String(row.value));
  } finally {
    db.close();
  }
}

function writeQueue(queue) {
  const db = openDb();
  try {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run("criticalJobsQueue.v1", JSON.stringify(queue), now);
  } finally {
    db.close();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchApp() {
  const projectRoot = path.resolve(__dirname, "..");
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
      throw new Error(`Server entered error while waiting for running`);
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

function installFailingSteamCmd() {
  if (!fs.existsSync(steamcmdExe)) {
    throw new Error(`SteamCMD missing at ${steamcmdExe}`);
  }
  if (fs.existsSync(steamcmdBak)) {
    fs.renameSync(steamcmdBak, steamcmdExe);
  }
  fs.renameSync(steamcmdExe, steamcmdBak);
  // SteamCMD resolve expects steamcmd.exe; a tiny exe-like fail via cmd renamed won't work.
  // Write a Node-spawnable failure: copy a .bat won't run as .exe.
  // Instead write a tiny PE-less approach: create steamcmd.exe as a .cmd won't work.
  // Use a PowerShell-compiled approach — actually UpdateService spawns the exe path.
  // Best: write a small node script wrapped... spawn of .exe must be real.
  // Use `where` — on Windows we can copy `false` equivalent: cmd.exe can't be named steamcmd.exe usefully.
  // Practical approach: write steamcmd.exe as a batch file won't execute.
  // Use printf of a minimal always-failing exe via PowerShell Add-Type C#...
  const ps = `
$code = @'
using System;
static class P {
  static int Main(string[] args) {
    Console.Error.WriteLine("yark-validate forced SteamCMD failure");
    return 1;
  }
}
'@
Add-Type -OutputType ConsoleApplication -OutputAssembly '${steamcmdExe.replace(/'/g, "''")}' -TypeDefinition $code
`;
  const { execFileSync } = require("node:child_process");
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  if (!fs.existsSync(steamcmdExe)) {
    throw new Error("Failed to compile failing steamcmd.exe stub");
  }
}

function restoreSteamCmd() {
  if (fs.existsSync(steamcmdExe) && fs.existsSync(steamcmdBak)) {
    fs.rmSync(steamcmdExe, { force: true });
  }
  if (fs.existsSync(steamcmdBak)) {
    fs.renameSync(steamcmdBak, steamcmdExe);
  }
  if (fs.existsSync(steamcmdFail)) {
    fs.rmSync(steamcmdFail, { force: true });
  }
}

function summarizeBackups(rows) {
  const byType = {};
  for (const row of rows) {
    byType[row.type] = byType[row.type] || [];
    byType[row.type].push(row.kind);
  }
  return byType;
}

async function scenarioC() {
  const since = new Date().toISOString();
  let window;
  let app;
  try {
    installFailingSteamCmd();
    ({ app, window } = await launchApp());
    const status = await getServerStatus(window, SERVER_ID);
    if (status === "running" || status === "starting") {
      await api(window, "stopServer", SERVER_ID);
      await waitForStatus(window, SERVER_ID, "stopped", 180_000);
    }

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
    const rolled = events.some((e) => e.type === "update_rolled_back");
    const failed = events.some((e) => e.type === "update_failed");
    assert.ok(failed || updateError, "Expected update failure");
    assert.ok(rolled, "Expected update_rolled_back event");

    const finalStatus = await getServerStatus(window, SERVER_ID);
    evidence.scenarios.C = {
      pass: true,
      updateError,
      backups: byType,
      finalStatus,
      events: events.map((e) => e.type),
    };
  } finally {
    restoreSteamCmd();
    if (app) await app.close().catch(() => undefined);
  }
}

async function scenarioE() {
  // Seed a job that looked "running" before crash; on load it must recover with
  // lastError preserved (status remapped to pending, then may become running).
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

    // Cancel so we do not run a full SteamCMD validate in this scenario.
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
    const status = await getServerStatus(window, SERVER_ID);
    if (status === "running" || status === "starting") {
      await api(window, "stopServer", SERVER_ID);
      await waitForStatus(window, SERVER_ID, "stopped", 180_000);
    }

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
      (byType.pre_update || []).filter((k) => k === "world").length >= 1 &&
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
    const status = await getServerStatus(window, SERVER_ID);
    // Prefer stopped for faster cancel path (still hits SteamCMD).
    if (status === "running" || status === "starting") {
      await api(window, "stopServer", SERVER_ID);
      await waitForStatus(window, SERVER_ID, "stopped", 180_000);
    }

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
  assert.ok(fs.existsSync(dbPath), `DB not found: ${dbPath}`);
  assert.ok(fs.existsSync(steamcmdExe), `SteamCMD not found: ${steamcmdExe}`);

  try {
    const { execFileSync } = require("node:child_process");
    evidence.commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    evidence.commit = "unknown";
  }

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
      console.log(`PASS ${key}`, JSON.stringify(evidence.scenarios[key]));
    } catch (err) {
      evidence.scenarios[key] = {
        pass: false,
        error: err instanceof Error ? err.message : String(err),
      };
      console.error(`FAIL ${key}`, err);
      restoreSteamCmd();
      writeQueue([]);
      // Continue remaining scenarios for maximum evidence.
    }
  }

  const outPath = path.join(userData, "safe-update-validation-evidence.json");
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2), "utf8");
  console.log("\n=== Evidence written ===");
  console.log(outPath);
  console.log(JSON.stringify(evidence, null, 2));

  const failed = Object.entries(evidence.scenarios).filter(([, v]) => !v.pass);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  restoreSteamCmd();
  writeQueue([]);
  console.error("VALIDATE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
