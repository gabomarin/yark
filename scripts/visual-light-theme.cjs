const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  initProfileDatabase,
  launchElectronApp,
  quitElectronApp,
  removeFixtureDir,
  waitForOverview,
} = require("./e2e-launch.cjs");

/**
 * Light theme visual review (#PUX-004 B3) - docs/visual-testing.md
 * Usage: npm run build && node scripts/visual-light-theme.cjs
 *
 * Seeds `appearance.v1` with the light theme in an isolated profile, then checks
 * the mounted scheme and captures Overview / Settings / Appearance at HD, Full
 * HD and QHD.
 */
delete process.env.ELECTRON_RUN_AS_NODE;

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

function seedLightTheme(profileDir) {
  const dbPath = path.join(profileDir, "yark-server-manager.db");
  initProfileDatabase(dbPath);
  const db = new DatabaseSync(dbPath);
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run("appearance.v1", JSON.stringify({ theme: "light", panels: "auto" }), new Date().toISOString());
  db.close();
}

async function goNav(page, label) {
  const btn = page.getByRole("button", { name: label, exact: true }).first();
  if ((await btn.count()) > 0) {
    await btn.click();
    await page.waitForTimeout(200);
  }
}

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SHOT ${file}`);
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(projectRoot, "artifacts", "visual-light-theme");
  fs.mkdirSync(outDir, { recursive: true });

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "yark-visual-light-"));
  seedLightTheme(profileDir);

  const app = await launchElectronApp({ profileDir });
  const errors = [];
  try {
    const page = await waitForOverview(app);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    const mounted = await page.evaluate(() => {
      const root = document.documentElement;
      const style = getComputedStyle(root);
      return {
        attribute: root.getAttribute("data-mantine-color-scheme"),
        colorScheme: style.colorScheme,
        panel: style.getPropertyValue("--app-color-panel").trim(),
        text: style.getPropertyValue("--app-color-text").trim(),
      };
    });
    assert.equal(mounted.attribute, "light", "Mantine scheme attribute is not light");
    assert.ok(mounted.colorScheme.includes("light"), `color-scheme is "${mounted.colorScheme}"`);
    console.log(
      `VISUAL_LIGHT_SCHEME=${mounted.attribute} panel=${mounted.panel} text=${mounted.text} color-scheme=${mounted.colorScheme}`,
    );

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(300);

      await goNav(page, "Servers");
      await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
      const overflow = await page.evaluate(
        () =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
          document.documentElement.clientWidth + 1,
      );
      assert.equal(overflow, false, `${size.name}: horizontal overflow on Overview`);
      await shot(page, outDir, `overview-${size.name}`);

      await goNav(page, "Settings");
      await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({ timeout: 10000 });
      await shot(page, outDir, `settings-${size.name}`);

      await page
        .getByRole("navigation", { name: "Settings categories" })
        .getByRole("button", { name: "Appearance" })
        .click();
      await page.getByRole("heading", { name: "Appearance", level: 3 }).waitFor({ timeout: 10000 });
      const themeValue = await page
        .getByLabel("Theme")
        .inputValue()
        .catch(() => null);
      console.log(`VISUAL_LIGHT_THEME_ROW=${size.name} theme=${themeValue ?? "(control)"}`);
      await shot(page, outDir, `appearance-${size.name}`);
    }

    console.log("VISUAL_LIGHT_DIR=" + outDir);
    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
    console.log("VISUAL_LIGHT_THEME_OK");
  } finally {
    await quitElectronApp(app);
    removeFixtureDir(profileDir);
  }
}

run().catch((error) => {
  console.error("VISUAL_LIGHT_THEME_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
