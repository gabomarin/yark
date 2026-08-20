/**
 * Capture website gallery screenshots into website/public/screenshots/
 * (or WEBSITE_SCREENSHOT_OUT).
 *
 * Usage: node scripts/capture-website-screenshots.cjs
 * Requires: prior `npm run build`, Playwright as a project `devDependency`, Windows GUI preferred.
 * Unset ELECTRON_RUN_AS_NODE before running.
 *
 * Always launches with an isolated `YARK_E2E_USER_DATA` profile so private operator
 * fleets never appear in marketing screenshots. Seeds demo servers in that profile.
 *
 * Env (optional):
 *   WEBSITE_SCREENSHOT_OUT       output directory (default: website/public/screenshots)
 *   WEBSITE_VIEWPORT_WIDTH       default 1440
 *   WEBSITE_VIEWPORT_HEIGHT      default 900
 *   WEBSITE_DEMO_SERVER          primary featured profile name
 *   WEBSITE_DEMO_INSTALL_ROOT    parent folder for seeded demo installs
 *   WEBSITE_DEMO_MOD_IDS         comma-separated CurseForge Project IDs
 *   WEBSITE_DEMO_CLUSTER_ID      Cluster ID applied to demo members
 *   WEBSITE_DEMO_CLUSTER_DIR     shared cluster directory for that Cluster ID
 *   WEBSITE_SCREENSHOT_ONLY      `downloads` = recapture downloads.png only
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

function envOr(name, fallback) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function envInt(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const projectRoot = path.resolve(__dirname, "..");
const defaultArkRoot =
  process.platform === "win32"
    ? "C:\\asa-e2e\\website-gallery"
    : path.join(os.tmpdir(), "yark-gallery");

const VIEWPORT = {
  width: envInt("WEBSITE_VIEWPORT_WIDTH", 1440),
  height: envInt("WEBSITE_VIEWPORT_HEIGHT", 900),
};
const DEMO_SERVER = envOr("WEBSITE_DEMO_SERVER", "The Island");
const DEMO_INSTALL_ROOT = envOr("WEBSITE_DEMO_INSTALL_ROOT", defaultArkRoot);
const DEMO_MOD_IDS = envOr("WEBSITE_DEMO_MOD_IDS", "947033,928793,940975")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const DEMO_CLUSTER_ID = envOr("WEBSITE_DEMO_CLUSTER_ID", "yark");
const DEMO_CLUSTER_DIR = envOr(
  "WEBSITE_DEMO_CLUSTER_DIR",
  path.join(DEMO_INSTALL_ROOT, "Cluster"),
);

/** Extra fleet members for overview + Clusters screenshots (isolated profile only). */
const DEMO_FLEET = [
  {
    name: DEMO_SERVER,
    mapLabel: "The Island",
    mapId: "TheIsland_WP",
    session: "YARK Demo",
    folder: "TheIsland",
  },
  {
    name: "Scorched Earth",
    mapLabel: "Scorched Earth",
    mapId: "ScorchedEarth_WP",
    session: "YARK SE",
    folder: "ScorchedEarth",
  },
  {
    name: "Ragnarok",
    mapLabel: "Ragnarok",
    mapId: "Ragnarok_WP",
    session: "YARK Ragnarok",
    folder: "Ragnarok",
  },
];

async function settle(page, ms = 350) {
  await page.waitForTimeout(ms);
}

async function goNav(page, label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await settle(page, 250);
}

async function shot(page, outPath) {
  await settle(page, 400);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`WROTE ${outPath}`);
}

