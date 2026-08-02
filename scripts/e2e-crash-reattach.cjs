/**
 * E2E: temp profile → create → SteamCMD install → start → kill UI → reattach (#59).
 *
 * - Isolated Electron --user-data-dir (temp profile/DB)
 * - Server installDir under a temp folder
 * - Real install via window.api.installServerFiles (reuses host SteamCMD +
 *   asa_content_cache when STEAMCMD_PATH / setSteamCmdPath points at it)
 * - Start real ArkAscendedServer.exe, force-kill UI, relaunch, assert attach
 * - Cleanup: kill processes + delete temp trees
 *
 * Usage: node scripts/e2e-crash-reattach.cjs
 * Optional: YARK_E2E_STEAMCMD = full path to steamcmd.exe
 * Requires: prior npm run build, Windows, SteamCMD + ASA content cache (or time
 * to download). Robocopy of a warm cache can take many minutes.
 */
const assert = require("node:assert/strict");
const { spawnSync, execFileSync } = require("node:child_process");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const LEFT_RUNNING_KEY = "leftRunningProcesses";
const MIN_REAL_BINARY_BYTES = 1_000_000;
/** Warm cache sync can be slow; cold SteamCMD is longer. */
const INSTALL_TIMEOUT_MS = 90 * 60 * 1000;

