/**
 * INI editor nav (file + Visual/Text) alignment + selected color —
 * docs/visual-testing.md
 * Usage: npm run build && node scripts/visual-ini-editor-nav.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { pickPathField } = require("./e2e-launch.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

/** INI nav uses the same compact Mantine segmented chrome as Overview layout grouping. */
async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function goNav(page, label) {
  const btn = page.getByRole("button", { name: label }).first();
  await btn.click();
  await page.waitForTimeout(250);
}

async function measureIniNav(page) {
  return page.evaluate(() => {
    const nav = document.querySelector("[data-ini-editor-nav]");
    if (!nav) {
      return { found: false };
    }
    const roots = Array.from(nav.querySelectorAll(".mantine-SegmentedControl-root"));
    const indicators = Array.from(
      nav.querySelectorAll(".mantine-SegmentedControl-indicator"),
    );
    const rects = roots.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, left: r.left, width: r.width };
    });
    const navRect = nav.getBoundingClientRect();
    const styles = indicators.map((el) => getComputedStyle(el).backgroundColor);
    const labelTops = Array.from(nav.querySelectorAll(".mantine-SegmentedControl-label")).map(
      (el) => el.getBoundingClientRect().top,
    );
    return {
      found: true,
      rootCount: roots.length,
      indicatorCount: indicators.length,
      rects,
      navTop: navRect.top,
      navHeight: navRect.height,
      indicatorBackgrounds: styles,
      labelTops,
      navScrollWidth: nav.scrollWidth,
      navClientWidth: nav.clientWidth,
    };
  });
}

async function ensureServer(app, page, outDir) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);

  const cards = page.locator("[data-server-card]");
  if ((await cards.count()) > 0) {
    return;
  }

  const installDir = path.join(outDir, "visual-ini-nav-server");
  fs.mkdirSync(installDir, { recursive: true });
  const serverName = `Visual-IniNav-${Date.now()}`;
  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("textbox", { name: /^Name$/ }).fill(serverName);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(`Session ${serverName}`);
  await pickPathField(app, page, "Base folder", installDir);
  await page.getByLabel("Game port").fill("18778");
  await page.getByLabel("Query port").fill("38016");
  await page.getByLabel("RCON port").fill("38021");
  await page.locator("input[type='password']").last().fill("visual-test-admin");
  await page.getByRole("button", { name: "Create server" }).click();
  await page.locator("[data-server-card]").first().waitFor({ state: "visible", timeout: 15000 });
}

async function openWorkspaceIni(page) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ timeout: 15000 });
  await page.locator("[data-server-card]").first().getByRole("button", { name: /Open settings/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: "INI Files" }).click();
  await page.waitForTimeout(400);
  await page.locator("[data-ini-editor-nav]").waitFor({ state: "visible", timeout: 15000 });
}

async function assertNavOk(metrics, sizeName) {
  assert.equal(metrics.found, true, `${sizeName}: ini nav present`);
  assert.equal(metrics.rootCount, 2, `${sizeName}: file + mode segmenteds`);
  assert.ok(metrics.rects.length === 2, `${sizeName}: two segmented rects`);

  const [fileSeg, modeSeg] = metrics.rects;
  const topDelta = Math.abs(fileSeg.top - modeSeg.top);
  const heightDelta = Math.abs(fileSeg.height - modeSeg.height);
  assert.ok(
    topDelta <= 2,
    `${sizeName}: segmented tops aligned (delta=${topDelta.toFixed(2)})`,
  );
  assert.ok(
    heightDelta <= 2,
    `${sizeName}: segmented heights match (delta=${heightDelta.toFixed(2)})`,
  );
  assert.ok(
    modeSeg.left >= fileSeg.left + fileSeg.width - 1,
    `${sizeName}: mode control sits to the right of file control`,
  );
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-ini-editor-nav");
  fs.mkdirSync(outDir, { recursive: true });

  const app = await electron.launch({ args: ["."], cwd: projectRoot });
  const errors = [];
  const reports = [];

  try {
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.waitForLoadState("domcontentloaded");
    await page.locator("[data-overview-page], [data-clusters-page]").first().waitFor({
      timeout: 20000,
    }).catch(() => undefined);

    await ensureServer(app, page, outDir);
    await openWorkspaceIni(page);

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(350);
      const metrics = await measureIniNav(page);
      await assertNavOk(metrics, size.name);
      const file = await shot(page, outDir, `workspace-ini-${size.name}`);
      reports.push({ context: "workspace", size: size.name, file, metrics });
    }

    // Cluster template modal (same shared nav), if Clusters UI is available.
    await goNav(page, "Clusters");
    const clustersPage = page.locator("[data-clusters-page]");
    if (await clustersPage.isVisible().catch(() => false)) {
      await page.waitForTimeout(300);
      const detail = page.locator("[data-cluster-detail]");
      const createOrEdit = page.getByRole("button", {
        name: /Create INI template|Edit INI template/i,
      });
      if ((await detail.count()) === 0) {
        const card = page.locator("[data-cluster-card], [class*='ClusterCard']").first();
        if ((await card.count()) > 0) {
          await card.click();
          await page.waitForTimeout(300);
        }
      }
      if ((await createOrEdit.count()) > 0) {
        await createOrEdit.first().click();
        await page.locator("[data-ini-editor-nav]").waitFor({ state: "visible", timeout: 10000 });
        await page.getByRole("heading", { name: "Cluster INI template", exact: true }).waitFor({
          state: "visible",
          timeout: 10000,
        });

        for (const size of sizes) {
          await page.setViewportSize({ width: size.width, height: size.height });
          await page.waitForTimeout(350);
          const metrics = await measureIniNav(page);
          await assertNavOk(metrics, `cluster-${size.name}`);
          const file = await shot(page, outDir, `cluster-ini-${size.name}`);
          reports.push({ context: "cluster", size: size.name, file, metrics });
        }
      }
    }

    console.log("VISUAL_INI_NAV_DIR=" + outDir);
    for (const report of reports) {
      console.log(
        JSON.stringify(
          {
            context: report.context,
            size: report.size,
            file: report.file,
            rootCount: report.metrics.rootCount,
            tops: report.metrics.rects?.map((r) => r.top),
            heights: report.metrics.rects?.map((r) => r.height),
            indicators: report.metrics.indicatorBackgrounds,
          },
          null,
          0,
        ),
      );
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }

    console.log("VISUAL_INI_NAV_OK");
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("VISUAL_INI_NAV_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
