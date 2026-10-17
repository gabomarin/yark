const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  launchElectronApp,
  quitElectronApp,
  removeFixtureDir,
  seedAppearance,
  waitForOverview,
} = require("./e2e-launch.cjs");
const { assertFamilyMounted } = require("./visual-family-tokens.cjs");

/**
 * Glassy visual review (#PUX-005-A) - docs/visual-testing.md
 * Usage: npm run build && node scripts/visual-glassy.cjs
 *
 * Seeds `appearance.v1` with the glassy family in an isolated profile, for both
 * schemes, then asserts the cyan accent, dark-ink Glassy Dark primary, chrome
 * material tokens, and captures Overview, Settings, Appearance, sidebar routes
 * and the New server overlay at HD / Full HD / QHD. Workspace tabs run with
 * `YARK_VISUAL_FAMILY=glassy node scripts/visual-workspace-tabs.cjs`.
 */
delete process.env.ELECTRON_RUN_AS_NODE;

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

const SCHEMES = ["dark", "light"];

const ROUTES = [
  { label: "Clusters", page: "[data-clusters-page]" },
  { label: "Downloads", page: "[data-downloads-page]" },
  { label: "Backups", page: "[data-backups-page]" },
  { label: "Logs", page: "[data-logs-page]" },
  { label: "Hosted Resources", page: "[data-hosted-resources-page]" },
];

const PRIMARY = {
  dark: { color: "rgb(7, 26, 40)", background: "rgb(75, 168, 232)" },
  light: { color: "rgb(255, 255, 255)", background: "rgb(23, 111, 179)" },
};

function collectWindowErrors(app, errors) {
  const attach = (page) => {
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  };

  app.on("window", attach);
  for (const page of app.windows()) {
    attach(page);
  }
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

  const outDir = path.join(projectRoot, "artifacts", "visual-glassy");
  fs.mkdirSync(outDir, { recursive: true });

  for (const scheme of SCHEMES) {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `yark-visual-glassy-${scheme}-`));
    seedAppearance(profileDir, { family: "glassy", scheme });

    let app = null;
    const errors = [];
    try {
      app = await launchElectronApp({ profileDir });
      collectWindowErrors(app, errors);
      const page = await waitForOverview(app);
      const mounted = await assertFamilyMounted(page, "glassy");

      const mountedScheme = await page.evaluate(() =>
        document.documentElement.getAttribute("data-mantine-color-scheme"),
      );
      assert.equal(mountedScheme, scheme, `Mantine scheme attribute is not ${scheme}`);
      console.log(
        `VISUAL_GLASSY_SCHEME=${scheme} accent=${mounted.accent} font=${mounted.font} panel=${mounted.panel}`,
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
        const glassySelected = await page.getByRole("radio", { name: "Glassy", exact: true }).isChecked();
        assert.equal(glassySelected, true, `${scheme} / ${size.name}: Glassy is not the selected family`);
        const schemeLabel = scheme === "dark" ? "Glassy Dark" : "Glassy Light";
        const schemeSelected = await page.getByRole("radio", { name: schemeLabel, exact: true }).isChecked();
        assert.equal(schemeSelected, true, `${scheme} / ${size.name}: ${schemeLabel} is not the selected scheme`);
        await shot(page, outDir, `appearance-${scheme}-${size.name}`);

        for (const route of ROUTES) {
          await goNav(page, route.label);
          await page.locator(route.page).waitFor({ state: "visible", timeout: 15000 });
          await page.waitForTimeout(250);
          const slug = route.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          await shot(page, outDir, `${slug}-${scheme}-${size.name}`);
        }

        await goNav(page, "Servers");
        await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
        const expectedPrimary = PRIMARY[scheme];
        const primaryStyle = await page
          .getByRole("button", { name: "New server" })
          .first()
          .evaluate((el) => ({ color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
        assert.equal(
          primaryStyle.color,
          expectedPrimary.color,
          `${scheme} / ${size.name}: primary label is "${primaryStyle.color}"`,
        );
        assert.equal(
          primaryStyle.background,
          expectedPrimary.background,
          `${scheme} / ${size.name}: primary fill is "${primaryStyle.background}"`,
        );
        await page.getByRole("button", { name: "New server" }).first().click();
        await page.getByRole("heading", { name: "New server" }).waitFor({ timeout: 10000 });
        await page.waitForTimeout(250);
        await shot(page, outDir, `new-server-overlay-${scheme}-${size.name}`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(250);
      }

      await page.setViewportSize({ width: 2560, height: 1440 });
      await goNav(page, "Settings");
      await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({ timeout: 10000 });
      await page
        .getByRole("navigation", { name: "Settings categories" })
        .getByRole("button", { name: "General" })
        .click();
      await page.getByRole("button", { name: "Open setup assistant" }).click();
      await page.locator('[data-setup-wizard-step="welcome"]').waitFor({ timeout: 10000 });
      await shot(page, outDir, `setup-assistant-${scheme}-qhd-2k`);

      if (errors.length > 0) {
        throw new Error(errors.join("\n"));
      }
      console.log(`VISUAL_GLASSY_${scheme.toUpperCase()}_OK`);
    } finally {
      if (app !== null) {
        await quitElectronApp(app);
      }
      removeFixtureDir(profileDir);
    }
  }

  console.log("VISUAL_GLASSY_DIR=" + outDir);
  console.log("VISUAL_GLASSY_OK");
}

run().catch((error) => {
  console.error("VISUAL_GLASSY_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
