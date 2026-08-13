/**
 * Clusters page visual + navigation review — docs/visual-testing.md
 * Usage: npm run build && node scripts/visual-clusters.cjs
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

async function measureClusters(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const pageRoot = document.querySelector("[data-clusters-page]");
    const layout = pageRoot?.querySelector("[class*='layout']") ?? null;
    const detail = document.querySelector("[data-cluster-detail]");
    const empty = pageRoot?.textContent?.includes("No clusters configured") === true;
    const navClusters = Array.from(document.querySelectorAll("button")).find((el) =>
      (el.textContent ?? "").trim() === "Clusters",
    );
    const main = document.querySelector(".mantine-AppShell-main") ?? document.querySelector("main");
    const pageRect = pageRoot?.getBoundingClientRect();
    const layoutStyle = layout ? getComputedStyle(layout) : null;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      pageVisible: pageRoot !== null && (pageRect?.width ?? 0) > 0,
      empty,
      hasDetail: detail !== null,
      layoutColumns: layoutStyle?.gridTemplateColumns ?? null,
      sidebarHasClusters: navClusters !== undefined,
      mainScrollHeight: main?.scrollHeight ?? null,
      mainClientHeight: main?.clientHeight ?? null,
      canScrollMain: main !== null && main.scrollHeight > main.clientHeight + 2,
    };
  });
}

async function ensureClusterSeed(app, page, outDir) {
  await goNav(page, "Servers");
  await page.locator("[data-overview-page]").waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);

  const cards = page.locator("[data-server-card]");
  if ((await cards.count()) === 0) {
    const installDir = path.join(outDir, "visual-cluster-server");
    fs.mkdirSync(installDir, { recursive: true });
    const serverName = `Visual-Cluster-${Date.now()}`;
    await page.getByRole("button", { name: "New server" }).first().click();
    await page.getByRole("heading", { name: "New server" }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    await page.getByRole("textbox", { name: /^Name$/ }).fill(serverName);
    await page.getByRole("textbox", { name: /^Session name$/ }).fill(`Session ${serverName}`);
    await pickPathField(app, page, "Base folder", installDir);
    await page.getByLabel("Game port").fill("18777");
    await page.getByLabel("Query port").fill("38015");
    await page.getByLabel("RCON port").fill("38020");
    await page.locator("input[type='password']").last().fill("visual-test-admin");
    await page.getByRole("button", { name: "Create server" }).click();
    await page.locator("[data-server-card]").first().waitFor({ state: "visible", timeout: 15000 });
    return { seeded: true };
  }

  // Prefer opening first server and ensuring cluster fields if empty page later.
  return { seeded: false };
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-clusters");
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

    await ensureClusterSeed(app, page, outDir);

    // Navigation: Servers → Clusters should be one click from sidebar.
    await goNav(page, "Clusters");
    await page.locator("[data-clusters-page]").waitFor({ state: "visible", timeout: 15000 });
    assert.ok(
      await page.getByRole("heading", { name: "Clusters" }).first().isVisible(),
      "Clusters page title visible",
    );

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(350);
      const metrics = await measureClusters(page);
      const file = await shot(page, outDir, `clusters-${size.name}`);
      reports.push({ size: size.name, file, metrics });
      assert.equal(metrics.pageVisible, true, `${size.name}: clusters page visible`);
      assert.equal(metrics.sidebarHasClusters, true, `${size.name}: sidebar Clusters present`);
      assert.equal(
        metrics.hasHorizontalOverflow,
        false,
        `${size.name}: no horizontal overflow`,
      );
    }

    // Interaction: select first cluster card if present.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await shot(page, outDir, "clusters-after-open");

    const clusterCard = page.locator("[data-cluster-card]").first();
    if ((await clusterCard.count()) > 0) {
      await clusterCard.click();
      await page.waitForTimeout(300);
      await shot(page, outDir, "clusters-detail-selected");
      const member = page.locator("[data-cluster-detail] button").first();
      if ((await member.count()) > 0) {
        await member.click();
        await page.waitForTimeout(800);
        await shot(page, outDir, "clusters-open-member-workspace");
        // Return via sidebar for nav continuity check.
        await goNav(page, "Clusters");
        await page.locator("[data-clusters-page]").waitFor({ state: "visible", timeout: 10000 });
        await shot(page, outDir, "clusters-return-from-workspace");
      }
    } else {
      await shot(page, outDir, "clusters-empty-state");
    }

    // Cross-nav smoke: Clusters → Backups → Clusters
    await goNav(page, "Backups");
    await page.waitForTimeout(400);
    await goNav(page, "Clusters");
    await page.locator("[data-clusters-page]").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, outDir, "clusters-after-cross-nav");
  } finally {
    await app.close();
  }

  const summary = { outDir, errors, reports };
  const summaryPath = path.join(outDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
  if (errors.length > 0) {
    console.error("Console/page errors detected during visual clusters run");
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
