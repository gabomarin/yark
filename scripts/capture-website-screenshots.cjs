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
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");
const { pickPathField } = require("./e2e-launch.cjs");

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

async function createDemoServer(app, page, demo, portOffset) {
  const installDir = path.join(DEMO_INSTALL_ROOT, demo.folder);
  fs.mkdirSync(installDir, { recursive: true });

  await goNav(page, "Servers");
  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  await page.getByRole("textbox", { name: /^Name$/ }).fill(demo.name);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(demo.session);
  await pickPathField(app, page, "Base folder", installDir);

  await page.getByLabel("Game port").fill(String(7777 + portOffset));
  await page.getByLabel("Query port").fill(String(27015 + portOffset));
  await page.getByLabel("RCON port").fill(String(27020 + portOffset));
  await page.locator("input[type='password']").last().fill("admin1234");
  await page.getByRole("button", { name: "Create server" }).click();

  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }

  await page.getByRole("tab", { name: "Server" }).waitFor({
    state: "visible",
    timeout: 15000,
  });
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

async function configureServerCluster(app, page, serverName) {
  await openWorkspaceByName(page, serverName);
  await page.getByRole("tab", { name: "Server" }).click();
  await settle(page, 300);

  const clusterId = page.getByLabel("Cluster ID");
  await clusterId.fill(DEMO_CLUSTER_ID);
  await pickPathField(app, page, "Shared cluster directory", DEMO_CLUSTER_DIR);

  const save = page.getByRole("button", { name: "Save changes" }).first();
  await save.click();
  await settle(page, 600);

  await leaveWorkspaceToServers(page);
}

async function seedIsolatedFleet(app, page) {
  for (let i = 0; i < DEMO_FLEET.length; i += 1) {
    const demo = DEMO_FLEET[i];
    await createDemoServer(app, page, demo, i * 10);
    if (i === 0) {
      await ensureDemoMods(page);
    }
    await leaveWorkspaceToServers(page);
  }
  console.log(
    `WEBSITE_SCREENSHOTS_SEEDED=${DEMO_FLEET.map((d) => d.name).join(",")}`,
  );
}

async function ensureDemoCluster(app, page) {
  const members = DEMO_FLEET.slice(0, 3).map((d) => d.name);
  for (const name of members) {
    await configureServerCluster(app, page, name);
  }
  console.log(`WEBSITE_SCREENSHOTS_CLUSTER=${DEMO_CLUSTER_ID} members=${members.join(",")}`);
  return true;
}

async function launchIsolatedApp(userData) {
  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env: { ...process.env, YARK_E2E_USER_DATA: userData },
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

async function run() {
  process.chdir(projectRoot);

  const outDir = path.resolve(
    envOr("WEBSITE_SCREENSHOT_OUT", path.join(projectRoot, "website", "public", "screenshots")),
  );
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(DEMO_INSTALL_ROOT, { recursive: true });
  fs.mkdirSync(DEMO_CLUSTER_DIR, { recursive: true });

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "yark-website-shots-"));
  console.log(`WEBSITE_SCREENSHOTS_DIR=${outDir}`);
  console.log(`WEBSITE_SCREENSHOTS_USER_DATA=${userData}`);
  console.log(`WEBSITE_DEMO_INSTALL_ROOT=${DEMO_INSTALL_ROOT}`);
  console.log(`WEBSITE_DEMO_CLUSTER_DIR=${DEMO_CLUSTER_DIR}`);

  // Pass 1: seed demo fleet in an isolated profile (never the operator userData).
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
      await seedIsolatedFleet(app, page);
      await ensureDemoCluster(app, page);
    } finally {
      await quitApp(app);
    }
  }

  applyDemoMapsInDb(userData);

  const app = await launchIsolatedApp(userData);

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

    console.log("WEBSITE_SCREENSHOTS_OK");
  } finally {
    await quitApp(app);
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
