const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  createE2eFixtureRoots,
  initProfileDatabase,
  launchElectronApp,
  quitElectronApp,
  removeFixtureDir,
  seedAppearance,
  waitForOverview,
} = require("./e2e-launch.cjs");
const { assertFamilyMounted } = require("./visual-family-tokens.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

/**
 * Workspace tab coverage - docs/visual-testing.md
 *
 * The nine workspace tabs had no helper at all, which is how the footer/short-viewport class of
 * bug (content sizing itself against the viewport instead of the shell's content box) reached
 * the operator twice. Every tab is captured at HD and Full HD, and each one asserts the
 * contract that broke: the shell's content box must not overflow, because the tabs scroll
 * inside their own panes.
 *
 * Usage: npm run build && node scripts/visual-workspace-tabs.cjs
 *        YARK_VISUAL_THEME=light node scripts/visual-workspace-tabs.cjs
 *
 * Runs dark by default. `YARK_VISUAL_THEME=light` seeds the light theme and asserts the mounted
 * scheme, so the same contract covers both themes without a second helper: the light shell has
 * no grain, which leaves elevation and hairlines to do all the separation work.
 */

const THEME = process.env.YARK_VISUAL_THEME === "light" ? "light" : "dark";
const THEME_LABEL = THEME;
/** The product default is Compact, so the walk covers it unless asked otherwise. */
const DENSITY = process.env.YARK_VISUAL_DENSITY === "comfortable" ? "comfortable" : "compact";
/** Family axis (#PUX-005-B): default Fluent, or the Plasma Breeze family. */
const FAMILY = process.env.YARK_VISUAL_FAMILY === "plasma-breeze" ? "plasma-breeze" : "fluent";

const TABS = ["Server", "INI Files", "Mods", "Launch", "Backups", "Logs", "RCON", "Maintenance", "Ark Server API"];

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
];

const INI = ["[ServerSettings]", "ServerAdminPassword=admin1234", "RCONEnabled=True", "MaxPlayers=20", ""].join("\n");

