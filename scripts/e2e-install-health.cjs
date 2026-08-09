/**
 * E2E: installation-health classifier surfaces (#57).
 *
 * Seeds lightweight FS fixtures (KB-scale — not a real ASA install) and checks
 * Overview attention + card CTAs after the shared startup/on-demand scan.
 *
 * Usage: npm run build && npm run e2e:install-health
 *
 * Requires Windows + display. Unset ELECTRON_RUN_AS_NODE before running.
 * Fixtures live under C:\asa-e2e and are deleted on success.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");
const e2eRoot = path.resolve("C:\\asa-e2e");
const profilesRoot = path.join(e2eRoot, "profiles");
const serversRoot = path.join(e2eRoot, "servers");
const runId = `${Date.now()}-${process.pid}`;
const fixtureName = `install-health-${runId}`;
const profileDir = path.join(profilesRoot, fixtureName);
const serversDir = path.join(serversRoot, fixtureName);
const dbPath = path.join(profileDir, "yark-server-manager.db");

/** @typedef {"missing" | "empty" | "incomplete" | "suspicious" | "ready"} HealthKind */

/** @type {Array<{ kind: HealthKind; id: string; name: string; installDir: string; ports: { game: number; query: number; rcon: number } }>} */
const FIXTURES = [
  {
    kind: "missing",
    id: `e2e-missing-${runId}`,
    name: `IH Missing ${runId}`,
    installDir: path.join(serversDir, "missing-path"),
    ports: { game: 29101, query: 29102, rcon: 29103 },
  },
  {
    kind: "empty",
    id: `e2e-empty-${runId}`,
    name: `IH Empty ${runId}`,
    installDir: path.join(serversDir, "empty"),
    ports: { game: 29111, query: 29112, rcon: 29113 },
  },
  {
    kind: "incomplete",
    id: `e2e-incomplete-${runId}`,
    name: `IH Incomplete ${runId}`,
    installDir: path.join(serversDir, "incomplete"),
    ports: { game: 29121, query: 29122, rcon: 29123 },
  },
  {
    kind: "suspicious",
    id: `e2e-suspicious-${runId}`,
    name: `IH Suspicious ${runId}`,
    installDir: path.join(serversDir, "suspicious"),
    ports: { game: 29131, query: 29132, rcon: 29133 },
  },
  {
    kind: "ready",
    id: `e2e-ready-${runId}`,
    name: `IH Ready ${runId}`,
    installDir: path.join(serversDir, "ready"),
    ports: { game: 29141, query: 29142, rcon: 29143 },
  },
];

