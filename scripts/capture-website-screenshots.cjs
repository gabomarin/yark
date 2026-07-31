/**
 * Capture website gallery screenshots into website/public/screenshots/
 * (or WEBSITE_SCREENSHOT_OUT).
 *
 * Usage: node scripts/capture-website-screenshots.cjs
 * Requires: prior `npm run build`, Playwright as a project `devDependency`, Windows GUI preferred.
 * Unset ELECTRON_RUN_AS_NODE before running.
 *
 * Env (optional):
 *   WEBSITE_SCREENSHOT_OUT       output directory (default: website/public/screenshots)
 *   WEBSITE_VIEWPORT_WIDTH       default 1440
 *   WEBSITE_VIEWPORT_HEIGHT      default 900
 *   WEBSITE_DEMO_SERVER          seeded profile name when overview is empty
 *   WEBSITE_DEMO_INSTALL_DIR     install/base path for seeded demo
 *   WEBSITE_DEMO_MOD_IDS         comma-separated CurseForge Project IDs
 *   WEBSITE_DEMO_CLUSTER_ID      Cluster ID applied to up to three servers
 *   WEBSITE_DEMO_CLUSTER_DIR     shared cluster directory for that Cluster ID
 *
 * Cleans leftover E2E-* profiles. Uses existing servers when present. Seeds a
 * named demo only if the overview is empty. Captures Clusters, Settings, Logs.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

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
  process.platform === "win32" ? "C:\\ARK" : path.join(os.tmpdir(), "yark-gallery");

const VIEWPORT = {
  width: envInt("WEBSITE_VIEWPORT_WIDTH", 1440),
  height: envInt("WEBSITE_VIEWPORT_HEIGHT", 900),
};
const DEMO_SERVER = envOr("WEBSITE_DEMO_SERVER", "The Island");
const DEMO_INSTALL_DIR = envOr(
  "WEBSITE_DEMO_INSTALL_DIR",
  path.join(defaultArkRoot, "TheIsland"),
);
const DEMO_MOD_IDS = envOr("WEBSITE_DEMO_MOD_IDS", "947033,928793,940975")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const DEMO_CLUSTER_ID = envOr("WEBSITE_DEMO_CLUSTER_ID", "yark");
const DEMO_CLUSTER_DIR = envOr(
  "WEBSITE_DEMO_CLUSTER_DIR",
  path.join(defaultArkRoot, "Cluster"),
);

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

async function removeServerIfPresent(page, name) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
  const card = page
    .locator("[data-server-card]", {
      has: page.getByText(name, { exact: true }),
    })
    .first();
  if ((await card.count()) === 0) {
    return false;
  }
  await card.getByRole("button", { name: "More options" }).click();
  const deleteAction = page.getByRole("menuitem", { name: "Delete server" });
  if ((await deleteAction.count()) === 0) {
    await page.keyboard.press("Escape");
    return false;
  }
  await deleteAction.click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  await card.waitFor({ state: "detached", timeout: 15000 });
  return true;
}

async function removeE2ELeftovers(page) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
  await settle(page, 400);

  for (;;) {
    const e2eCard = page.locator("[data-server-card][data-server-name^='E2E']").first();
    if ((await e2eCard.count()) === 0) {
      break;
    }
    const name = await e2eCard.getAttribute("data-server-name");
    if (!name) {
      break;
    }
    await removeServerIfPresent(page, name);
  }
}

async function createDemoServer(page) {
  const suffix = Date.now() % 100000;
  await goNav(page, "Servers");
  await page.getByRole("button", { name: "New server" }).click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  await page.getByRole("textbox", { name: /^Name$/ }).fill(DEMO_SERVER);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill("YARK Demo");
  const baseFolder = page.getByRole("textbox", { name: /^Base folder$/ });
  if ((await baseFolder.count()) > 0) {
    await baseFolder.fill(DEMO_INSTALL_DIR);
  } else {
    await page.getByPlaceholder("C:\\ark_servers").fill(DEMO_INSTALL_DIR);
  }

  await page.getByLabel("Game port").fill(String(7777 + (suffix % 40)));
  await page.getByLabel("Query port").fill(String(27015 + (suffix % 40)));
  await page.getByLabel("RCON port").fill(String(27020 + (suffix % 40)));
  await page.locator("input[type='password']").last().fill("admin1234");
  await page.getByRole("button", { name: "Save" }).click();

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

async function listServerNames(page) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
  await settle(page, 400);
  const cards = page.locator("[data-server-card]");
  const count = await cards.count();
  const names = [];
  for (let i = 0; i < count; i += 1) {
    const name = await cards.nth(i).getAttribute("data-server-name");
    if (name && !name.startsWith("E2E")) {
      names.push(name);
    }
  }
  return names;
}

async function configureServerCluster(page, serverName) {
  await openWorkspaceByName(page, serverName);
  await page.getByRole("tab", { name: "Server" }).click();
  await settle(page, 300);

  const clusterId = page.getByLabel("Cluster ID");
  await clusterId.fill(DEMO_CLUSTER_ID);
  const clusterDir = page.getByLabel("Shared cluster directory");
  await clusterDir.fill(DEMO_CLUSTER_DIR);

  const save = page.getByRole("button", { name: "Save" }).first();
  await save.click();
  await settle(page, 600);

  await page.getByLabel(/Back to servers/i).click();
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
}

/** Put at least two maps on the same Cluster ID + shared directory for a real Clusters shot. */
async function ensureDemoCluster(page) {
  const names = await listServerNames(page);
  if (names.length < 2) {
    console.warn("WARN: need at least 2 servers to configure a transfer-ready cluster");
    return false;
  }

  const members = names.slice(0, Math.min(3, names.length));
  for (const name of members) {
    await configureServerCluster(page, name);
  }
  console.log(`WEBSITE_SCREENSHOTS_CLUSTER=${DEMO_CLUSTER_ID} members=${members.join(",")}`);
  return true;
}