function seedProfile(profileDir) {
  const dbPath = path.join(profileDir, "yark-server-manager.db");
  initProfileDatabase(dbPath);
  const installDir = path.join(profileDir, "server-install");
  const iniDir = path.join(installDir, "ShooterGame", "Saved", "Config", "WindowsServer");
  fs.mkdirSync(iniDir, { recursive: true });
  fs.writeFileSync(path.join(iniDir, "GameUserSettings.ini"), INI);
  fs.writeFileSync(path.join(iniDir, "Game.ini"), "[ServerSettings]\n");

  seedAppearance(profileDir, { family: FAMILY, scheme: THEME });
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  // Stored as the bare value, not JSON: that is how the density pref is written and read.
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run("uiDensity", DENSITY, now);
  db.prepare("DELETE FROM servers").run();
  db.prepare(
    `INSERT INTO servers (id, name, map, install_dir, enabled, session_name, game_port, query_port, rcon_port,
       server_password, admin_password, cluster_id, cluster_dir, extra_args, mods, disabled_mods,
       mod_metadata_cache, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "visual-workspace-1",
    "Visual Workspace",
    "TheIsland_WP",
    installDir,
    1,
    "Session Visual",
    19200,
    39200,
    40200,
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
  db.close();
  return installDir;
}

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/**
 * The contract every tab has to hold: the tab panel is visible, nothing overflows sideways, and
 * the shell's content box does not scroll - the pane inside it does. A view that sizes itself
 * against the viewport breaks the last one, which is exactly what put content under the
 * SteamCMD footer.
 */
function measureTab() {
  const root = document.documentElement;
  const body = document.body;
  const mainBody = document.querySelector('[class*="mainBody"]');
  // The tab strip is the app's own (no Mantine Tabs.Panel / role="tabpanel"), but the pane that
  // holds the active tab is a documented hook.
  const pane = document.querySelector("[data-workspace-scroll]");
  const rect = pane?.getBoundingClientRect() ?? null;
  const footer = document.querySelector("[data-downloads-footer]");
  const fr = footer?.getBoundingClientRect() ?? null;

  let occluded = 0;
  if (footer !== null && fr !== null) {
    const visibleRect = (el) => {
      let r = el.getBoundingClientRect();
      let n = el.parentElement;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") {
          const p = n.getBoundingClientRect();
          r = {
            left: Math.max(r.left, p.left),
            right: Math.min(r.right, p.right),
            top: Math.max(r.top, p.top),
            bottom: Math.min(r.bottom, p.bottom),
          };
        }
        n = n.parentElement;
      }
      return r.right - r.left > 0 && r.bottom - r.top > 0 ? r : null;
    };
    for (const el of document.querySelectorAll("button, input, [role='tab']")) {
      if (footer.contains(el)) continue;
      const visible = visibleRect(el);
      if (visible === null) continue;
      if (!(visible.bottom > fr.top && visible.top < fr.bottom && visible.right > fr.left && visible.left < fr.right)) {
        continue;
      }
      const top = document.elementFromPoint(
        Math.round(visible.left + (visible.right - visible.left) / 2),
        Math.max(0, Math.min(window.innerHeight - 1, Math.round(visible.top + 4))),
      );
      if (top !== null && footer.contains(top)) {
        occluded += 1;
      }
    }
  }

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    paneVisible: rect !== null && rect.width > 0 && rect.height > 0,
    hasHorizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
    contentOverflows: mainBody !== null && mainBody.scrollHeight > mainBody.clientHeight + 4,
    contentBoxHeight: mainBody === null ? null : Math.round(mainBody.getBoundingClientRect().height),
    footerPresent: footer !== null,
    // Only meaningful with an active file job; without one the footer is not mounted.
    occludedControls: occluded,
  };
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const { profileDir } = createE2eFixtureRoots("visual-workspace-tabs");
  seedProfile(profileDir);
  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-workspace-tabs", `${FAMILY}-${THEME}-${DENSITY}`);
  fs.mkdirSync(outDir, { recursive: true });

  const app = await launchElectronApp({ profileDir });
  const errors = [];
  const reports = [];

  try {
    const page = await waitForOverview(app);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    const mounted = await assertFamilyMounted(page, FAMILY);
    console.log(`VISUAL_WORKSPACE_TABS_FAMILY=${FAMILY} accent=${mounted.accent}`);

    await page.locator("[data-server-card]").first().click();
    await page.getByRole("tab", { name: "Server", exact: true }).waitFor({ state: "visible", timeout: 20000 });

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(300);

      for (const tab of TABS) {
        const label = tab.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        await page.getByRole("tab", { name: tab, exact: true }).first().click();
        await page.waitForTimeout(650);

        const metrics = await page.evaluate(measureTab);
        const mountedScheme = await page.evaluate(() =>
          document.documentElement.getAttribute("data-mantine-color-scheme"),
        );
        metrics.mountedScheme = mountedScheme;
        const file = await shot(page, outDir, `workspace-${label}-${FAMILY}-${THEME_LABEL}-${DENSITY}-${size.name}`);
        reports.push({ tab, family: FAMILY, theme: THEME, density: DENSITY, size: size.name, file, metrics });

        assert.equal(
          metrics.mountedScheme,
          THEME,
          `${size.name} / ${tab}: the ${THEME} scheme is the one that mounted`,
        );

        assert.equal(
          await page.getByRole("tab", { name: tab, exact: true }).first().getAttribute("aria-selected"),
          "true",
          `${size.name} / ${tab}: tab selected`,
        );
        assert.equal(metrics.paneVisible, true, `${size.name} / ${tab}: tab pane visible`);
        assert.equal(metrics.hasHorizontalOverflow, false, `${size.name} / ${tab}: no horizontal overflow`);
        assert.equal(
          metrics.contentOverflows,
          false,
          `${size.name} / ${tab}: the content box must not scroll - a view sized against the ` +
            `viewport instead of the shell content box puts its bottom under the footer`,
        );
        assert.equal(metrics.occludedControls, 0, `${size.name} / ${tab}: no control covered by the footer`);
      }
    }
  } finally {
    await quitElectronApp(app);
    removeFixtureDir(profileDir);
  }

  const summary = { outDir, family: FAMILY, theme: THEME, density: DENSITY, errors, reports };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(
    JSON.stringify({ outDir, family: FAMILY, theme: THEME, density: DENSITY, tabs: reports.length, errors }, null, 2),
  );
  assert.equal(errors.length, 0, `console/page errors during the run: ${errors.slice(0, 3).join(" | ")}`);
  console.log(THEME === "light" ? "VISUAL_WORKSPACE_TABS_LIGHT_OK" : "VISUAL_WORKSPACE_TABS_OK");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