function queryOsIdentity(pid) {
  const raw = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue;` +
        `if(-not $p){''}else{$p|Select-Object ProcessId,ExecutablePath,CommandLine,CreationDate|ConvertTo-Json -Compress}`,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      windowsHide: true,
    },
  ).trim();
  if (!raw) {
    return null;
  }
  const parsed = JSON.parse(raw);
  return {
    pid: parsed.ProcessId,
    executablePath: parsed.ExecutablePath ?? null,
    commandLine: parsed.CommandLine ?? null,
    osCreationTime: parsed.CreationDate ?? null,
  };
}

function forceKillPid(pid, { tree = true } = {}) {
  const args = tree
    ? ["/PID", String(pid), "/F", "/T"]
    : ["/PID", String(pid), "/F"];
  spawnSync("taskkill", args, {
    windowsHide: true,
    stdio: "ignore",
  });
}

/**
 * List PIDs via PowerShell without interpolating paths into -Command.
 * The match string is passed through an env var on the child process only.
 */
function listPidsMatchingEnv(envName, matchValue, filterScript) {
  try {
    const encoded = Buffer.from(filterScript, "utf16le").toString("base64");
    const listed = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NoLogo", "-NonInteractive", "-EncodedCommand", encoded],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10000,
        env: { ...process.env, [envName]: matchValue },
      },
    )
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
    return listed;
  } catch {
    return [];
  }
}

/** Kill leftover Electron helpers for this userData without touching ASA. */
function killElectronForUserData(userData) {
  const envName = "YARK_E2E_USER_DATA_MATCH";
  const script = [
    `$ud = [Environment]::GetEnvironmentVariable('${envName}')`,
    `if ([string]::IsNullOrEmpty($ud)) { return }`,
    `Get-CimInstance Win32_Process | Where-Object {`,
    `  $_.Name -match '^(electron|YARK)\\.exe$' -and $null -ne $_.CommandLine -and $_.CommandLine.Contains($ud)`,
    `} | ForEach-Object { $_.ProcessId }`,
  ].join("; ");
  for (const pid of listPidsMatchingEnv(envName, userData, script)) {
    forceKillPid(pid, { tree: false });
  }
}

/** Kill any process whose ExecutablePath is under rootDir. */
function killProcessesUnderRoot(rootDir) {
  const envName = "YARK_E2E_ROOT_MATCH";
  const script = [
    `$root = [Environment]::GetEnvironmentVariable('${envName}')`,
    `if ([string]::IsNullOrEmpty($root)) { return }`,
    `Get-CimInstance Win32_Process | Where-Object {`,
    `  $null -ne $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)`,
    `} | ForEach-Object { $_.ProcessId }`,
  ].join("; ");
  for (const pid of listPidsMatchingEnv(envName, rootDir, script)) {
    forceKillPid(pid, { tree: true });
  }
}

function resolveHostSteamCmdExe() {
  const override = process.env.YARK_E2E_STEAMCMD?.trim();
  if (override && existsSync(override)) {
    return path.resolve(override);
  }
  const candidates = [
    path.join(
      process.env.APPDATA ?? "",
      "yark-server-manager",
      "steamcmd",
      "steamcmd.exe",
    ),
    "C:\\steamcmd\\steamcmd.exe",
    "D:\\steamcmd\\steamcmd.exe",
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function isRealAsaBinary(binaryPath) {
  try {
    return existsSync(binaryPath) && statSync(binaryPath).size > MIN_REAL_BINARY_BYTES;
  } catch {
    return false;
  }
}

async function launchApp(projectRoot, userData, steamCmdExe) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.STEAMCMD_PATH = steamCmdExe;
  env.ARK_STEAMCMD_DIR = path.dirname(steamCmdExe);
  return electron.launch({
    args: [`--user-data-dir=${userData}`, "."],
    cwd: projectRoot,
    env,
  });
}

async function createServer(page, serverName, baseFolder, ports) {
  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  await page.getByRole("textbox", { name: /^Name$/ }).fill(serverName);
  await page
    .getByRole("textbox", { name: /^Session name$/ })
    .fill(`Session ${serverName}`);
  const baseInput = page.getByRole("textbox", { name: /^Base folder$/ });
  if ((await baseInput.count()) > 0) {
    await baseInput.fill(baseFolder);
  } else {
    await page.getByPlaceholder("C:\\ark_servers").fill(baseFolder);
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

  const backToServers = page.getByRole("button", { name: /Back to servers/i });
  await backToServers.first().waitFor({ state: "visible", timeout: 10000 });
  await backToServers.first().click();

  await page.locator("[data-overview-page]").waitFor({
    state: "visible",
    timeout: 15000,
  });

  const card = page
    .locator("[data-server-card]", {
      has: page.getByText(serverName, { exact: true }),
    })
    .first();
  await card.waitFor({ state: "visible", timeout: 15000 });
  return card;
}

async function waitForManagedPid(page, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const result = await page.evaluate(async () => window.api.getStatuses());
    assert.equal(result.ok, true, `getStatuses failed: ${result.error ?? "?"}`);
    const active = (result.data ?? []).find(
      (row) =>
        row.pid != null &&
        (row.status === "starting" || row.status === "running"),
    );
    last = result.data;
    if (active) {
      return active;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `Timed out waiting for managed pid; last=${JSON.stringify(last)}`,
  );
}

async function waitForSamePidAttached(page, expectedPid, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const result = await page.evaluate(async () => window.api.getStatuses());
    assert.equal(result.ok, true, `getStatuses failed: ${result.error ?? "?"}`);
    const match = (result.data ?? []).find(
      (row) =>
        row.pid === expectedPid &&
        (row.status === "starting" || row.status === "running"),
    );
    last = result.data;
    if (match) {
      return match;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `Timed out waiting for reattach pid=${expectedPid}; last=${JSON.stringify(last)}`,
  );
}

async function run() {
  if (process.platform !== "win32") {
    console.log("E2E_CRASH_REATTACH_SKIP platform!=win32");
    return;
  }

  const steamCmdExe = resolveHostSteamCmdExe();
  if (steamCmdExe === null) {
    console.log("E2E_CRASH_REATTACH_SKIP");
    console.log(
      "steamcmd.exe not found. Install SteamCMD or set YARK_E2E_STEAMCMD.",
    );
    return;
  }
  console.log(`E2E_CRASH_STEAMCMD=${steamCmdExe}`);

  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const root = mkdtempSync(path.join(tmpdir(), "yark-crash-reattach-"));
  const userData = path.join(root, "userData");
  const serversRoot = path.join(root, "servers");
  mkdirSync(userData, { recursive: true });
  mkdirSync(serversRoot, { recursive: true });

  const serverName = `CrashE2E-${Date.now()}`;
  const expectedInstallDir = path.join(serversRoot, serverName);
  const binaryPath = path.join(
    expectedInstallDir,
    "ShooterGame",
    "Binaries",
    "Win64",
    "ArkAscendedServer.exe",
  );
  const ports = {
    game: 28000 + Math.floor(Math.random() * 500),
    query: 28500 + Math.floor(Math.random() * 500),
    rcon: 29000 + Math.floor(Math.random() * 500),
  };

  let app = null;
  let managedPid = null;

  try {
    // 1) Temp UI profile
    app = await launchApp(projectRoot, userData, steamCmdExe);
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: 20000,
    });
    page.setDefaultTimeout(INSTALL_TIMEOUT_MS);

    const steamSet = await page.evaluate(async (exePath) => {
      return window.api.setSteamCmdPath(exePath);
    }, steamCmdExe);
    assert.equal(steamSet.ok, true, `setSteamCmdPath failed: ${steamSet.error ?? "?"}`);

    // 2) Create server in temp folder
    await createServer(page, serverName, serversRoot, ports);
    const listed = await page.evaluate(async () => window.api.listServers());
    assert.equal(listed.ok, true, `listServers failed: ${listed.error ?? "?"}`);
    const profile = (listed.data ?? []).find((row) => row.name === serverName);
    assert.ok(profile, "created server not found in listServers");
    assert.equal(
      path.normalize(profile.installDir).toLowerCase(),
      path.normalize(expectedInstallDir).toLowerCase(),
      `unexpected installDir: ${profile.installDir}`,
    );
    console.log(`E2E_CRASH_SERVER_ID=${profile.id}`);
    console.log(`E2E_CRASH_INSTALL_DIR=${profile.installDir}`);

    // 3) Real SteamCMD install (cache sync when warm)
    console.log("E2E_CRASH_INSTALL_BEGIN");
    const installStarted = Date.now();
    const installResult = await Promise.race([
      page.evaluate(async (serverId) => {
        return window.api.installServerFiles(serverId);
      }, profile.id),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`installServerFiles timed out after ${INSTALL_TIMEOUT_MS}ms`)),
          INSTALL_TIMEOUT_MS,
        );
      }),
    ]);
    assert.equal(
      installResult.ok,
      true,
      `installServerFiles failed: ${installResult.error ?? "?"}`,
    );
    console.log(
      `E2E_CRASH_INSTALL_OK elapsedSec=${Math.round((Date.now() - installStarted) / 1000)}`,
    );
    assert.ok(
      isRealAsaBinary(binaryPath),
      `install finished but binary missing/too small: ${binaryPath}`,
    );

    // 4) Start with native ASA console window visible, then wait before kill.
    const startResult = await page.evaluate(async (serverId) => {
      return window.api.startServer(serverId, { openNativeConsole: true });
    }, profile.id);
    assert.equal(
      startResult.ok,
      true,
      `startServer failed: ${startResult.error ?? "?"}`,
    );

    const managed = await waitForManagedPid(page);
    managedPid = managed.pid;
    assert.ok(managedPid > 0, "managed pid missing after Start");
    console.log(
      `E2E_CRASH_STARTED status=${managed.status} pid=${managedPid}`,
    );

    const liveBeforeKill = queryOsIdentity(managedPid);
    assert.ok(liveBeforeKill, "OS process missing right after Start");

    // Let the dedicated console window appear before killing the manager UI.
    const settleMs = Number(process.env.YARK_E2E_ASA_SETTLE_MS ?? 12000);
    console.log(`E2E_CRASH_WAIT_CONSOLE_MS=${settleMs}`);
    await new Promise((r) => setTimeout(r, settleMs));
    assert.ok(
      queryOsIdentity(managedPid),
      `server pid ${managedPid} exited during console settle wait`,
    );

    // 5) Hard-kill UI only (no Playwright app.close — that triggers before-quit
    // Ask/Stop dialog). No /T on the first shot so the detached ASA child can
    // survive; then sweep leftover Electron helpers for this userData.
    const electronPid = app.process().pid;
    assert.ok(electronPid, "electron pid missing");
    console.log(`E2E_CRASH_KILL_UI pid=${electronPid}`);
    forceKillPid(electronPid, { tree: false });
    app = null;
    await new Promise((r) => setTimeout(r, 800));
    killElectronForUserData(userData);
    await new Promise((r) => setTimeout(r, 1200));
    console.log("E2E_CRASH_UI_KILLED");

    const liveAfterKill = queryOsIdentity(managedPid);
    assert.ok(
      liveAfterKill,
      `server pid ${managedPid} died with UI — detach/orphan failed`,
    );
    assert.equal(
      liveAfterKill.osCreationTime,
      liveBeforeKill.osCreationTime,
      "creation time changed after UI kill",
    );
    console.log(`E2E_CRASH_OS_ALIVE pid=${managedPid}`);

    const db = new DatabaseSync(path.join(userData, "yark-server-manager.db"));
    const row = db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .get(LEFT_RUNNING_KEY);
    db.close();
    assert.ok(row?.value, "leftRunningProcesses checkpoint missing after UI kill");
    const checkpoint = JSON.parse(row.value);
    assert.equal(checkpoint[0]?.pid, managedPid);

    // 6) Relaunch same temp profile → reattach
    app = await launchApp(projectRoot, userData, steamCmdExe);
    const page2 = await app.firstWindow();
    await page2.waitForLoadState("domcontentloaded");
    await page2.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: 20000,
    });

    const reattached = await waitForSamePidAttached(page2, managedPid);
    console.log(
      `E2E_CRASH_REATTACHED status=${reattached.status} pid=${reattached.pid}`,
    );
    console.log("E2E_CRASH_REATTACH_OK");
  } finally {
    // Always hard-kill leftovers — never Playwright close() (triggers quit dialog).
    if (app !== null) {
      try {
        const pid = app.process()?.pid;
        if (pid) {
          forceKillPid(pid, { tree: false });
        }
      } catch {
        // ignore
      }
      app = null;
    }
    killElectronForUserData(userData);
    if (managedPid !== null) {
      forceKillPid(managedPid, { tree: true });
    }
    killProcessesUnderRoot(root);
    try {
      rmSync(root, { recursive: true, force: true });
      console.log("E2E_CRASH_CLEANUP_OK");
    } catch (error) {
      console.warn(
        `E2E_CRASH_CLEANUP_WARN ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

run()
  .then(() => {
    // Playwright/Electron keep the event loop alive after hard-kill cleanup.
    process.exit(0);
  })
  .catch((error) => {
    console.error("E2E_CRASH_REATTACH_FAIL");
    console.error(error?.stack ?? String(error));
    process.exit(1);
  });