/** Prefer an existing renamed profile; only seed DEMO_SERVER when overview is empty. */
async function resolveFeaturedServer(page) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
  await settle(page, 500);

  const cards = page.locator("[data-server-card]");
  const count = await cards.count();
  if (count === 0) {
    await createDemoServer(page);
    await ensureDemoMods(page);
    await page.getByLabel(/Back to servers/i).click();
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
    return DEMO_SERVER;
  }

  const demo = page.locator("[data-server-card]", {
    has: page.getByText(DEMO_SERVER, { exact: true }),
  });
  if ((await demo.count()) > 0) {
    return DEMO_SERVER;
  }

  const name = await cards.first().getAttribute("data-server-name");
  if (!name) {
    throw new Error("Featured server card is missing data-server-name");
  }
  return name;
}

async function run() {
  process.chdir(projectRoot);

  const outDir = path.resolve(
    envOr("WEBSITE_SCREENSHOT_OUT", path.join(projectRoot, "website", "public", "screenshots")),
  );
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`WEBSITE_SCREENSHOTS_DIR=${outDir}`);
  console.log(`WEBSITE_DEMO_CLUSTER_DIR=${DEMO_CLUSTER_DIR}`);

  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
  });

  try {
    const page = await app.firstWindow();
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.waitForLoadState("domcontentloaded");
    await page.setViewportSize(VIEWPORT);

    await removeE2ELeftovers(page);
    await removeServerIfPresent(page, "YARK Gallery Demo");
    const featured = await resolveFeaturedServer(page);
    console.log(`WEBSITE_SCREENSHOTS_FEATURED=${featured}`);

    const clusterConfigured = await ensureDemoCluster(page);

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
    } else {
      console.warn("WARN: skipping configured-cluster wait; capturing Clusters empty/partial state");
    }
    await settle(page, 800);
    await shot(page, path.join(outDir, "clusters.png"));

    await goNav(page, "Settings");
    await page.getByRole("heading", { name: "Settings" }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    await settle(page, 500);
    await redactPrivatePaths(page);
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

    await page.getByLabel(/Back to servers/i).click();
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });

    await goNav(page, "Backups");
    await page.getByRole("heading", { name: "Backups" }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    await settle(page, 800);
    await shot(page, path.join(outDir, "backups.png"));

    console.log("WEBSITE_SCREENSHOTS_OK");
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("WEBSITE_SCREENSHOTS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
