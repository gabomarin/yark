/**
 * Setup assistant visual audit — docs/visual-testing.md (#298)
 * Usage: npm run build && node scripts/visual-setup-wizard.cjs
 *
 * Uses an isolated empty fleet and captures every step at HD / Full HD / QHD.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createE2eFixtureRoots,
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

async function capture(page, outDir, size, step, fileStep = step) {
  await page.waitForTimeout(150);
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const dialog = document.querySelector('[role="dialog"]');
    const rect = dialog?.getBoundingClientRect();
    return {
      step: document.querySelector("[data-setup-wizard]")?.getAttribute(
        "data-setup-wizard-step",
      ),
      documentOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      dialogOverflow:
        dialog !== null && dialog.scrollWidth > dialog.clientWidth + 1,
      dialogInsideViewport:
        rect !== undefined &&
        rect.left >= -1 &&
        rect.right <= window.innerWidth + 1 &&
        rect.top >= -1 &&
        rect.bottom <= window.innerHeight + 1,
    };
  });
  assert.equal(metrics.step, step, `${size.name}: expected ${step} step`);
  assert.equal(metrics.documentOverflow, false, `${size.name}: document overflow`);
  assert.equal(metrics.dialogOverflow, false, `${size.name}: dialog overflow`);
  assert.equal(metrics.dialogInsideViewport, true, `${size.name}: dialog clipped`);

  const file = path.join(outDir, `setup-${fileStep}-${size.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SHOT ${file}`);
}

async function captureSettings(page, outDir, size, category) {
  await page.waitForTimeout(150);
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  assert.equal(hasOverflow, false, `${size.name}: Settings overflow`);
  const file = path.join(outDir, `settings-${category}-${size.name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SHOT ${file}`);
}

async function run() {
  const fixture = createE2eFixtureRoots("visual-setup", { createServers: false });
  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-setup-wizard");
  fs.mkdirSync(outDir, { recursive: true });
  const app = await launchElectronApp({ profileDir: fixture.profileDir });

  try {
    const page = await waitForOverview(app);
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.evaluate(() => {
      window.localStorage.setItem(
        "settings.defaultServerBaseFolder",
        "D:\\ASA\\Servers",
      );
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("[data-overview-page]").waitFor();
    await page.waitForTimeout(500);
    if ((await page.locator("[data-setup-wizard]").count()) === 0) {
      await page.getByRole("button", { name: "Settings", exact: true }).first().click();
      await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
      const settingsNav = page.getByRole("navigation", { name: "Settings categories" });
      for (const size of sizes) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await settingsNav.getByRole("button", { name: "General" }).click();
        await captureSettings(page, outDir, size, "general");
        await settingsNav.getByRole("button", { name: "SteamCMD" }).click();
        await captureSettings(page, outDir, size, "steamcmd");
      }
      await settingsNav.getByRole("button", { name: "General" }).click();
      await page.getByRole("button", { name: "Open setup assistant" }).click();
    }
    await page.locator('[data-setup-wizard-step="welcome"]').waitFor();

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(200);
      await capture(page, outDir, size, "welcome");

      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await capture(page, outDir, size, "paths");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await capture(page, outDir, size, "shell");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await capture(page, outDir, size, "cluster");

      await page.getByRole("radio", { name: /Yes — set ID and folder/i }).click();
      await page.getByText(/Suggested from your default base folder/i).waitFor();
      await page.locator("[data-setup-wizard]").hover();
      await page.mouse.wheel(0, 500);
      await capture(page, outDir, size, "cluster", "cluster-share");

      await page.getByRole("radio", { name: "Not now", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await capture(page, outDir, size, "action");

      for (let back = 0; back < 4; back += 1) {
        await page.getByRole("button", { name: "Back", exact: true }).click();
      }
      await page.locator('[data-setup-wizard-step="welcome"]').waitFor();
    }

    assert.deepEqual(errors, [], errors.join(" | "));
    console.log(`VISUAL_SETUP_DIR=${outDir}`);
    console.log("VISUAL_SETUP_OK");
  } finally {
    await quitElectronApp(app);
    await removeFixtureDir(fixture.profileDir);
  }
}

run().catch((error) => {
  console.error("VISUAL_SETUP_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
