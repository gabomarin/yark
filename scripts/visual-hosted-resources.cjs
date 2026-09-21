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
  waitForOverview,
} = require("./e2e-launch.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

/**
 * Hosted Resources page coverage - docs/visual-testing.md
 *
 * The other page PUX-004 listed as having no helper. Like the workspace tabs, its failure shape
 * is the viewport one: the page is `fillViewport`, so if it sized itself against the window the
 * shell content box would overflow and the SteamCMD footer would sit on top of it.
 *
 * It captures the page in its shipped state and deliberately does not touch the enable toggle:
 * switching it on binds a listener, and a visual run should not open ports.
 *
 * Usage: npm run build && node scripts/visual-hosted-resources.cjs
 */

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
];

function seedProfile(profileDir) {
  const dbPath = path.join(profileDir, "yark-server-manager.db");
  initProfileDatabase(dbPath);
  const installDir = path.join(profileDir, "server-install");
  const iniDir = path.join(installDir, "ShooterGame", "Saved", "Config", "WindowsServer");
  fs.mkdirSync(iniDir, { recursive: true });
  fs.writeFileSync(path.join(iniDir, "GameUserSettings.ini"), "[ServerSettings]\nServerAdminPassword=admin1234\n");
  fs.writeFileSync(path.join(iniDir, "Game.ini"), "[ServerSettings]\n");

  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run("appearance.v1", JSON.stringify({ theme: "dark", panels: "auto" }), now);
  db.prepare("DELETE FROM servers").run();
  db.prepare(
    `INSERT INTO servers (id, name, map, install_dir, enabled, session_name, game_port, query_port, rcon_port,
       server_password, admin_password, cluster_id, cluster_dir, extra_args, mods, disabled_mods,
       mod_metadata_cache, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "visual-hosted-1",
    "Visual Hosted",
    "TheIsland_WP",
    installDir,
    1,
    "Session Hosted",
    19300,
    39300,
    40300,
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
}

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/** Same contract as the workspace tabs: the content box must not scroll; the page scrolls inside. */
function measurePage() {
  const root = document.documentElement;
  const body = document.body;
  const mainBody = document.querySelector('[class*="mainBody"]');
  const pageRoot = document.querySelector("[data-hosted-resources-page]");
  const status = document.querySelector("[data-hosted-resources-status]");
  const diagnostics = document.querySelector("[data-hosted-resources-diagnostics]");
  const rect = pageRoot?.getBoundingClientRect() ?? null;
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
    for (const el of document.querySelectorAll("button, input, [role='switch']")) {
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
    pageVisible: rect !== null && rect.width > 0 && rect.height > 0,
    hasStatus: status !== null,
    hasDiagnostics: diagnostics !== null,
    hasHorizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
    contentOverflows: mainBody !== null && mainBody.scrollHeight > mainBody.clientHeight + 4,
    footerPresent: footer !== null,
    occludedControls: occluded,
  };
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const { profileDir } = createE2eFixtureRoots("visual-hosted-resources");
  seedProfile(profileDir);
  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-hosted-resources");
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

    await page
      .getByRole("button", { name: /Hosted Resources/i })
      .first()
      .click();
    await page.locator("[data-hosted-resources-page]").waitFor({ state: "visible", timeout: 20000 });

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(400);

      const metrics = await page.evaluate(measurePage);
      const file = await shot(page, outDir, `hosted-resources-${size.name}`);
      reports.push({ size: size.name, file, metrics });

      assert.equal(metrics.pageVisible, true, `${size.name}: page visible`);
      assert.equal(metrics.hasStatus, true, `${size.name}: status card present`);
      assert.equal(metrics.hasDiagnostics, true, `${size.name}: diagnostics panel present`);
      assert.equal(metrics.hasHorizontalOverflow, false, `${size.name}: no horizontal overflow`);
      assert.equal(
        metrics.contentOverflows,
        false,
        `${size.name}: the content box must not scroll - this page is fillViewport, so sizing it ` +
          `against the viewport puts its bottom under the footer`,
      );
      assert.equal(metrics.occludedControls, 0, `${size.name}: no control covered by the footer`);
    }
  } finally {
    await quitElectronApp(app);
    removeFixtureDir(profileDir);
  }

  const summary = { outDir, errors, reports };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify({ outDir, sizes: reports.length, errors }, null, 2));
  assert.equal(errors.length, 0, `console/page errors during the run: ${errors.slice(0, 3).join(" | ")}`);
  console.log("VISUAL_HOSTED_RESOURCES_OK");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
