/**
 * Manual prepared-host validation for #12.
 *
 * This runner intentionally targets an existing, test-owned YARK profile. It
 * never creates or deletes a server, install directory, or world. The target
 * must be explicitly selected with YARK_VALIDATE_SERVER_ID and its install
 * directory must be below YARK_REAL_HOST_ROOT.
 *
 * Usage:
 *   npm run build
 *   Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
 *   $env:YARK_VALIDATE_USER_DATA = "C:\yark_dev_profile"
 *   $env:YARK_VALIDATE_SERVER_ID = "<test-owned-profile-id>"
 *   $env:YARK_REAL_HOST_ROOT = "C:\asa-validation"
 *   node scripts/validation/validate-real-host-lifecycle.cjs --confirm
 *
 * Optional:
 *   YARK_REAL_HOST_SCENARIOS=lifecycle,backup-restore
 *   YARK_REAL_HOST_EVIDENCE=C:\asa-validation\evidence.json
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { quitElectronApp, waitForOverview } = require("../e2e-launch.cjs");
const { assertDisposablePath, parseScenarioList, redactEvidence } = require("./real-host-validation-utils.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const args = new Set(process.argv.slice(2));
const CONFIRM = args.has("--confirm") || args.has("--force");
const DRY_RUN = args.has("--dry-run");
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const USER_DATA = process.env.YARK_VALIDATE_USER_DATA?.trim() || "";
const SERVER_ID = process.env.YARK_VALIDATE_SERVER_ID?.trim() || "";
const REAL_HOST_ROOT = process.env.YARK_REAL_HOST_ROOT?.trim() || "";
const EVIDENCE_PATH =
  process.env.YARK_REAL_HOST_EVIDENCE?.trim() || path.join(REAL_HOST_ROOT, "real-host-evidence.json");
const SCENARIOS = parseScenarioList(process.env.YARK_REAL_HOST_SCENARIOS);
const evidence = {
  date: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || null,
  serverId: SERVER_ID || null,
  installDir: null,
  scenarios: {},
  notes: [],
};
let knownSecretProfiles = [];

function requireConfiguration() {
  if (process.platform !== "win32" && !DRY_RUN) {
    throw new Error("This validation only runs on Windows.");
  }
  if (!SERVER_ID) {
    throw new Error("Set YARK_VALIDATE_SERVER_ID to a test-owned YARK profile id.");
  }
  if (!USER_DATA) {
    throw new Error("Set YARK_VALIDATE_USER_DATA to the YARK userData directory.");
  }
  if (!REAL_HOST_ROOT) {
    throw new Error("Set YARK_REAL_HOST_ROOT to the disposable validation root.");
  }
  if (!CONFIRM && !DRY_RUN) {
    throw new Error("Pass --confirm to acknowledge mutation of the selected test-owned profile.");
  }
  if (!DRY_RUN) fs.mkdirSync(REAL_HOST_ROOT, { recursive: true });
}

async function api(page, method, ...values) {
  const result = await page.evaluate(
    async ({ method: methodName, values: input }) => window.api[methodName](...input),
    { method, values },
  );
  assert.equal(result.ok, true, `${method} failed: ${result.error ?? "unknown error"}`);
  return result.data;
}

async function waitForStatus(page, expected, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const statuses = await api(page, "getStatuses");
    last = statuses;
    const found = statuses.find((status) => status.serverId === SERVER_ID);
    if (found?.status === expected) return found;
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for ${SERVER_ID} to become ${expected}: ${JSON.stringify(last)}`);
}

async function launch() {
  const env = { ...process.env, YARK_E2E_USER_DATA: USER_DATA, YARK_VALIDATE_SERVER_ID: SERVER_ID };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ args: ["."], cwd: PROJECT_ROOT, env });
}

async function validateTarget(page) {
  const servers = await api(page, "listServers");
  const profile = servers.find((server) => server.id === SERVER_ID);
  assert.ok(profile, `No YARK profile found for YARK_VALIDATE_SERVER_ID=${SERVER_ID}`);
  knownSecretProfiles = [profile];
  const installDir = assertDisposablePath(profile.installDir, REAL_HOST_ROOT);
  evidence.installDir = installDir;
  assert.equal(
    path
      .normalize(installDir)
      .toLowerCase()
      .startsWith(`${path.resolve(REAL_HOST_ROOT).toLowerCase()}${path.sep}`),
    true,
    "Selected install directory must be below YARK_REAL_HOST_ROOT",
  );
  const status = (await api(page, "getStatuses")).find((row) => row.serverId === SERVER_ID);
  assert.equal(status?.status, "stopped", `Target must start stopped; got ${status?.status ?? "missing"}`);
}

async function runLifecycle(page) {
  const startedAt = new Date().toISOString();
  evidence.scenarios.lifecycle = { ok: false, startedAt };
  await api(page, "startServer", SERVER_ID, { openNativeConsole: false });
  await waitForStatus(page, "running");
  const rcon = await api(page, "sendRconCommand", SERVER_ID, "ListPlayers");
  assert.equal(typeof rcon, "string", "ListPlayers did not return an RCON response");
  await api(page, "sendRconCommand", SERVER_ID, "SaveWorld");
  await api(page, "restartServer", SERVER_ID, { openNativeConsole: false });
  await waitForStatus(page, "running");
  await api(page, "sendRconCommand", SERVER_ID, "SaveWorld");
  await api(page, "stopServer", SERVER_ID);
  await waitForStatus(page, "stopped");
  evidence.scenarios.lifecycle = { ok: true, startedAt, completedAt: new Date().toISOString() };
}

async function runBackupRestore(page) {
  const startedAt = new Date().toISOString();
  evidence.scenarios["backup-restore"] = { ok: false, startedAt };
  const backups = await api(page, "createManualBackup", SERVER_ID, ["world"]);
  const completed = backups.find((backup) => backup.status === "completed");
  assert.ok(completed, "Manual world backup did not complete");
  await api(page, "restoreBackup", SERVER_ID, completed.id, { restoreProfilesTribes: true });
  evidence.scenarios["backup-restore"] = {
    ok: true,
    backupId: completed.id,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function run() {
  requireConfiguration();
  if (DRY_RUN) {
    console.log(
      JSON.stringify({
        ok: true,
        userData: path.resolve(USER_DATA),
        serverId: SERVER_ID,
        root: path.resolve(REAL_HOST_ROOT),
        scenarios: SCENARIOS,
      }),
    );
    return;
  }

  let app = null;
  let page = null;
  try {
    app = await launch();
    page = await waitForOverview(app);
    await validateTarget(page);
    for (const scenario of SCENARIOS) {
      if (scenario === "lifecycle") await runLifecycle(page);
      if (scenario === "backup-restore") await runBackupRestore(page);
    }
    evidence.completedAt = new Date().toISOString();
  } catch (error) {
    evidence.error = {
      message: error?.message ?? String(error),
      name: error?.name ?? "Error",
      at: new Date().toISOString(),
    };
    throw error;
  } finally {
    if (app !== null) {
      try {
        page ??= await app.firstWindow();
        const statuses = await page.evaluate(async () => window.api.getStatuses());
        const target = statuses.data?.find((status) => status.serverId === SERVER_ID);
        if (target?.status === "running" || target?.status === "starting") {
          await page.evaluate(async (serverId) => window.api.stopServer(serverId), SERVER_ID);
          await waitForStatus(page, "stopped", 60_000);
        }
      } catch {
        // Preserve the original validation failure; the operator can inspect the target profile.
      }
      await quitElectronApp(app, { autoConfirmQuitDialog: true });
    }
    if (!DRY_RUN && REAL_HOST_ROOT && EVIDENCE_PATH) {
      try {
        fs.writeFileSync(
          assertDisposablePath(EVIDENCE_PATH, REAL_HOST_ROOT),
          `${JSON.stringify(redactEvidence(evidence, knownSecretProfiles), null, 2)}\n`,
        );
        if (!evidence.error) console.log(`REAL_HOST_VALIDATION_OK evidence=${EVIDENCE_PATH}`);
      } catch (evidenceError) {
        console.error(`Unable to write validation evidence: ${evidenceError?.message ?? evidenceError}`);
      }
    }
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error("REAL_HOST_VALIDATION_FAIL");
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  });
}

module.exports = { run, requireConfiguration, runBackupRestore, runLifecycle };
