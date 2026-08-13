/**
 * Workspace Backups tab visual review — docs/visual-testing.md
 * Usage: node scripts/visual-backups.cjs
 * Requires: prior npm run build and at least one server profile.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { pickPathField } = require("./e2e-launch.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

const KIND_TABS = [
  { name: "World save", file: "world" },
  { name: "Player profiles", file: "players" },
  { name: "INI", file: "ini" },
];

/** Baseline HD world listHeight before compaction (visual-backups pre-change). */
const BASELINE_HD_WORLD_LIST = 240;

async function measureLayout(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const list = document.querySelector("[data-backup-list]");
    const settingsBox = document.querySelector("[data-world-settings]");
    const listRect = list?.getBoundingClientRect();
    const settingsRect = settingsBox?.getBoundingClientRect();
    const settingsOpen = settingsBox?.getAttribute("data-settings-open") === "true";
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      listHeight: listRect?.height ?? null,
      listMinHeight: list ? getComputedStyle(list).minHeight : null,
      settingsHeight: settingsRect?.height ?? null,
      settingsOpen,
      hasWorldSettings: settingsBox !== null,
      emptyVisible: document.querySelector("[data-backup-list-empty]") !== null,
    };
  });
}

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function goNav(page, label) {
  const btn = page.getByRole("button", { name: label }).first();
  await btn.click();
  await page.waitForTimeout(200);
}

async function ensureServer(app, page, outDir) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);

  const cards = page.locator("[data-server-card]");
  try {
    await cards.first().waitFor({ state: "visible", timeout: 5000 });
  } catch {
    // empty overview — seed a temporary server below
  }

  if ((await cards.count()) > 0) {
    return { created: false, name: null };
  }

  const installDir = path.join(outDir, "visual-backup-server");
  fs.mkdirSync(installDir, { recursive: true });
  const serverName = `Visual-Backups-${Date.now()}`;

  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("textbox", { name: /^Name$/ }).fill(serverName);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(`Session ${serverName}`);
  await pickPathField(app, page, "Base folder", installDir);
  await page.getByLabel("Game port").fill("17777");
  await page.getByLabel("Query port").fill("37015");
  await page.getByLabel("RCON port").fill("37020");
  await page.locator("input[type='password']").last().fill("visual-test-admin");
  await page.getByRole("button", { name: "Create server" }).click();
  await page.locator("[data-server-card]").first().waitFor({ state: "visible", timeout: 15000 });
  return { created: true, name: serverName };
}

async function openFirstWorkspace(app, page, outDir) {
  await ensureServer(app, page, outDir);
  const firstCard = page.locator("[data-server-card]").first();
  assert.ok((await firstCard.count()) > 0, "Need at least one server for backups visual review");
  await firstCard.getByRole("button", { name: /Open settings/i }).click();
  await page.getByRole("tab", { name: "Backups" }).waitFor({ timeout: 10000 });
  await page.getByRole("tab", { name: "Backups" }).click();
  await page.getByRole("tab", { name: "World save" }).waitFor({ timeout: 10000 });
  await page.locator("[data-backup-list]").waitFor({ state: "visible", timeout: 10000 });
}

async function expandWorldSettings(page) {
  const box = page.locator("[data-world-settings]");
  await box.waitFor({ state: "visible", timeout: 5000 });
  if ((await box.getAttribute("data-settings-open")) === "true") return;
  await box.getByRole("button").first().click();
  await page.waitForTimeout(200);
}

async function collapseWorldSettings(page) {
  const box = page.locator("[data-world-settings]");
  if ((await box.count()) === 0) return;
  if ((await box.getAttribute("data-settings-open")) !== "true") return;
  await box.getByRole("button").first().click();
  await page.waitForTimeout(200);
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-backups");
  fs.mkdirSync(outDir, { recursive: true });

  const app = await electron.launch({ args: ["."], cwd: projectRoot });
  const errors = [];
  const reports = [];

  try {
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("heading", { name: "Servers", level: 1 }).waitFor({
      timeout: 20000,
    });

    await openFirstWorkspace(app, page, outDir);

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(250);

      const sizeReport = { size: size.name, tabs: {}, screenshots: [] };

      for (const tab of KIND_TABS) {
        await page.getByRole("tab", { name: tab.name, exact: true }).click();
        await page.waitForTimeout(200);
        await page.locator("[data-backup-list]").waitFor({ state: "visible", timeout: 5000 });

        // Default open metrics (compact settings)
        const metrics = await measureLayout(page);
        assert.equal(
          metrics.hasHorizontalOverflow,
          false,
          `Horizontal overflow on ${tab.file} @ ${size.name}`,
        );
        assert.ok(
          metrics.listHeight !== null && metrics.listHeight >= 240,
          `list min-height not applied on ${tab.file} @ ${size.name}: height=${metrics.listHeight}`,
        );

        if (tab.file === "world") {
          assert.ok(metrics.hasWorldSettings, `World settings missing @ ${size.name}`);
          assert.equal(
            metrics.settingsOpen,
            true,
            `World settings should start open @ ${size.name}`,
          );
          assert.ok(
            metrics.settingsHeight !== null && metrics.settingsHeight < 140,
            `Open world settings still tall @ ${size.name}: ${metrics.settingsHeight}px`,
          );

          // Collapsed summary still available
          await collapseWorldSettings(page);
          const collapsed = await measureLayout(page);
          assert.equal(collapsed.settingsOpen, false, `World settings collapse failed @ ${size.name}`);
          assert.ok(
            collapsed.settingsHeight !== null && collapsed.settingsHeight < 80,
            `Collapsed world settings still tall @ ${size.name}: ${collapsed.settingsHeight}px`,
          );
          await expandWorldSettings(page);

          if (size.name === "hd") {
            const openAgain = await measureLayout(page);
            assert.ok(
              openAgain.listHeight !== null
                && openAgain.listHeight > BASELINE_HD_WORLD_LIST,
              `HD world listHeight should improve vs baseline ${BASELINE_HD_WORLD_LIST}: got ${openAgain.listHeight}`,
            );
          }
        } else {
          assert.equal(
            metrics.hasWorldSettings,
            false,
            `World settings should hide on ${tab.file} @ ${size.name}`,
          );
        }

        // Create / primary action visible
        const createBtn = page.getByRole("button", {
          name: tab.file === "players" ? /Backup all players/i : /^Backup$/i,
        });
        await createBtn.waitFor({ state: "visible", timeout: 5000 });

        const file = await shot(page, outDir, `${size.name}-${tab.file}`);
        sizeReport.tabs[tab.file] = metrics;
        sizeReport.screenshots.push(file);
      }

      reports.push(sizeReport);
    }

    console.log("VISUAL_BACKUPS_DIR=" + outDir);
    for (const report of reports) {
      console.log(JSON.stringify(report));
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }

    console.log("VISUAL_BACKUPS_OK");
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("VISUAL_BACKUPS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