/** Isolated E2E profiles skip auto-open; reopen from Settings (empty fleet = first-run). */
async function captureSetupAssistant(page, outDir) {
  await page.evaluate(() => {
    // Marketing fixture path for gallery shots — not the in-app product default.
    window.localStorage.setItem("settings.defaultServerBaseFolder", "D:\\ASA\\Servers");
  });
  await goNav(page, "Settings");
  await page.getByRole("heading", { name: "Settings" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("button", { name: /open setup assistant/i }).click();
  await page.locator("[data-setup-wizard]").waitFor({
    state: "visible",
    timeout: 10000,
  });
  const continueBtn = page.getByRole("button", { name: /^continue$/i });
  await continueBtn.click();
  await settle(page, 500);
  await shot(page, path.join(outDir, "setup-assistant.png"));
  await continueBtn.click();
  await continueBtn.click();
  const yes = page.getByRole("radio", { name: /yes/i });
  if ((await yes.count()) > 0) {
    await yes.first().click();
    await settle(page, 500);
    await shot(page, path.join(outDir, "setup-assistant-cluster.png"));
  } else {
    console.warn("WARN: setup cluster Yes radio not found; skipped cluster shot");
  }
  const skip = page.getByRole("button", { name: /skip setup/i });
  if ((await skip.count()) > 0) {
    await skip.first().click();
  } else {
    await page.keyboard.press("Escape");
  }
  await page.locator("[data-setup-wizard]").waitFor({
    state: "hidden",
    timeout: 10000,
  }).catch(() => undefined);
  await settle(page, 400);
}

async function redactPrivatePaths(page) {
  try {
    await page.evaluate(() => {
      const scrub = (value) =>
        value
          .replace(/Users\\[^\\]+/gi, "Users\\You")
          .replace(/\/Users\/[^/]+/gi, "/Users/You");

      const roots = [
        ...document.querySelectorAll("main, [data-settings-page], .mantine-AppShell-main"),
      ];
      const scopes = roots.length > 0 ? roots : [document.body];

      for (const scope of scopes) {
        for (const input of scope.querySelectorAll("input, textarea")) {
          if (typeof input.value === "string" && /Users[/\\]/i.test(input.value)) {
            input.value = scrub(input.value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
          if (node.nodeValue && /Users[/\\]/i.test(node.nodeValue)) {
            node.nodeValue = scrub(node.nodeValue);
          }
        }
      }
    });
  } catch (error) {
    console.warn(
      `WARN: could not redact private paths before Settings shot: ${error?.message ?? error}`,
    );
  }
}

/** Apply distinct official map tokens after UI create (Create defaults to The Island). */
function applyDemoMapsInDb(userData) {
  const dbPath = path.join(userData, "yark-server-manager.db");
  assert.ok(fs.existsSync(dbPath), `DB missing at ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  const update = db.prepare(
    `UPDATE servers SET map = ?, map_mod_id = NULL, updated_at = ? WHERE name = ?`,
  );
  const now = new Date().toISOString();
  for (const demo of DEMO_FLEET) {
    update.run(demo.mapId, now, demo.name);
  }
  db.close();
}

async function ensureDemoMods(page) {
  await page.getByRole("tab", { name: "Mods" }).click();
  await page.getByRole("heading", { name: "Mods", exact: true, level: 3 }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  for (const modId of DEMO_MOD_IDS) {
    const already = page.getByText(modId, { exact: true });
    if ((await already.count()) > 0) {
      continue;
    }
    await page.getByLabel("Add CurseForge Project ID or mod URL").fill(modId);
    await page.getByRole("button", { name: "Add mod" }).click();
    try {
      await page.getByText(modId, { exact: true }).first().waitFor({
        state: "visible",
        timeout: 30000,
      });
    } catch {
      console.warn(`WARN: could not verify mod ${modId} after add (Worker/network?)`);
    }
  }
  await settle(page, 900);
}

async function openWorkspaceByName(page, name) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
  const card = page.locator("[data-server-card]", {
    has: page.getByText(name, { exact: true }),
  }).first();
  await card.waitFor({ state: "visible", timeout: 10000 });
  await card.getByRole("button", { name: /Open settings/i }).click();
  await page.getByRole("tab", { name: "Server" }).waitFor({ state: "visible", timeout: 15000 });
  await settle(page, 500);
}

function galleryJob(id, type, serverId, status, phase, extra = {}) {
  const now = "2026-08-18T12:00:00.000Z";
  return {
    id,
    type,
    serverId,
    attempts: extra.attempts ?? 2,
    maxAttempts: 3,
    status,
    phase,
    createdAt: now,
    updatedAt: now,
    lastError: extra.lastError ?? null,
    recoveryReason: extra.recoveryReason ?? null,
    idempotencyKey: extra.idempotencyKey ?? `${type}:${serverId}:`,
    operatorRetryAllowed: extra.operatorRetryAllowed === true,
    context: extra.context ?? {},
  };
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
      "      Console.WriteLine(\"Update state (0x0) 0/1, 0 -- [ 38%]\");",
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

function seedGalleryFleetSql(userData) {
  const dbPath = path.join(userData, "yark-server-manager.db");
  assert.ok(fs.existsSync(dbPath), `DB missing at ${dbPath}`);
  const db = new DatabaseSync(dbPath);
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
  DEMO_FLEET.forEach((demo, index) => {
    const installDir = path.join(DEMO_INSTALL_ROOT, demo.folder);
    fs.mkdirSync(installDir, { recursive: true });
    insert.run(
      `gallery-dl-${index}`,
      demo.name,
      demo.mapId,
      installDir,
      1,
      demo.session,
      18000 + index * 10,
      38000 + index * 10,
      39000 + index * 10,
      null,
      "admin1234",
      DEMO_CLUSTER_ID,
      DEMO_CLUSTER_DIR,
      "[]",
      "[]",
      "[]",
      "{}",
      now,
      now,
    );
  });
  db.close();
}

function seedDownloadsJobs(userData, steamCmdPath) {
  const dbPath = path.join(userData, "yark-server-manager.db");
  assert.ok(fs.existsSync(dbPath), `DB missing at ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  const servers = db.prepare("SELECT id, name FROM servers").all();
  const byName = new Map(servers.map((row) => [row.name, row.id]));
  const islandId = byName.get(DEMO_SERVER);
  const scorchedId = byName.get("Scorched Earth");
  const ragnarokId = byName.get("Ragnarok");
  assert.ok(islandId, `Demo server "${DEMO_SERVER}" missing`);
  assert.ok(scorchedId, "Demo server Scorched Earth missing");
  assert.ok(ragnarokId, "Demo server Ragnarok missing");
  const jobs = [
    galleryJob("job-island-verify", "verify-files", islandId, "pending", "queued"),
    galleryJob("job-scorched-verify", "verify-files", scorchedId, "pending", "queued"),
    galleryJob("job-ragnarok-verify", "verify-files", ragnarokId, "pending", "queued"),
  ];
  const now = new Date().toISOString();
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
    const groups = [...document.querySelectorAll("[data-queue-group]")];
    return {
      groups: groups.map((group) => group.getAttribute("data-queue-group")),
      rows: rows.map((row) => ({
        id: row.getAttribute("data-download-row"),
        kind: row.getAttribute("data-kind"),
        text: (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
      })),
      steamcmdBanner: document.querySelector("[data-steamcmd-missing-banner]") !== null,
    };
  });
  console.error(`DUMP ${label} ${JSON.stringify(metrics, null, 2)}`);
}

async function captureDownloadsPage(page, outDir) {
  await goNav(page, "Downloads");
  await page.locator("[data-downloads-page]").waitFor({ state: "visible", timeout: 15_000 });
  const activeRow = page.locator('[data-kind="active"][data-download-row]');
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if ((await activeRow.count()) > 0 && (await activeRow.first().isVisible())) {
      break;
    }
    await settle(page, 500);
  }
  if ((await activeRow.count()) === 0 || !(await activeRow.first().isVisible())) {
    await dumpDownloads(page, "downloads-no-active-row");
    throw new Error("Downloads gallery: no active row appeared");
  }
  await page.locator('[data-kind="queued"][data-download-row]').first().waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await page.locator('[data-kind="active"][data-download-row]').first().click();
  await page.locator("[data-download-live-action]").waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await settle(page, 800);
  await redactPrivatePaths(page);
  try {
    await page.evaluate(() => {
      const scrub = (value) =>
        value
          .replace(
            /[A-Z]:\\Users\\[^\\]+\\AppData\\Local\\Temp\\yark-website-steamcmd-[^\\\s]+\\steamcmd\.exe/gi,
            "C:\\steamcmd\\steamcmd.exe",
          )
          .replace(/Users\\[^\\]+/gi, "Users\\You")
          .replace(/\/Users\/[^/]+/gi, "/Users/You");
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (node.nodeValue && /Users[/\\]|yark-website-steamcmd/i.test(node.nodeValue)) {
          node.nodeValue = scrub(node.nodeValue);
        }
      }
    });
  } catch (error) {
    console.warn(`WARN: could not scrub Downloads console paths: ${error?.message ?? error}`);
  }
  await shot(page, path.join(outDir, "downloads.png"));
}

async function launchIsolatedApp(userData, extraEnv = {}) {
  const env = { ...process.env, YARK_E2E_USER_DATA: userData, ...extraEnv };
  if (typeof extraEnv.STEAMCMD_PATH === "string" && extraEnv.STEAMCMD_PATH.trim() !== "") {
    env.STEAMCMD_PATH = extraEnv.STEAMCMD_PATH;
  }
  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env,
  });
}

