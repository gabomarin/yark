/**
 * E2E: structured + raw Launch args appear on the real spawn Commandline (#93).
 *
 * Flow:
 * - Isolated profile under C:\asa-e2e (fake "ready" install = copied cmd.exe)
 * - Seed structuredLaunchArgs + extraArgs in SQLite
 * - Ensure "Show server console on start" is off (piped Runtime)
 * - startServer via IPC with openNativeConsole:false
 * - Assert Runtime buffer (API + Logs → Runtime UI) contains Commandline tokens
 *
 * Usage: npm run build && npm run e2e:launch-args
 *
 * Requires Windows + display. Unset ELECTRON_RUN_AS_NODE before running.
 * Fixtures are deleted on success.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");
const { openSettingsCategory } = require("./e2e-launch.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");
const e2eRoot = path.resolve("C:\\asa-e2e");
const profilesRoot = path.join(e2eRoot, "profiles");
const serversRoot = path.join(e2eRoot, "servers");
const runId = `${Date.now()}-${process.pid}`;
const fixtureName = `launch-args-${runId}`;
const profileDir = path.join(profilesRoot, fixtureName);
const serversDir = path.join(serversRoot, fixtureName);
const dbPath = path.join(profileDir, "yark-server-manager.db");
const shotsDir = path.join(os.tmpdir(), `yark-e2e-launch-args-${runId}`);

const PORT_BASE = 29600 + (process.pid % 200);
const PORTS = {
  game: PORT_BASE,
  query: PORT_BASE + 1,
  rcon: PORT_BASE + 2,
};

const serverId = `e2e-launch-args-${runId}`;
const serverName = `LaunchArgs ${runId}`;
const installDir = path.join(serversDir, "ready");
const win64Dir = path.join(installDir, "ShooterGame", "Binaries", "Win64");
const binaryPath = path.join(win64Dir, "ArkAscendedServer.exe");

const STRUCTURED = {
  nobattleye: { enabled: true },
  forcerespawndinos: { enabled: true },
  "gbusagetoforcerestart-value": { enabled: true, value: "35" },
};
const EXTRA_RAW = "-E2ECustomRaw";

const EXPECTED_TOKENS = [
  "-NoBattlEye",
  "-ForceRespawnDinos",
  "-GBUsageToForceRestart=35",
  EXTRA_RAW,
  `-port=${PORTS.game}`,
  "-log",
];

function assertFixturePath(root, target) {
  const relative = path.relative(root, target);
  assert.ok(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(path.basename(target), fixtureName);
}

function writeInstallFixture() {
  fs.mkdirSync(win64Dir, { recursive: true });
  // Real PE so CreateProcess succeeds; ASA args make cmd exit quickly.
  const cmdExe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  assert.ok(fs.existsSync(cmdExe), `cmd.exe not found at ${cmdExe}`);
  fs.copyFileSync(cmdExe, binaryPath);
  fs.writeFileSync(path.join(win64Dir, "version.txt"), "e2e-launch-args-1.0\n");
}

function seedDatabase() {
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO servers (
      id, name, map, install_dir, enabled, session_name,
      game_port, query_port, rcon_port,
      server_password, admin_password,
      cluster_id, cluster_dir, extra_args, structured_launch_args, mods,
      disabled_mods, mod_metadata_cache, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    JSON.stringify([EXTRA_RAW]),
    JSON.stringify(STRUCTURED),
    "[]",
    "[]",
    "{}",
    now,
    now,
  );
  db.close();
}

async function launchApp() {
  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env: {
      ...process.env,
      YARK_E2E_USER_DATA: profileDir,
    },
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

async function api(page, method, ...args) {
  const result = await page.evaluate(
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

function killStubProcesses() {
  // Best-effort: stub is a renamed cmd.exe under our install tree.
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `$match = [Environment]::GetEnvironmentVariable('YARK_E2E_KILL_MATCH');` +
        `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like $match } |` +
        ` ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ],
    {
      windowsHide: true,
      stdio: "ignore",
      env: { ...process.env, YARK_E2E_KILL_MATCH: `${installDir}\\*` },
      timeout: 10_000,
    },
  );
}

function findCommandLine(runtimeLines) {
  const line = runtimeLines.find((entry) => /Commandline:/i.test(entry));
  assert.ok(line, `Expected a Commandline runtime line, got:\n${runtimeLines.join("\n")}`);
  return line;
}

function assertCommandLineTokens(commandLine) {
  for (const token of EXPECTED_TOKENS) {
    assert.ok(
      commandLine.includes(token),
      `Commandline missing ${token}:\n${commandLine}`,
    );
  }
  assert.ok(
    !/Native server console opened/i.test(commandLine),
    "Commandline line should not mention native console",
  );
}

async function waitForCommandLine(page, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    const snap = await api(page, "getServerRuntimeLog", serverId, 300);
    last = snap?.runtimeLogLines ?? snap ?? [];
    if (!Array.isArray(last)) last = [];
    if (last.some((line) => /Commandline:/i.test(line))) {
      return last;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Timed out waiting for Commandline in runtime logs:\n${last.join("\n")}`,
  );
}

function cardFor(page) {
  return page.locator("[data-server-card]", {
    has: page.getByText(serverName, { exact: true }),
  }).first();
}

async function openWorkspace(page) {
  const card = cardFor(page);
  await card.waitFor({ state: "visible", timeout: 15_000 });
  await card
    .getByRole("button", { name: new RegExp(`Open settings for ${serverName}`, "i") })
    .click();
  await page.getByRole("tab", { name: "Launch" }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Launch-args E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(serversRoot, serversDir);

  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(shotsDir, { recursive: true });
  writeInstallFixture();

  let app = null;
  let succeeded = false;
  const errors = [];
  try {
    // Bootstrap DB schema (migrations), then seed.
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

    // Piped mode: Show server console on start must stay off (Settings → Servers).
    await page.evaluate(async () => {
      if (typeof window.api?.setOpenNativeConsole === "function") {
        await window.api.setOpenNativeConsole(false);
      }
      window.localStorage.setItem("overview.openNativeTerminalOnStart", "0");
    });
    await openSettingsCategory(page, "Servers");
    await page.getByText("Show server console on start", { exact: true }).waitFor({
      state: "visible",
      timeout: 10_000,
    });
    const consoleSwitch = page.getByRole("switch", {
      name: /Show native console when a server starts/i,
    });
    await consoleSwitch.waitFor({ state: "visible", timeout: 5_000 });
    if (await consoleSwitch.isChecked()) {
      await consoleSwitch.click();
    }
    assert.equal(await consoleSwitch.isChecked(), false);

    await page.getByRole("button", { name: "Servers", exact: true }).first().click();
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10_000 });

    await openWorkspace(page);
    await page.getByRole("tab", { name: "Launch" }).click();
    await page.getByText(/Extra arguments/i).waitFor({ state: "visible", timeout: 10_000 });
    // Seeded structured flags should surface in Launch (labels from catalog tokens).
    await page.getByText("-NoBattlEye", { exact: false }).first().waitFor({
      state: "visible",
      timeout: 10_000,
    });

    await api(page, "startServer", serverId, {
      openNativeConsole: false,
      skipPortValidation: true,
      skipReadinessCheck: true,
    });

    const runtimeLines = await waitForCommandLine(page);
    const commandLine = findCommandLine(runtimeLines);
    assertCommandLineTokens(commandLine);
    assert.ok(
      runtimeLines.some((line) => /Piped mode/i.test(line)),
      "Expected Piped mode runtime note when console is off",
    );
    assert.ok(
      !runtimeLines.some((line) => /Native server console opened/i.test(line)),
      "Native console should not open for this e2e",
    );

    await page.getByRole("tab", { name: "Logs" }).click();
    await page.getByRole("tab", { name: "Runtime" }).click();
    const runtimePre = page.locator('[data-logs-scroll-region="runtime"]');
    await runtimePre.waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-logs-scroll-region="runtime"]');
        return el != null && /Commandline:/i.test(el.textContent || "");
      },
      null,
      { timeout: 15_000 },
    );
    const uiText = await runtimePre.innerText();
    for (const token of EXPECTED_TOKENS) {
      assert.ok(uiText.includes(token), `Runtime UI missing ${token}:\n${uiText}`);
    }
    assert.ok(uiText.includes("Piped mode") || /Piped mode/i.test(uiText));

    await page.setViewportSize({ width: 1920, height: 1080 });
    const shot = path.join(shotsDir, "launch-args-runtime-full-hd.png");
    await page.screenshot({ path: shot, fullPage: false });
    assert.ok(fs.existsSync(shot), `missing screenshot ${shot}`);
    console.log(`E2E_LAUNCH_ARGS_SHOT ${shot}`);
    console.log(`E2E_LAUNCH_ARGS_CMDLINE ${commandLine}`);

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(`E2E_LAUNCH_ARGS_OK profile=${profileDir}`);
  } finally {
    killStubProcesses();
    if (app !== null) {
      try {
        await quitApp(app);
      } catch (error) {
        console.warn(`E2E_LAUNCH_ARGS_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      assertFixturePath(profilesRoot, profileDir);
      assertFixturePath(serversRoot, serversDir);
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(serversDir, { recursive: true, force: true });
    } else {
      console.error(`E2E_LAUNCH_ARGS_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_LAUNCH_ARGS_SERVERS_PRESERVED ${serversDir}`);
      console.error(`E2E_LAUNCH_ARGS_SHOTS_PRESERVED ${shotsDir}`);
    }
  }
}

run().catch((error) => {
  console.error("E2E_LAUNCH_ARGS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
