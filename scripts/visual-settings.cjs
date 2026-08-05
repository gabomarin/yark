/**
 * Settings page visual review — docs/visual-testing.md
 * Usage: npm run build && node scripts/visual-settings.cjs
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
  await page.waitForTimeout(250);
}

async function measureSettings(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const pageRoot = document.querySelector("[data-settings-page]");
    const main = document.querySelector(".mantine-AppShell-main") ?? document.querySelector("main");
    const pageRect = pageRoot?.getBoundingClientRect();

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      pageVisible: pageRoot !== null && (pageRect?.width ?? 0) > 0,
      hasSteamCmdPath: document.querySelector("[data-steamcmd-path]") !== null,
      mainScrollHeight: main?.scrollHeight ?? null,
      mainClientHeight: main?.clientHeight ?? null,
    };
  });
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-settings");
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

    await goNav(page, "Settings");
    await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({
      timeout: 10000,
    });
    await page.getByText("Show server console on start").waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "Log retention", level: 3 }).waitFor({
      timeout: 10000,
    });

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(300);
      const metrics = await measureSettings(page);
      assert.equal(metrics.pageVisible, true, `${size.name}: settings page not visible`);
      assert.equal(metrics.hasSteamCmdPath, true, `${size.name}: missing steamcmd path`);
      assert.equal(
        metrics.hasHorizontalOverflow,
        false,
        `${size.name}: horizontal overflow at ${size.width}x${size.height}`,
      );
      await page.getByRole("heading", { name: "Log retention", level: 3 }).scrollIntoViewIfNeeded();
      await shot(page, outDir, `settings-${size.name}`);
      await page.getByRole("button", { name: /Clean up now/i }).click();
      await page.getByText("Clean up old logs").waitFor({ state: "visible", timeout: 5000 });
      assert.ok(
        (await page.getByRole("button", { name: /^Scan$/i }).count()) > 0,
        `${size.name}: cleanup modal missing Scan`,
      );
      await shot(page, outDir, `settings-cleanup-${size.name}`);
      await page.getByRole("button", { name: /^Cancel$/i }).click();
      await page.getByText("Clean up old logs").waitFor({ state: "hidden", timeout: 5000 });
    }

    console.log("VISUAL_SETTINGS_DIR=" + outDir);
    if (errors.length > 0) {
      console.log("VISUAL_SETTINGS_WARN_CONSOLE=" + errors.join(" | "));
    }
    console.log("VISUAL_SETTINGS_OK");
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("VISUAL_SETTINGS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
