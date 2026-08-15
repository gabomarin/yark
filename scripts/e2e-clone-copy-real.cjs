/**
 * Real-host E2E (#160): SteamCMD install a disposable ASA server, then clone
 * profile/INI only and clone with full folder copy.
 *
 * Reuses the host SteamCMD + asa_content_cache (set YARK_E2E_STEAMCMD to override).
 * Isolated YARK_E2E_USER_DATA under C:\asa-e2e. Always deletes those fixtures
 * unless YARK_E2E_KEEP=1.
 *
 * Usage: npm run build && npm run e2e:clone-copy-real
 *
 * Cold SteamCMD can take over an hour; a warm cache is mostly robocopy (~12 GB).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");
const {
  projectRoot,
  createE2eFixtureRoots,
  assertUnderFixtureRoot,
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  pickPathField,
  removeFixtureDir,
} = require("./e2e-launch.cjs");

const MIN_REAL_BINARY_BYTES = 1_000_000;
const INSTALL_TIMEOUT_MS = 90 * 60 * 1000;
const FOLDER_COPY_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const GAME_MARKER = "BabyMatureSpeedMultiplier=12.34";
const GUS_RATE_MARKER = "HarvestAmountMultiplier=7.77";
const SOURCE_SESSION = "RealCloneSourceSession";

function resolveHostSteamCmdExe() {
  const override = process.env.YARK_E2E_STEAMCMD?.trim();
  if (override && fs.existsSync(override)) {
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
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function windowsConfigDir(installDir) {
  return path.join(installDir, "ShooterGame", "Saved", "Config", "WindowsServer");
}

function exePath(installDir) {
  return path.join(
    installDir,
    "ShooterGame",
    "Binaries",
    "Win64",
    "ArkAscendedServer.exe",
  );
}

function worldMarkerPath(installDir) {
  return path.join(installDir, "ShooterGame", "Saved", "SavedArks", "world-marker.txt");
}

function isRealAsaBinary(binaryPath) {
  try {
    return fs.existsSync(binaryPath) && fs.statSync(binaryPath).size > MIN_REAL_BINARY_BYTES;
  } catch {
    return false;
  }
}

function stampSourceMarkers(installDir, ports, worldMarker) {
  const config = windowsConfigDir(installDir);
  fs.mkdirSync(config, { recursive: true });
  fs.mkdirSync(path.dirname(worldMarkerPath(installDir)), { recursive: true });
  fs.writeFileSync(worldMarkerPath(installDir), `${worldMarker}\n`);
  fs.writeFileSync(
    path.join(config, "Game.ini"),
    ["[/Script/ShooterGame.ShooterGameMode]", GAME_MARKER, ""].join("\n"),
  );
  fs.writeFileSync(
    path.join(config, "GameUserSettings.ini"),
    [
      "[ServerSettings]",
      GUS_RATE_MARKER,
      "RCONEnabled=True",
      `RCONPort=${ports.rcon}`,
      "ServerAdminPassword=admin1234",
      "",
      "[SessionSettings]",
      `SessionName=${SOURCE_SESSION}`,
      `Port=${ports.game}`,
      `QueryPort=${ports.query}`,
      "",
    ].join("\n"),
  );
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertContains(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label} missing ${JSON.stringify(needle)}`);
}

async function waitForCardByName(page, name, timeout = 15000) {
  const card = page.locator("[data-server-card]", {
    has: page.getByText(name, { exact: true }),
  });
  await card.first().waitFor({ state: "visible", timeout });
  return card.first();
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
      // try Escape again
    }
  }
}

async function createServer(app, page, serverName, baseFolder, ports) {
  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("textbox", { name: /^Name$/ }).fill(serverName);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(SOURCE_SESSION);
  await pickPathField(app, page, "Base folder", baseFolder);
  await page.getByLabel("Game port").fill(String(ports.game));
  await page.getByLabel("Query port").fill(String(ports.query));
  await page.getByLabel("RCON port").fill(String(ports.rcon));
  await page.locator("input[type='password']").last().fill("admin1234");
  await page.getByRole("button", { name: "Create server" }).click();
  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }
  await leaveWorkspaceToServers(page);
  return waitForCardByName(page, serverName);
}

async function openCloneDialog(page, serverName) {
  const card = await waitForCardByName(page, serverName);
  await dismissOpenMenus(page);
  await card.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menu").waitFor({ state: "visible", timeout: 5000 });
  await page.getByRole("menuitem", { name: "Clone" }).click();
  const dialog = page.getByRole("dialog", { name: /Clone server/i });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  return dialog;
}

async function fillNumber(dialog, label, value) {
  const input = dialog.getByLabel(label);
  await input.click();
  await input.fill(String(value));
}

async function waitWithSteamProgress(page, workPromise, label) {
  let done = false;
  const work = Promise.resolve(workPromise).finally(() => {
    done = true;
  });
  while (!done) {
    await Promise.race([work, page.waitForTimeout(15000)]);
    if (done) {
      break;
    }
    try {
      const st = await page.evaluate(() => window.api.getSteamCmdStatus());
      if (st.ok && st.data) {
        const d = st.data;
        const line = (d.lastLine ?? "").replace(/\s+/g, " ").slice(0, 140);
        console.log(
          `${label} busy=${d.busy} op=${d.operation} pct=${d.progressPercent} ` +
            `msg=${d.progressLabel ?? ""} line=${line}`,
        );
      }
    } catch (error) {
      console.log(`${label} status_poll_warn ${error?.message ?? error}`);
    }
  }
  return work;
}

async function waitDialogHidden(page, dialog, destDir, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  const cancel = dialog.getByRole("button", { name: "Cancel copy" });
  try {
    await cancel.waitFor({ state: "visible", timeout: 20000 });
  } catch {
    const submit = dialog.getByRole("button", { name: "Clone server" });
    if ((await submit.count()) > 0 && (await submit.isVisible())) {
      const snippet = (await dialog.innerText().catch(() => "")).slice(0, 240);
      throw new Error(`${label} copy never started. ${snippet}`);
    }
  }
  while (Date.now() < deadline) {
    const visible = await dialog.isVisible().catch(() => false);
    if (!visible) {
      return;
    }
    const submit = dialog.getByRole("button", { name: "Clone server" });
    if (
      (await submit.count()) > 0 &&
      (await submit.isVisible()) &&
      (await cancel.count()) === 0
    ) {
      const snippet = (await dialog.innerText().catch(() => "")).slice(0, 240);
      throw new Error(`${label} clone form returned (copy failed?). ${snippet}`);
    }
    const exe = exePath(destDir);
    console.log(
      `${label} dest=${fs.existsSync(destDir) ? 1 : 0} exe=${fs.existsSync(exe) ? 1 : 0}`,
    );
    await page.waitForTimeout(15000);
  }
  throw new Error(`${label} dialog still open after ${timeoutMs}ms`);
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Real clone-copy E2E requires Windows");

  const steamCmdExe = resolveHostSteamCmdExe();
  assert.ok(
    steamCmdExe,
    "steamcmd.exe not found. Install SteamCMD or set YARK_E2E_STEAMCMD.",
  );
  console.log(`E2E_CLONE_REAL_STEAMCMD=${steamCmdExe}`);

  const { profileDir, serversDir, runId, fixtureName, root } =
    createE2eFixtureRoots("clone-real");
  assertUnderFixtureRoot(path.join(root, "profiles"), profileDir);
  assertUnderFixtureRoot(path.join(root, "servers"), serversDir);

  const keep = process.env.YARK_E2E_KEEP === "1";
  const sourceName = `RSrc-${process.pid}`;
  const configCloneName = `${sourceName}-copy`;
  const fullCloneName = `RFull-${process.pid}`;
  const sourceInstall = path.join(serversDir, sourceName);
  const configCloneDir = path.join(serversDir, configCloneName);
  const fullCloneDir = path.join(serversDir, fullCloneName);
  const worldMarker = `YARK_E2E_REAL_WORLD_${runId}`;
  const ports = {
    game: 30401,
    query: 30402,
    rcon: 30403,
  };
  const fullPorts = {
    game: 30501,
    query: 30502,
    rcon: 30503,
  };

  let app = null;
  try {
    app = await launchElectronApp({
      profileDir,
      extraEnv: { STEAMCMD_PATH: steamCmdExe },
    });
    const page = await waitForOverview(app);
    await page.setViewportSize({ width: 1920, height: 1080 });
    page.setDefaultTimeout(INSTALL_TIMEOUT_MS);
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    const steamSet = await page.evaluate(async (exePath) => {
      return window.api.setSteamCmdPath(exePath);
    }, steamCmdExe);
    assert.equal(steamSet.ok, true, `setSteamCmdPath failed: ${steamSet.error ?? "?"}`);

    await createServer(app, page, sourceName, serversDir, ports);
    const listed = await page.evaluate(async () => window.api.listServers());
    assert.equal(listed.ok, true, `listServers failed: ${listed.error ?? "?"}`);
    const profile = (listed.data ?? []).find((row) => row.name === sourceName);
    assert.ok(profile, "created server not found");
    assert.equal(
      path.normalize(profile.installDir).toLowerCase(),
      path.normalize(sourceInstall).toLowerCase(),
      `unexpected installDir: ${profile.installDir}`,
    );
    console.log(`E2E_CLONE_REAL_SERVER_ID=${profile.id}`);
    console.log(`E2E_CLONE_REAL_INSTALL_DIR=${profile.installDir}`);

    console.log("E2E_CLONE_REAL_INSTALL_BEGIN");
    const installStarted = Date.now();
    const installResult = await waitWithSteamProgress(
      page,
      Promise.race([
        page.evaluate(async (serverId) => window.api.installServerFiles(serverId), profile.id),
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error(`installServerFiles timed out after ${INSTALL_TIMEOUT_MS}ms`)),
            INSTALL_TIMEOUT_MS,
          );
        }),
      ]),
      "E2E_CLONE_REAL_INSTALL_PROGRESS",
    );
    assert.equal(
      installResult.ok,
      true,
      `installServerFiles failed: ${installResult.error ?? "?"}`,
    );
    assert.ok(
      isRealAsaBinary(exePath(sourceInstall)),
      `install finished but binary missing/too small: ${exePath(sourceInstall)}`,
    );
    console.log(
      `E2E_CLONE_REAL_INSTALL_OK elapsedSec=${Math.round((Date.now() - installStarted) / 1000)} ` +
        `exeBytes=${fs.statSync(exePath(sourceInstall)).size}`,
    );

    stampSourceMarkers(sourceInstall, ports, worldMarker);

    const healthBtn = page.getByRole("button", { name: "Check Servers Health" });
    if ((await healthBtn.count()) > 0) {
      await healthBtn.click();
    }
    const sourceCard = await waitForCardByName(page, sourceName);
    const healthDeadline = Date.now() + 60_000;
    while (Date.now() < healthDeadline) {
      if ((await sourceCard.getByRole("button", { name: /Start server/i }).count()) > 0) {
        break;
      }
      await page.waitForTimeout(1000);
    }
    assert.ok(
      (await sourceCard.getByRole("button", { name: /Start server/i }).count()) > 0,
      "source card never offered Start after install",
    );

    console.log("E2E_CLONE_REAL_CONFIG_BEGIN");
    const configDialog = await openCloneDialog(page, sourceName);
    const configCopy = configDialog.getByRole("checkbox", {
      name: /Copy entire server folder/i,
    });
    await configCopy.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await configCopy.isDisabled(), false);
    assert.equal(await configCopy.isChecked(), false);
    await configDialog.getByRole("button", { name: "Clone server" }).click();
    await configDialog.waitFor({ state: "hidden", timeout: 60_000 });
    await waitForCardByName(page, configCloneName, 15000);
    await dismissOpenMenus(page);

    const configGame = readUtf8(path.join(windowsConfigDir(configCloneDir), "Game.ini"));
    const configGus = readUtf8(path.join(windowsConfigDir(configCloneDir), "GameUserSettings.ini"));
    assertContains(configGame, GAME_MARKER, "config-only Game.ini");
    assertContains(configGus, GUS_RATE_MARKER, "config-only GUS rates");
    assertContains(configGus, `SessionName=${SOURCE_SESSION}-copy`, "config-only session");
    assertContains(configGus, `Port=${ports.game + 10}`, "config-only game port");
    assert.equal(
      isRealAsaBinary(exePath(configCloneDir)),
      false,
      "config-only clone must not copy ArkAscendedServer.exe",
    );
    assert.equal(
      fs.existsSync(worldMarkerPath(configCloneDir)),
      false,
      "config-only clone must not copy world marker",
    );
    console.log("E2E_CLONE_REAL_CONFIG_OK");

    console.log("E2E_CLONE_REAL_COPY_BEGIN");
    const fullDialog = await openCloneDialog(page, sourceName);
    await fullDialog.getByRole("textbox", { name: /Server name/i }).fill(fullCloneName);
    await fullDialog.getByRole("textbox", { name: /Session name/i }).fill(`${fullCloneName}-session`);
    await fillNumber(fullDialog, "Game port", fullPorts.game);
    await fillNumber(fullDialog, "Query port", fullPorts.query);
    await fillNumber(fullDialog, "RCON port", fullPorts.rcon);
    const fullCopy = fullDialog.getByRole("checkbox", {
      name: /Copy entire server folder/i,
    });
    await fullCopy.check();
    assert.equal(await fullCopy.isChecked(), true);
    const copyStarted = Date.now();
    await fullDialog.getByRole("button", { name: "Clone server" }).click();
    await waitDialogHidden(
      page,
      fullDialog,
      fullCloneDir,
      FOLDER_COPY_TIMEOUT_MS,
      "E2E_CLONE_REAL_COPY_PROGRESS",
    );
    await waitForCardByName(page, fullCloneName, 30000);

    assert.ok(
      isRealAsaBinary(exePath(fullCloneDir)),
      `folder copy missing real exe: ${exePath(fullCloneDir)}`,
    );
    assert.equal(
      fs.statSync(exePath(fullCloneDir)).size,
      fs.statSync(exePath(sourceInstall)).size,
      "folder-copy exe size must match source",
    );
    assert.equal(readUtf8(worldMarkerPath(fullCloneDir)).trim(), worldMarker);
    const fullGame = readUtf8(path.join(windowsConfigDir(fullCloneDir), "Game.ini"));
    const fullGus = readUtf8(path.join(windowsConfigDir(fullCloneDir), "GameUserSettings.ini"));
    assertContains(fullGame, GAME_MARKER, "folder-copy Game.ini");
    assertContains(fullGus, GUS_RATE_MARKER, "folder-copy GUS rates");
    assertContains(fullGus, `${fullCloneName}-session`, "folder-copy session");
    assertContains(fullGus, `Port=${fullPorts.game}`, "folder-copy game port");
    assertContains(readUtf8(path.join(windowsConfigDir(sourceInstall), "GameUserSettings.ini")), SOURCE_SESSION);
    console.log(
      `E2E_CLONE_REAL_COPY_OK elapsedSec=${Math.round((Date.now() - copyStarted) / 1000)} ` +
        `exeBytes=${fs.statSync(exePath(fullCloneDir)).size}`,
    );

    console.log("E2E_CLONE_REAL_OK");
    console.log(`E2E_CLONE_REAL_SOURCE=${sourceName}`);
    console.log(`E2E_CLONE_REAL_CONFIG_CLONE=${configCloneName}`);
    console.log(`E2E_CLONE_REAL_FOLDER_CLONE=${fullCloneName}`);
    console.log(`E2E_CLONE_REAL_FIXTURE=${fixtureName}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_CLONE_REAL_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (keep) {
      console.log(`E2E_CLONE_REAL_KEPT profile=${profileDir}`);
      console.log(`E2E_CLONE_REAL_KEPT servers=${serversDir}`);
    } else {
      await removeFixtureDir(profileDir);
      await removeFixtureDir(serversDir);
      console.log("E2E_CLONE_REAL_CLEANED");
    }
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("E2E_CLONE_REAL_FAIL");
    console.error(error?.stack ?? String(error));
    process.exit(1);
  });
