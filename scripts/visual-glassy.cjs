const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  launchElectronApp,
  quitElectronApp,
  removeFixtureDir,
  seedAppearance,
  waitForOverview,
} = require("./e2e-launch.cjs");

/**
 * Glassy visual sweep. Seeds an isolated profile, both schemes, and captures
 * the main routes at Full HD plus a sidebar hover.
 *
 * Usage: npm run build && node scripts/visual-glassy.cjs
 */
delete process.env.ELECTRON_RUN_AS_NODE;

const SCHEMES = ["dark", "light"];
const SIZE = { name: "full-hd", width: 1920, height: 1080 };
const ROUTES = [
  { label: "Clusters", page: "[data-clusters-page]" },
  { label: "Downloads", page: "[data-downloads-page]" },
  { label: "Backups", page: "[data-backups-page]" },
  { label: "Logs", page: "[data-logs-page]" },
  { label: "Hosted Resources", page: "[data-hosted-resources-page]" },
];

function seedServers(profileDir) {
  const dbPath = path.join(profileDir, "yark-server-manager.db");
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO servers (
      id, name, map, install_dir, enabled, session_name,
      game_port, query_port, rcon_port,
      server_password, admin_password,
      cluster_id, cluster_dir, extra_args, mods,
      disabled_mods, mod_metadata_cache, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (let i = 0; i < 2; i += 1) {
    const installDir = path.join(profileDir, "servers", `server-${i}`);
    fs.mkdirSync(installDir, { recursive: true });
    insert.run(
      `visual-glassy-${i}`,
      i === 0 ? "The Island" : "Lost Colony",
      i === 0 ? "TheIsland_WP" : "LostColony_WP",
      installDir,
      1,
      i === 0 ? "Island session" : "Colony session",
      18000 + i * 10,
      38000 + i * 10,
      39000 + i * 10,
      null,
      "admin1234",
      null,
      null,
      "[]",
      "[]",
      "[]",
      "{}",
      now,
      now,
    );
  }
  db.close();
}

async function goNav(page, label) {
  const btn = page.getByRole("button", { name: label, exact: true }).first();
  assert.ok((await btn.count()) > 0, `Sidebar entry "${label}" not found`);
  await btn.click();
  await page.waitForTimeout(250);
}

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SHOT ${file}`);
}

async function sample(page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const pick = (name) => root.getPropertyValue(name).trim();
    const card = document.querySelector("[data-server-card]");
    const cardStyle = card === null ? null : getComputedStyle(card);
    const dimmed = document.querySelector("[data-dimmed], .mantine-Text-root[data-c='dimmed'], .mantine-Text-root");
    return {
      scheme: document.documentElement.getAttribute("data-mantine-color-scheme"),
      panel: pick("--app-color-panel"),
      text: pick("--app-color-text"),
      muted: pick("--app-color-muted"),
      border: pick("--app-color-border"),
      accent: pick("--ark-blue-9"),
      bad: pick("--app-color-bad"),
      card:
        cardStyle === null
          ? null
          : {
              color: cardStyle.color,
              background: cardStyle.backgroundColor,
              border: cardStyle.borderTopColor,
            },
      firstText: dimmed === null ? null : getComputedStyle(dimmed).color,
    };
  });
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);
  const outDir = path.join(projectRoot, "artifacts", "visual-glassy");
  fs.mkdirSync(outDir, { recursive: true });
  const report = [];

  for (const scheme of SCHEMES) {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `yark-visual-glassy-${scheme}-`));
    seedAppearance(profileDir, { family: "glassy", scheme });
    seedServers(profileDir);

    let app = null;
    try {
      app = await launchElectronApp({ profileDir });
      const page = await waitForOverview(app);
      await page.setViewportSize({ width: SIZE.width, height: SIZE.height });
      await page.waitForTimeout(400);

      const mounted = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ark-blue-9").trim());
      const expected = scheme === "dark" ? "#28d4ec" : "#14786f";
      assert.equal(mounted.toLowerCase(), expected, `${scheme} accent is ${mounted}`);

      await goNav(page, "Servers");
      await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
      await page.locator("[data-server-card]").first().waitFor({ state: "visible", timeout: 15000 });
      report.push({ scheme, view: "overview", ...(await sample(page)) });
      const iconButton = await page.getByRole("button", { name: "More options" }).first().evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          border: style.borderTopColor,
          shadow: style.boxShadow,
          filter: style.backdropFilter,
        };
      });
      report.push({ scheme, view: "icon-button", ...iconButton });
      await shot(page, outDir, `overview-${scheme}`);

      await page.getByRole("button", { name: "More options" }).first().click();
      const menu = page.getByRole("menu").first();
      await menu.waitFor({ state: "visible", timeout: 5000 });
      const menuPaint = await menu.evaluate((node) => {
        const style = getComputedStyle(node);
        const card = document.querySelector("[data-server-card]");
        return {
          background: style.backgroundColor,
          card: card === null ? null : getComputedStyle(card).backgroundColor,
        };
      });
      report.push({ scheme, view: "menu", ...menuPaint });
      await shot(page, outDir, `menu-${scheme}`);
      await page.keyboard.press("Escape");
      await menu.waitFor({ state: "hidden", timeout: 5000 });

      const serversNav = page.getByRole("button", { name: "Servers", exact: true }).first();
      await serversNav.hover();
      await page.waitForTimeout(200);
      await shot(page, outDir, `overview-nav-hover-${scheme}`);

      await page.locator("[data-server-card]").first().click();
      await page.getByRole("tab", { name: "Server", exact: true }).waitFor({ timeout: 15000 });
      await page.waitForTimeout(300);
      await shot(page, outDir, `workspace-${scheme}`);
      await page.getByRole("tab", { name: "Backups", exact: true }).click();
      await page.waitForTimeout(300);
      await shot(page, outDir, `workspace-backups-${scheme}`);

      await goNav(page, "Settings");
      await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({ timeout: 10000 });
      await shot(page, outDir, `settings-${scheme}`);
      await page.getByRole("navigation", { name: "Settings categories" }).getByRole("button", { name: "Appearance" }).click();
      await page.getByRole("heading", { name: "Appearance", level: 3 }).waitFor({ timeout: 10000 });
      await shot(page, outDir, `appearance-${scheme}`);

      for (const route of ROUTES) {
        await goNav(page, route.label);
        await page.locator(route.page).waitFor({ state: "visible", timeout: 15000 });
        await page.waitForTimeout(300);
        const slug = route.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        await shot(page, outDir, `${slug}-${scheme}`);
      }

      await goNav(page, "Servers");
      await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
      await page.getByRole("button", { name: "New server" }).first().click();
      await page.getByRole("heading", { name: "New server" }).waitFor({ timeout: 10000 });
      await page.waitForTimeout(300);
      await shot(page, outDir, `new-server-${scheme}`);
      await page.keyboard.press("Escape");
    } finally {
      if (app !== null) await quitElectronApp(app);
      removeFixtureDir(profileDir);
    }
  }

  fs.writeFileSync(path.join(outDir, "samples.json"), JSON.stringify(report, null, 2));
  console.log("VISUAL_GLASSY_OK");
}

run().catch((error) => {
  console.error("VISUAL_GLASSY_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
