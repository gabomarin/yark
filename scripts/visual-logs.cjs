/**
 * Visual review of fleet + server Logs tabs with seeded real-looking data (#96).
 * Captures HD / Full HD / QHD evidence for changed Logs chrome.
 *
 * Usage: Prefer `node scripts/seed-server-logs.cjs` first, then
 * `npm run build && node scripts/visual-logs.cjs`
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

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

async function expectText(page, pattern) {
  await page.getByText(pattern).first().waitFor({ state: "visible", timeout: 8000 });
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1;
  });
  assert.equal(overflow, false, `Horizontal overflow on ${label}`);
}

async function captureLogsSurface(page, outDir, size) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.waitForTimeout(250);

  await goNav(page, "Logs");
  await page.getByRole("heading", { name: "Logs", level: 1 }).waitFor({ timeout: 10000 });
  await page.getByText("Fleet activity").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await shot(page, outDir, `${size.name}-01-fleet-problems`);
  await assertNoHorizontalOverflow(page, `${size.name} fleet`);

  const fleetRow = page.locator("[data-logs-scroll-region='fleet'] button").first();
  if ((await fleetRow.count()) > 0) {
    await fleetRow.click();
    await page.waitForTimeout(250);
    await shot(page, outDir, `${size.name}-02-fleet-expanded`);
  }

  await goNav(page, "Servers");
  await page.locator("[data-server-card]").first().waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-server-card]").first().getByRole("button", { name: /Open settings/i }).click();
  await page.getByRole("tab", { name: "Logs" }).waitFor({ timeout: 10000 });
  await page.getByRole("tab", { name: "Logs" }).click();
  await page.locator("[data-server-logs-panel]").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(300);
  await shot(page, outDir, `${size.name}-03-server-events`);
  await assertNoHorizontalOverflow(page, `${size.name} server events`);

  await page.getByRole("tab", { name: "Updates" }).click();
  await page.waitForTimeout(300);
  await expectText(page, /Job history|SteamCMD|Update details|No update jobs/i);
  const failedBadge = page.getByText("failed", { exact: true }).first();
  if ((await failedBadge.count()) > 0) {
    await failedBadge.click();
    await page.waitForTimeout(250);
  }
  await shot(page, outDir, `${size.name}-04-updates-selected`);
  await assertNoHorizontalOverflow(page, `${size.name} updates`);
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

    for (const size of sizes) {
      await captureLogsSurface(page, outDir, size);
    }

    console.log("VISUAL_LOGS_DIR=" + outDir);
    if (errors.length > 0) {
      console.log("VISUAL_LOGS_WARN_CONSOLE=" + errors.join(" | "));
    }
    console.log("VISUAL_LOGS_OK");
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("VISUAL_LOGS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
