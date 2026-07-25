/**
 * Visual review of fleet + server Logs tabs with seeded real-looking data.
 * Usage: npm run build && node scripts/visual-logs.cjs
 * Prefer running seed first: node scripts/seed-server-logs.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SHOT ${file}`);
  return file;
}

async function goNav(page, label) {
  const btn = page.getByRole("button", { name: label, exact: true }).first();
  await btn.click();
  await page.waitForTimeout(300);
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-logs");
  fs.mkdirSync(outDir, { recursive: true });

  const app = await electron.launch({ args: ["."], cwd: projectRoot });
  const errors = [];

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
    await page.setViewportSize({ width: 1440, height: 900 });

    // --- Fleet Logs ---
    await goNav(page, "Logs");
    await page.getByRole("heading", { name: "Logs", level: 1 }).waitFor({ timeout: 10000 });
    await page.getByText("Fleet activity").waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    await shot(page, outDir, "01-fleet-problems");

    // Expand first problem row
    const fleetRow = page.locator("[data-logs-scroll-region='fleet'] button").first();
    await fleetRow.waitFor({ state: "visible", timeout: 10000 });
    await fleetRow.click();
    await page.waitForTimeout(300);
    await expectText(page, /What|Cause|Try next|SteamCMD|backup|server/i);
    await shot(page, outDir, "02-fleet-expanded");

    await page.getByRole("button", { name: /Open in server/i }).click();
    await page.getByRole("tab", { name: "Logs" }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(500);
    await shot(page, outDir, "03-server-events-focused");

    // Events expanded details should be visible from deep-link
    const eventsPanel = page.locator("[data-server-logs-panel]");
    await eventsPanel.waitFor({ state: "visible", timeout: 10000 });
    await shot(page, outDir, "04-events-tab");

    // Runtime
    await page.getByRole("tab", { name: "Runtime" }).click();
    await page.waitForTimeout(300);
    await expectText(page, /Runtime|console|No runtime output/i);
    await shot(page, outDir, "05-runtime-tab");

    // Updates
    await page.getByRole("tab", { name: "Updates" }).click();
    await page.waitForTimeout(400);
    await expectText(page, /Job history|SteamCMD|Update details/i);
    // Click failed update if present
    const failedBadge = page.getByText("failed", { exact: true }).first();
    if (await failedBadge.count()) {
      await failedBadge.click();
      await page.waitForTimeout(400);
    }
    await shot(page, outDir, "06-updates-tab");

    // Backups history (logs tab — scoped to avoid workspace Backups tab)
    const logsPanel = page.locator("[data-server-logs-panel]");
    await logsPanel.getByRole("tab", { name: "Backups", exact: true }).click();
    await page.waitForTimeout(400);
    await expectText(page, /Backups|world|players|ini|No backups recorded|Read-only history/i);
    await shot(page, outDir, "07-backups-history-tab");

    // Back to Events and expand another row manually
    await logsPanel.getByRole("tab", { name: "Events" }).click();
    await page.waitForTimeout(300);
    const eventButtons = page.locator("[data-logs-scroll-region='events'] button");
    const count = await eventButtons.count();
    assert.ok(count >= 3, `Expected several events, got ${count}`);
    if (count > 1) {
      await eventButtons.nth(1).click();
      await page.waitForTimeout(250);
    }
    await shot(page, outDir, "08-events-expanded-second");

    console.log("VISUAL_LOGS_DIR=" + outDir);
    console.log(`VISUAL_LOGS_EVENTS=${count}`);
    if (errors.length > 0) {
      console.log("VISUAL_LOGS_WARN_CONSOLE=" + errors.join(" | "));
    }
    console.log("VISUAL_LOGS_OK");
  } finally {
    await app.close();
  }
}

async function expectText(page, pattern) {
  await page.getByText(pattern).first().waitFor({ state: "visible", timeout: 8000 });
}

run().catch((error) => {
  console.error("VISUAL_LOGS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
