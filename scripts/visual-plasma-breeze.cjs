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
 * Plasma Breeze visual review (#PUX-005-B) - docs/visual-testing.md
 * Usage: npm run build && node scripts/visual-plasma-breeze.cjs
 *
 * Seeds `appearance.v1` with the plasma-breeze family in an isolated profile, for
 * both schemes, then asserts the exact Breeze accent and the Noto Sans typography
 * actually mounted before capturing Overview, Settings, Appearance and the New
 * server overlay at HD and Full HD. The nine server-workspace tabs are covered by
 * `visual-workspace-tabs.cjs` with `YARK_VISUAL_FAMILY=plasma-breeze`.
 */
delete process.env.ELECTRON_RUN_AS_NODE;

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
];

const SCHEMES = ["dark", "light"];

/** The main sidebar routes beyond Servers/Settings, so every page is reviewed in Breeze. */
const ROUTES = [
  { label: "Clusters", page: "[data-clusters-page]" },
  { label: "Downloads", page: "[data-downloads-page]" },
  { label: "Backups", page: "[data-backups-page]" },
  { label: "Logs", page: "[data-logs-page]" },
  { label: "Hosted Resources", page: "[data-hosted-resources-page]" },
];

function seedBreezeTheme(profileDir, scheme) {
  const dbPath = path.join(profileDir, "yark-server-manager.db");
  initProfileDatabase(dbPath);
  const db = new DatabaseSync(dbPath);
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(
    "appearance.v1",
    JSON.stringify({ themeFamily: "plasma-breeze", scheme, panels: "auto" }),
    new Date().toISOString(),
  );
  db.close();
}

async function goNav(page, label) {
  const btn = page.getByRole("button", { name: label, exact: true }).first();
  assert.ok((await btn.count()) > 0, `Sidebar entry "${label}" not found - renamed or localised?`);
  await btn.click();
  await page.waitForTimeout(200);
}

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SHOT ${file}`);
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(projectRoot, "artifacts", "visual-plasma-breeze");
  fs.mkdirSync(outDir, { recursive: true });

  for (const scheme of SCHEMES) {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `yark-visual-breeze-${scheme}-`));
    seedBreezeTheme(profileDir, scheme);

    let app = null;
    const errors = [];
    try {
      app = await launchElectronApp({ profileDir });
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
          accent: style.getPropertyValue("--ark-blue-9").trim().toLowerCase(),
          font: style.getPropertyValue("--mantine-font-family").trim(),
          panel: style.getPropertyValue("--app-color-panel").trim(),
          radiusMd: style.getPropertyValue("--app-radius-md").trim(),
        };
      });
      assert.equal(mounted.attribute, scheme, `Mantine scheme attribute is not ${scheme}`);
      assert.equal(mounted.accent, "#3daee9", `accent is "${mounted.accent}", expected the Breeze #3daee9`);
      assert.ok(mounted.font.includes("Noto Sans"), `body font is "${mounted.font}", expected Noto Sans`);
      assert.ok(mounted.panel.length > 0, "--app-color-panel is not emitted by the resolver");
      // KDE ladder: large surfaces 6px (compact default -> 5px), not Fluent's 8px.
      assert.equal(mounted.radiusMd, "5px", `${scheme}: --app-radius-md is "${mounted.radiusMd}", expected Breeze's 5px (6 * compact)`);
      console.log(
        `VISUAL_BREEZE_SCHEME=${scheme} accent=${mounted.accent} font=${mounted.font} panel=${mounted.panel}`,
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
        assert.equal(overflow, false, `${scheme} / ${size.name}: horizontal overflow on Overview`);
        await shot(page, outDir, `overview-${scheme}-${size.name}`);

        await goNav(page, "Settings");
        await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({ timeout: 10000 });
        await shot(page, outDir, `settings-${scheme}-${size.name}`);

        await page
          .getByRole("navigation", { name: "Settings categories" })
          .getByRole("button", { name: "Appearance" })
          .click();
        await page.getByRole("heading", { name: "Appearance", level: 3 }).waitFor({ timeout: 10000 });
        const breezeSelected = await page.getByRole("radio", { name: "Plasma Breeze" }).isChecked();
        assert.equal(breezeSelected, true, `${scheme} / ${size.name}: Plasma Breeze is not the selected family`);
        const schemeLabel = scheme === "dark" ? "Breeze Dark" : "Breeze Light";
        const schemeSelected = await page.getByRole("radio", { name: schemeLabel }).isChecked();
        assert.equal(schemeSelected, true, `${scheme} / ${size.name}: ${schemeLabel} is not the selected scheme`);
        await shot(page, outDir, `appearance-${scheme}-${size.name}`);

        for (const route of ROUTES) {
          await goNav(page, route.label);
          await page.locator(route.page).waitFor({ state: "visible", timeout: 15000 });
          await page.waitForTimeout(250);
          const slug = route.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          await shot(page, outDir, `${slug}-${scheme}-${size.name}`);
        }

        // Overlay: the New server modal, so dialogs are reviewed in Breeze too.
        await goNav(page, "Servers");
        await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
        // KDE Breeze puts a white label on the accent fill; Mantine's WCAG autoContrast
        // would pick black, so the family resolver must have restored white.
        const primaryLabel = await page
          .getByRole("button", { name: "New server" })
          .first()
          .evaluate((el) => getComputedStyle(el).color);
        assert.equal(primaryLabel, "rgb(255, 255, 255)", `${scheme} / ${size.name}: Breeze accent label is "${primaryLabel}"`);
        await page.getByRole("button", { name: "New server" }).first().click();
        await page.getByRole("heading", { name: "New server" }).waitFor({ timeout: 10000 });
        await page.waitForTimeout(250);
        await shot(page, outDir, `new-server-overlay-${scheme}-${size.name}`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(250);
      }

      if (errors.length > 0) {
        throw new Error(errors.join("\n"));
      }
      console.log(`VISUAL_BREEZE_${scheme.toUpperCase()}_OK`);
    } finally {
      if (app !== null) {
        await quitElectronApp(app);
      }
      removeFixtureDir(profileDir);
    }
  }

  console.log("VISUAL_PLASMA_BREEZE_DIR=" + outDir);
  console.log("VISUAL_PLASMA_BREEZE_OK");
}

run().catch((error) => {
  console.error("VISUAL_PLASMA_BREEZE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