async function captureDownloadsGallery(userData, outDir) {
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "yark-website-steamcmd-"));
  const stub = compileHangingSteamCmdStub(stubDir);
  seedDownloadsJobs(userData, stub);
  const app = await launchIsolatedApp(userData, { STEAMCMD_PATH: stub });
  try {
    const page = await app.firstWindow();
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await page.waitForLoadState("domcontentloaded");
    await page.setViewportSize(VIEWPORT);
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 20_000 });
    await settle(page, 2500);
    await captureDownloadsPage(page, outDir);
  } finally {
    await quitApp(app);
    try {
      fs.rmSync(stubDir, { recursive: true, force: true });
    } catch {
      console.warn(`WARN: could not remove SteamCMD stub dir ${stubDir}`);
    }
  }
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

async function run() {
  process.chdir(projectRoot);

  const outDir = path.resolve(
    envOr("WEBSITE_SCREENSHOT_OUT", path.join(projectRoot, "website", "public", "screenshots")),
  );
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(DEMO_INSTALL_ROOT, { recursive: true });
  fs.mkdirSync(DEMO_CLUSTER_DIR, { recursive: true });

  const only = (process.env.WEBSITE_SCREENSHOT_ONLY ?? "").trim().toLowerCase();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "yark-website-shots-"));
  console.log(`WEBSITE_SCREENSHOTS_DIR=${outDir}`);
  console.log(`WEBSITE_SCREENSHOTS_USER_DATA=${userData}`);
  console.log(`WEBSITE_DEMO_INSTALL_ROOT=${DEMO_INSTALL_ROOT}`);
  console.log(`WEBSITE_DEMO_CLUSTER_DIR=${DEMO_CLUSTER_DIR}`);
  if (only) {
    console.log(`WEBSITE_SCREENSHOT_ONLY=${only}`);
  }

  try {
    if (only === "downloads") {
      const boot = await launchIsolatedApp(userData);
      try {
        const page = await boot.firstWindow();
        await page.waitForLoadState("domcontentloaded");
      } finally {
        await quitApp(boot);
      }
      seedGalleryFleetSql(userData);
      await captureDownloadsGallery(userData, outDir);
      console.log("WEBSITE_SCREENSHOTS_OK");
      return;
    }

    // Pass 1: setup assistant shots on an empty isolated profile.
    {
      const app = await launchIsolatedApp(userData);
      try {
        const page = await app.firstWindow();
        page.on("dialog", async (dialog) => {
          await dialog.accept();
        });
        await page.waitForLoadState("domcontentloaded");
        await page.setViewportSize(VIEWPORT);
        await captureSetupAssistant(page, outDir);
      } finally {
        await quitApp(app);
      }
    }

    seedGalleryFleetSql(userData);
    applyDemoMapsInDb(userData);
    console.log(
      `WEBSITE_SCREENSHOTS_SEEDED=${DEMO_FLEET.map((d) => d.name).join(",")} cluster=${DEMO_CLUSTER_ID}`,
    );

    let app = await launchIsolatedApp(userData);

    try {
      const page = await app.firstWindow();
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });

      await page.waitForLoadState("domcontentloaded");
      await page.setViewportSize(VIEWPORT);

      const featured = DEMO_SERVER;
      console.log(`WEBSITE_SCREENSHOTS_FEATURED=${featured}`);
      const clusterConfigured = true;

      await goNav(page, "Servers");
      await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
      await settle(page, 700);
      await shot(page, path.join(outDir, "overview.png"));

      await goNav(page, "Clusters");
      await page.getByRole("heading", { name: "Clusters", level: 1 }).waitFor({
        state: "visible",
        timeout: 10000,
      });
      await page.locator("[data-clusters-page]").waitFor({ state: "visible", timeout: 10000 });
      if (clusterConfigured) {
        try {
          await page.locator(`[data-cluster-detail="${DEMO_CLUSTER_ID}"]`).waitFor({
            state: "visible",
            timeout: 15000,
          });
        } catch {
          console.warn(
            `WARN: cluster detail "${DEMO_CLUSTER_ID}" not visible; capturing Clusters page as-is`,
          );
        }
      }
      await settle(page, 800);
      await shot(page, path.join(outDir, "clusters.png"));

      await goNav(page, "Settings");
      await page.getByRole("heading", { name: "Settings" }).waitFor({
        state: "visible",
        timeout: 10000,
      });
      await settle(page, 500);
      const settingsNav = page.getByRole("navigation", { name: "Settings categories" });
      if ((await settingsNav.count()) > 0) {
        await settingsNav.getByRole("button", { name: "About" }).click();
        await settle(page, 400);
      }
      await redactPrivatePaths(page);
      const yarkUpdates = page.locator("[data-settings-yark-updates]");
      if ((await yarkUpdates.count()) > 0) {
        await yarkUpdates.first().scrollIntoViewIfNeeded();
        await settle(page, 250);
      }
      await settle(page, 200);
      await shot(page, path.join(outDir, "settings.png"));

      await goNav(page, "Logs");
      await page.getByRole("heading", { name: "Logs" }).waitFor({
        state: "visible",
        timeout: 10000,
      });
      await settle(page, 700);
      await shot(page, path.join(outDir, "logs.png"));

      await openWorkspaceByName(page, featured);
      await page.getByRole("tab", { name: "Mods" }).click();
      await settle(page, 400);
      const hasAnyModId = (await page.getByText(/^\d{5,}$/).count()) > 0;
      if (!hasAnyModId) {
        await ensureDemoMods(page);
      }

      await page.getByRole("tab", { name: "Server" }).click();
      await settle(page, 500);
      await shot(page, path.join(outDir, "workspace-server.png"));

      await page.getByRole("tab", { name: "Launch" }).click();
      await settle(page, 400);
      const launchSearch = page.getByPlaceholder("Filter flags by name, description, or group");
      if ((await launchSearch.count()) > 0) {
        await launchSearch.fill("cross");
        await settle(page, 500);
      }
      await shot(page, path.join(outDir, "workspace-launch.png"));

      await page.getByRole("tab", { name: "INI Files" }).click();
      await settle(page, 900);
      await shot(page, path.join(outDir, "workspace-ini.png"));

      await page.getByRole("tab", { name: "Mods" }).click();
      await page.getByRole("heading", { name: "Mods", exact: true, level: 3 }).waitFor({
        state: "visible",
        timeout: 10000,
      });
      await settle(page, 1000);
      await shot(page, path.join(outDir, "workspace-mods.png"));

      await page.getByRole("tab", { name: "Backups" }).click();
      await settle(page, 800);
      await shot(page, path.join(outDir, "workspace-backups.png"));

      await page.getByRole("tab", { name: "Server" }).click();
      await settle(page, 300);
      const wizardBtn = page.getByRole("button", { name: "Configuration wizard" });
      if ((await wizardBtn.count()) > 0) {
        await wizardBtn.first().click();
        await page.locator("[data-configuration-wizard]").waitFor({
          state: "visible",
          timeout: 10000,
        });
        await settle(page, 700);
        await shot(page, path.join(outDir, "configuration-wizard.png"));
        const cancel = page.getByRole("button", { name: "Cancel" });
        if ((await cancel.count()) > 0) {
          await cancel.first().click();
          await settle(page, 300);
        } else {
          await page.keyboard.press("Escape");
        }
      }

      await leaveWorkspaceToServers(page);

      await goNav(page, "Backups");
      await page.getByRole("heading", { name: "Backups" }).waitFor({
        state: "visible",
        timeout: 10000,
      });
      await settle(page, 800);
      await shot(page, path.join(outDir, "backups.png"));
    } finally {
      await quitApp(app);
    }

    await captureDownloadsGallery(userData, outDir);
    console.log("WEBSITE_SCREENSHOTS_OK");
  } finally {
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {
      console.warn(`WARN: could not remove temp userData ${userData}`);
    }
  }
}

run().catch((error) => {
  console.error("WEBSITE_SCREENSHOTS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