function assertFixturePath(root, target) {
  const relative = path.relative(root, target);
  assert.ok(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(path.basename(target), fixtureName);
}

function writeInstallFixtures() {
  fs.mkdirSync(serversDir, { recursive: true });

  // missing: do not create installDir
  fs.mkdirSync(path.join(serversDir, "empty"), { recursive: true });

  const incompleteBin = path.join(
    serversDir,
    "incomplete",
    "ShooterGame",
    "Binaries",
    "Win64",
  );
  fs.mkdirSync(incompleteBin, { recursive: true });

  const suspiciousDir = path.join(serversDir, "suspicious");
  fs.mkdirSync(suspiciousDir, { recursive: true });
  fs.writeFileSync(path.join(suspiciousDir, "readme.txt"), "not an ASA install\n");

  const readyBin = path.join(
    serversDir,
    "ready",
    "ShooterGame",
    "Binaries",
    "Win64",
  );
  fs.mkdirSync(readyBin, { recursive: true });
  fs.writeFileSync(path.join(readyBin, "ArkAscendedServer.exe"), "fake-asa-binary\n");
  fs.writeFileSync(path.join(readyBin, "version.txt"), "e2e-1.0\n");
}

function seedDatabase() {
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

  for (const fixture of FIXTURES) {
    insert.run(
      fixture.id,
      fixture.name,
      "TheIsland_WP",
      fixture.installDir,
      1,
      `Session ${fixture.name}`,
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

async function launchApp() {
  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env: { ...process.env, YARK_E2E_USER_DATA: profileDir },
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

function cardFor(page, name) {
  return page.locator("[data-server-card]", {
    has: page.getByText(name, { exact: true }),
  }).first();
}

async function waitForAttentionSettled(page, expectedCount, timeout = 30_000) {
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
      if (count === expectedCount) {
        return badge.first();
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `Timed out waiting for attention count=${expectedCount} after install-health scan`,
  );
}

async function run() {
  process.chdir(projectRoot);
  assert.equal(process.platform, "win32", "Install-health E2E requires Windows");
  assertFixturePath(profilesRoot, profileDir);
  assertFixturePath(serversRoot, serversDir);

  fs.mkdirSync(profileDir, { recursive: true });
  writeInstallFixtures();

  let app = null;
  let succeeded = false;
  const errors = [];
  try {
    // Initialize embedded schema, then seed lightweight profiles.
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

    // missing / empty / incomplete / suspicious need attention; ready does not.
    const expectedAttention = 4;
    const badge = await waitForAttentionSettled(page, expectedAttention);
    await badge.click();
    const issues = page.locator("[data-attention-issues] [data-attention-issue]");
    await issues.first().waitFor({ state: "visible", timeout: 5_000 });
    assert.equal(await issues.count(), expectedAttention);

    const issueText = await page.locator("[data-attention-issues]").innerText();
    assert.match(issueText, /Missing path/i);
    assert.match(issueText, /Empty folder/i);
    assert.match(issueText, /Incomplete/i);
    assert.match(issueText, /Needs review/i);
    assert.match(issueText, /Checked /i);
    assert.doesNotMatch(issueText, /IH Ready/i);

    // Close popover so it does not intercept card clicks.
    await page.keyboard.press("Escape");

    const missingCard = cardFor(page, FIXTURES[0].name);
    await missingCard.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await missingCard.getAttribute("data-tone"), "attention");
    assert.ok(
      (await missingCard.getByRole("button", { name: /Install server files/i }).count()) > 0,
      "missing install should offer Install",
    );

    const suspiciousCard = cardFor(page, FIXTURES[3].name);
    await suspiciousCard.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(
      await suspiciousCard.getByRole("button", { name: /Install server files/i }).count(),
      0,
      "suspicious foreign contents should not offer Install",
    );

    const readyCard = cardFor(page, FIXTURES[4].name);
    await readyCard.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await readyCard.getAttribute("data-tone"), "stopped");
    assert.equal(
      await readyCard.getByRole("button", { name: /Install server files/i }).count(),
      0,
      "ready install should not offer Install",
    );
    assert.ok(
      (await readyCard.getByRole("button", { name: /Start server/i }).count()) > 0,
      "ready install should expose Start",
    );

    // Shared on-demand job: Check Servers Health should keep attention stable.
    await page.getByRole("button", { name: "Check Servers Health" }).click();
    await waitForAttentionSettled(page, expectedAttention, 30_000);

    // Workspace surfaces health + last checked time (hit the card identity, not actions).
    await readyCard
      .getByRole("button", { name: new RegExp(`Open settings for ${FIXTURES[4].name}`, "i") })
      .click();
    await page.getByRole("tab", { name: "Server" }).waitFor({
      state: "visible",
      timeout: 15_000,
    });
    // Side panel is inline above 1600px; below that it lives in a drawer.
    const statusActions = page.getByRole("button", { name: "Status and actions" });
    if ((await statusActions.count()) > 0) {
      await statusActions.click();
    }
    const sidePanel = page.locator("aside").filter({ hasText: "Install" }).filter({ hasText: "Checked" }).last();
    await sidePanel.waitFor({ state: "visible", timeout: 10_000 });
    await expectText(sidePanel, "Ready");
    await expectText(sidePanel, "Checked");

    const actionableErrors = errors.filter(
      (message) => !/Failed to load resource|net::ERR_/i.test(message),
    );
    assert.deepEqual(actionableErrors, []);
    succeeded = true;
    console.log(`E2E_INSTALL_HEALTH_OK profile=${profileDir}`);
  } finally {
    if (app !== null) {
      try {
        await quitApp(app);
      } catch (error) {
        console.warn(`E2E_INSTALL_HEALTH_CLOSE_WARN ${error?.message ?? String(error)}`);
        await app.close().catch(() => {});
      }
    }
    if (succeeded) {
      assertFixturePath(profilesRoot, profileDir);
      assertFixturePath(serversRoot, serversDir);
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(serversDir, { recursive: true, force: true });
    } else {
      console.error(`E2E_INSTALL_HEALTH_PROFILE_PRESERVED ${profileDir}`);
      console.error(`E2E_INSTALL_HEALTH_SERVERS_PRESERVED ${serversDir}`);
    }
  }
}

async function expectText(locator, value) {
  await locator.getByText(value, { exact: false }).first().waitFor({ state: "visible" });
}

run().catch((error) => {
  console.error("E2E_INSTALL_HEALTH_FAIL");
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
