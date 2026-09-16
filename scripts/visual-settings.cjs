const { STEAMCMD_PATH } = require("./e2e-dom-hooks.cjs");
/**
 * Settings page visual review — docs/visual-testing.md
 * Usage: npm run build && node scripts/visual-settings.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  removeFixtureDir,
} = require("./e2e-launch.cjs");

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

async function openSettingsCategory(page, label) {
  const nav = page.getByRole("navigation", { name: "Settings categories" });
  await nav.getByRole("button", { name: label }).click();
  await page.waitForTimeout(200);
}

async function measureSettings(page) {
  return page.evaluate((steamCmdSel) => {
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
      hasSteamCmdPath: document.querySelector(steamCmdSel) !== null,
      mainScrollHeight: main?.scrollHeight ?? null,
      mainClientHeight: main?.clientHeight ?? null,
    };
  }, STEAMCMD_PATH);
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(projectRoot, "artifacts", "visual-settings");
  fs.mkdirSync(outDir, { recursive: true });

  const profileDir = path.join(
    projectRoot,
    "artifacts",
    `visual-settings-profile-${Date.now()}-${process.pid}`,
  );
  fs.mkdirSync(profileDir, { recursive: true });
  const app = await launchElectronApp({ profileDir });
  const errors = [];

  try {
    const page = await waitForOverview(app);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await goNav(page, "Settings");
    await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({
      timeout: 10000,
    });
    await page.getByRole("heading", { name: "General", level: 3 }).waitFor({
      timeout: 10000,
    });

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(300);
      await openSettingsCategory(page, "General");
      const landing = await measureSettings(page);
      assert.equal(landing.pageVisible, true, `${size.name}: settings page not visible`);
      assert.equal(
        landing.hasHorizontalOverflow,
        false,
        `${size.name}: horizontal overflow at ${size.width}x${size.height}`,
      );
      await shot(page, outDir, `settings-${size.name}`);

      await openSettingsCategory(page, "SteamCMD");
      const steamCmd = await measureSettings(page);
      assert.equal(steamCmd.hasSteamCmdPath, true, `${size.name}: missing steamcmd path`);
      assert.equal(
        steamCmd.hasHorizontalOverflow,
        false,
        `${size.name}: horizontal overflow on SteamCMD`,
      );

      await openSettingsCategory(page, "Discord");
      await page.getByRole("heading", { name: "Discord", level: 3 }).waitFor({
        timeout: 10000,
      });
      const discord = await measureSettings(page);
      assert.equal(
        discord.hasHorizontalOverflow,
        false,
        `${size.name}: horizontal overflow on Discord`,
      );
      const eventColumns = await page.evaluate(() => {
        const server = document.querySelector("[data-discord-server-events]")?.getBoundingClientRect();
        const steamCmd = document.querySelector("[data-discord-steamcmd-jobs]")?.getBoundingClientRect();
        return server != null && steamCmd != null
          ? { sameRow: Math.abs(server.top - steamCmd.top) < 2, steamCmdRightOfServer: steamCmd.left > server.left }
          : null;
      });
      assert.ok(eventColumns, `${size.name}: Discord event groups missing`);
      assert.equal(eventColumns.sameRow, true, `${size.name}: Discord groups are not in one row`);
      assert.equal(eventColumns.steamCmdRightOfServer, true, `${size.name}: SteamCMD jobs are not in the right column`);
      await shot(page, outDir, `settings-discord-${size.name}`);

      const discordMaster = page.getByRole("switch", { name: "Discord alerts" });
      if (!(await discordMaster.isChecked())) {
        await discordMaster.check({ force: true });
        await page.waitForTimeout(250);
      }
      const customizeCrash = page.getByRole("button", {
        name: "Customize message for Server crash",
      });
      await customizeCrash.click();
      await page.getByLabel("Custom message for Server crash").waitFor({
        state: "visible",
        timeout: 5000,
      });
      await page.waitForTimeout(350);
      await shot(page, outDir, `settings-discord-customize-${size.name}`);
      await customizeCrash.click();

      await openSettingsCategory(page, "Log files");
      await page.getByRole("heading", { name: "Log retention", level: 3 }).waitFor({
        timeout: 10000,
      });
      await shot(page, outDir, `settings-logs-${size.name}`);
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
    await quitElectronApp(app);
    await removeFixtureDir(profileDir);
  }
}

run().catch((error) => {
  console.error("VISUAL_SETTINGS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
