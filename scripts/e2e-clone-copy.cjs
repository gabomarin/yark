/**
 * Isolated E2E for Clone server (#160): INI seed vs full-folder copy.
 *
 * Seeds a tiny fake ASA tree (KB-scale, not a real depot). Asserts:
 * - Empty source: "Copy entire server folder" is disabled.
 * - Profile-only clone: Game.ini / GUS markers copy; binaries and world do not.
 * - Folder copy: binaries + Saved marker copy; form ports/session overwrite GUS.
 *
 * Usage: npm run build && npm run e2e:clone-copy
 *
 * Always deletes the disposable YARK_E2E_USER_DATA + install dirs (even on fail).
 */
const assert = require("node:assert/strict");
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

const GAME_MARKER = "BabyMatureSpeedMultiplier=12.34";
const GUS_RATE_MARKER = "HarvestAmountMultiplier=7.77";
const SOURCE_SESSION = "SourceSessionMarker";

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

function writeReadyInstall(installDir, ports, worldMarker) {
  const bin = path.dirname(exePath(installDir));
  const config = windowsConfigDir(installDir);
  const savedArks = path.dirname(worldMarkerPath(installDir));
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(config, { recursive: true });
  fs.mkdirSync(savedArks, { recursive: true });
  fs.writeFileSync(exePath(installDir), "fake-asa-binary\n");
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

function seedDatabase(dbPath, fixtures) {
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
  for (const fixture of fixtures) {
    insert.run(
      fixture.id,
      fixture.name,
      "TheIsland_WP",
      fixture.installDir,
      1,
      fixture.sessionName,
      fixture.ports.game,
      fixture.ports.query,
      fixture.ports.rcon,
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
  }
  db.close();
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

async function waitForHealthSettled(page, expectedAttention, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const scanning = page.locator("[data-install-health-scan]");
    if ((await scanning.count()) > 0) {
      await page.waitForTimeout(250);
      continue;
    }
    const badge = page.locator("[data-attention-count]");
    if ((await badge.count()) > 0) {
      const count = Number(await badge.first().getAttribute("data-attention-count"));
      if (count === expectedAttention) {
        return;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Install health did not settle (expected attention=${expectedAttention})`,
  );
}

async function fillNumber(dialog, label, value) {
  const input = dialog.getByLabel(label);
  await input.click();
  await input.fill(String(value));
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertContains(haystack, needle, label) {
  assert.ok(
    haystack.includes(needle),
    `${label} missing ${JSON.stringify(needle)}`,
  );
}

function assertNotContains(haystack, needle, label) {
  assert.ok(
    !haystack.includes(needle),
    `${label} unexpectedly contains ${JSON.stringify(needle)}`,
  );
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Clone-copy E2E requires Windows paths");

  const { profileDir, serversDir, runId, fixtureName, root } =
    createE2eFixtureRoots("clone-copy");
  assertUnderFixtureRoot(path.join(root, "profiles"), profileDir);
  assertUnderFixtureRoot(path.join(root, "servers"), serversDir);

  const dbPath = path.join(profileDir, "yark-server-manager.db");
  const worldMarker = `YARK_E2E_CLONE_WORLD_${runId}`;
  const readyPorts = {
    game: 30101,
    query: 30102,
    rcon: 30103,
  };
  const emptyPorts = {
    game: 30201,
    query: 30202,
    rcon: 30203,
  };
  const fullClonePorts = {
    game: 30301,
    query: 30302,
    rcon: 30303,
  };

  const readyName = `SrcReady-${runId}`;
  const emptyName = `SrcEmpty-${runId}`;
  const readyInstall = path.join(serversDir, "ready");
  const emptyInstall = path.join(serversDir, "empty");
  const profileCloneName = `${readyName}-copy`;
  const fullCloneName = `SrcFull-${runId}`;
  const profileCloneDir = path.join(serversDir, profileCloneName);
  const fullCloneDir = path.join(serversDir, fullCloneName);

  writeReadyInstall(readyInstall, readyPorts, worldMarker);
  fs.mkdirSync(emptyInstall, { recursive: true });

  let app = null;
  try {
    app = await launchElectronApp({ profileDir });
    await waitForOverview(app);
    await quitElectronApp(app);
    app = null;

    seedDatabase(dbPath, [
      {
        id: `e2e-ready-${runId}`,
        name: readyName,
        installDir: readyInstall,
        sessionName: SOURCE_SESSION,
        ports: readyPorts,
      },
      {
        id: `e2e-empty-${runId}`,
        name: emptyName,
        installDir: emptyInstall,
        sessionName: `Empty ${runId}`,
        ports: emptyPorts,
      },
    ]);

    app = await launchElectronApp({ profileDir });
    const page = await waitForOverview(app);
    await page.setViewportSize({ width: 1920, height: 1080 });
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await waitForHealthSettled(page, 1);

    const readyCard = await waitForCardByName(page, readyName);
    assert.equal(await readyCard.getAttribute("data-tone"), "stopped");
    const emptyCard = await waitForCardByName(page, emptyName);
    assert.equal(await emptyCard.getAttribute("data-tone"), "attention");

    const emptyDialog = await openCloneDialog(page, emptyName);
    const emptyCopy = emptyDialog.getByRole("checkbox", {
      name: /Copy entire server folder/i,
    });
    await emptyCopy.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await emptyCopy.isDisabled(), true);
    assert.match(
      await emptyDialog.innerText(),
      /no install files yet/i,
    );
    await emptyDialog.getByRole("button", { name: "Cancel" }).click();
    await emptyDialog.waitFor({ state: "hidden", timeout: 10000 });
    await dismissOpenMenus(page);

    const profileDialog = await openCloneDialog(page, readyName);
    const profileCopy = profileDialog.getByRole("checkbox", {
      name: /Copy entire server folder/i,
    });
    await profileCopy.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await profileCopy.isDisabled(), false);
    assert.equal(await profileCopy.isChecked(), false);
    await profileDialog.getByRole("button", { name: "Clone server" }).click();
    await profileDialog.waitFor({ state: "hidden", timeout: 60_000 });
    await waitForCardByName(page, profileCloneName, 15000);
    await dismissOpenMenus(page);

    const profileGame = readUtf8(path.join(windowsConfigDir(profileCloneDir), "Game.ini"));
    const profileGus = readUtf8(
      path.join(windowsConfigDir(profileCloneDir), "GameUserSettings.ini"),
    );
    assertContains(profileGame, GAME_MARKER, "profile-only Game.ini");
    assertContains(profileGus, GUS_RATE_MARKER, "profile-only GUS rates");
    assertContains(profileGus, `SessionName=${SOURCE_SESSION}-copy`, "profile-only session");
    assertContains(profileGus, `Port=${readyPorts.game + 10}`, "profile-only game port");
    assertContains(profileGus, `QueryPort=${readyPorts.query + 10}`, "profile-only query port");
    assertContains(profileGus, `RCONPort=${readyPorts.rcon + 10}`, "profile-only RCON port");
    assert.equal(
      fs.existsSync(exePath(profileCloneDir)),
      false,
      "profile-only clone must not copy ArkAscendedServer.exe",
    );
    assert.equal(
      fs.existsSync(worldMarkerPath(profileCloneDir)),
      false,
      "profile-only clone must not copy world marker",
    );

    const sourceGusAfterProfile = readUtf8(
      path.join(windowsConfigDir(readyInstall), "GameUserSettings.ini"),
    );
    assertContains(sourceGusAfterProfile, SOURCE_SESSION, "source session after profile clone");
    assertContains(sourceGusAfterProfile, `Port=${readyPorts.game}`, "source port after profile clone");

    const fullDialog = await openCloneDialog(page, readyName);
    await fullDialog.getByRole("textbox", { name: /Server name/i }).fill(fullCloneName);
    await fullDialog.getByRole("textbox", { name: /Session name/i }).fill(`${fullCloneName}-session`);
    await fillNumber(fullDialog, "Game port", fullClonePorts.game);
    await fillNumber(fullDialog, "Query port", fullClonePorts.query);
    await fillNumber(fullDialog, "RCON port", fullClonePorts.rcon);
    const fullCopy = fullDialog.getByRole("checkbox", {
      name: /Copy entire server folder/i,
    });
    await fullCopy.check();
    assert.equal(await fullCopy.isChecked(), true);
    await fullDialog.getByRole("button", { name: "Clone server" }).click();
    await fullDialog.waitFor({ state: "hidden", timeout: 180_000 });
    await waitForCardByName(page, fullCloneName, 15000);

    assert.equal(fs.existsSync(exePath(fullCloneDir)), true, "folder copy missing exe");
    assert.equal(
      readUtf8(worldMarkerPath(fullCloneDir)).trim(),
      worldMarker,
      "folder copy missing world marker",
    );
    const fullGame = readUtf8(path.join(windowsConfigDir(fullCloneDir), "Game.ini"));
    const fullGus = readUtf8(path.join(windowsConfigDir(fullCloneDir), "GameUserSettings.ini"));
    assertContains(fullGame, GAME_MARKER, "folder-copy Game.ini");
    assertContains(fullGus, GUS_RATE_MARKER, "folder-copy GUS rates");
    assertContains(fullGus, `${fullCloneName}-session`, "folder-copy session");
    assertContains(fullGus, `Port=${fullClonePorts.game}`, "folder-copy game port");
    assertContains(fullGus, `QueryPort=${fullClonePorts.query}`, "folder-copy query port");
    assertContains(fullGus, `RCONPort=${fullClonePorts.rcon}`, "folder-copy RCON port");
    assertNotContains(fullGus, SOURCE_SESSION, "folder-copy GUS session");

    const sourceGusFinal = readUtf8(
      path.join(windowsConfigDir(readyInstall), "GameUserSettings.ini"),
    );
    const sourceGameFinal = readUtf8(path.join(windowsConfigDir(readyInstall), "Game.ini"));
    assertContains(sourceGameFinal, GAME_MARKER, "source Game.ini after folder copy");
    assertContains(sourceGusFinal, SOURCE_SESSION, "source session after folder copy");
    assertContains(sourceGusFinal, `Port=${readyPorts.game}`, "source port after folder copy");
    assert.equal(readUtf8(worldMarkerPath(readyInstall)).trim(), worldMarker);

    console.log("E2E_CLONE_COPY_OK");
    console.log(`E2E_READY=${readyName}`);
    console.log(`E2E_PROFILE_CLONE=${profileCloneName}`);
    console.log(`E2E_FOLDER_CLONE=${fullCloneName}`);
    console.log(`E2E_FIXTURE=${fixtureName}`);
  } finally {
    if (app !== null) {
      try {
        await quitElectronApp(app);
      } catch (error) {
        console.warn(`E2E_CLONE_COPY_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    await removeFixtureDir(profileDir);
    await removeFixtureDir(serversDir);
    console.log("E2E_CLONE_COPY_CLEANED");
  }
}

run().catch((error) => {
  console.error("E2E_CLONE_COPY_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
