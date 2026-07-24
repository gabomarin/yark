/**
 * Overview visual review per docs/visual-testing.md
 * Usage: node scripts/visual-overview.cjs
 * Requires: prior npm run build.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "wide-1600", width: 1600, height: 900 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

async function waitForOverviewLayoutReady(page) {
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-overview-content]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-server-list]").waitFor({ state: "visible", timeout: 10000 });

  await page.waitForFunction(() => {
    const overview = document.querySelector("[data-overview-page]");
    const content = document.querySelector("[data-overview-content]");
    const servers = document.querySelector("[data-server-list]");
    if (!overview || !content || !servers) {
      return false;
    }

    const overviewRect = overview.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const serversRect = servers.getBoundingClientRect();
    const style = getComputedStyle(content);

    return (
      document.readyState === "complete" &&
      overviewRect.width > 0 &&
      contentRect.width > 0 &&
      serversRect.width > 0 &&
      style.display.length > 0
    );
  }, { timeout: 10000 });
}

async function measureOverview(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const overview = document.querySelector("[data-overview-page]");
    const content = document.querySelector("[data-overview-content]");
    const servers = document.querySelector("[data-server-list]");
    const activity = document.querySelector("[data-recent-activity]");
    const main = document.querySelector(".mantine-AppShell-main") ?? document.querySelector("main");

    const style = content ? getComputedStyle(content) : null;
    const overviewRect = overview?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const serversRect = servers?.getBoundingClientRect();
    const activityRect = activity?.getBoundingClientRect();

    const sideBySide =
      serversRect !== undefined &&
      activityRect !== undefined &&
      Math.abs(serversRect.top - activityRect.top) < 48 &&
      activityRect.left > serversRect.right - 8;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
      clientWidth: root.clientWidth,
      hasHorizontalOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      overviewWidth: overviewRect?.width ?? null,
      contentDisplay: style?.display ?? null,
      contentColumns: style?.gridTemplateColumns ?? null,
      serversWidth: serversRect?.width ?? null,
      activityWidth: activityRect?.width ?? null,
      sideBySide,
      mainScrollTop: main?.scrollTop ?? 0,
      canScrollMain: main !== null && main.scrollHeight > main.clientHeight + 2,
    };
  });
}

async function wheelScroll(page) {
  const main = page.locator(".mantine-AppShell-main").first();
  if ((await main.count()) === 0) return { scrolled: false };
  const before = await main.evaluate((el) => el.scrollTop);
  await main.hover();
  await page.mouse.wheel(0, 480);
  await page.waitForFunction(
    (prev) => {
      const el = document.querySelector(".mantine-AppShell-main");
      return el !== null && el.scrollTop !== prev;
    },
    before,
    { timeout: 2000 },
  ).catch(() => undefined);
  const after = await main.evaluate((el) => el.scrollTop);
  return { scrolled: after !== before, before, after };
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-overview");
  fs.mkdirSync(outDir, { recursive: true });

  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
  });

  const errors = [];
  const reports = [];

  try {
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("heading", { name: "Servers", level: 1 }).waitFor({
      timeout: 20000,
    });

    // Ensure Overview / Servers route.
    const serversNav = page.getByRole("button", { name: "Servers" });
    if ((await serversNav.count()) > 0) {
      await serversNav.first().click();
    }
    await page.locator("[data-overview-page]").waitFor({ timeout: 10000 });
    await waitForOverviewLayoutReady(page);

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await waitForOverviewLayoutReady(page);

      const metrics = await measureOverview(page);
      const shot = path.join(outDir, `overview-${size.name}.png`);
      await page.screenshot({ path: shot, fullPage: false });

      let scroll = { scrolled: false };
      if (metrics.canScrollMain) {
        scroll = await wheelScroll(page);
        await page.screenshot({
          path: path.join(outDir, `overview-${size.name}-scrolled.png`),
          fullPage: false,
        });
        // Scroll back to top for the next resolution.
        await page.locator(".mantine-AppShell-main").first().evaluate((el) => {
          el.scrollTop = 0;
        });
      }

      const expectSideBySide = size.width >= 1600;
      reports.push({
        size: size.name,
        viewport: `${size.width}x${size.height}`,
        metrics,
        scroll,
        screenshot: shot,
        expectSideBySide,
        sideBySideOk: expectSideBySide ? metrics.sideBySide === true : metrics.sideBySide !== true,
        overflowOk: metrics.hasHorizontalOverflow !== true,
      });
    }

    console.log("VISUAL_OVERVIEW_DIR=" + outDir);
    for (const report of reports) {
      console.log(
        JSON.stringify(
          {
            size: report.size,
            viewport: report.viewport,
            overviewWidth: report.metrics.overviewWidth,
            contentDisplay: report.metrics.contentDisplay,
            sideBySide: report.metrics.sideBySide,
            sideBySideOk: report.sideBySideOk,
            overflowOk: report.overflowOk,
            serversWidth: report.metrics.serversWidth,
            activityWidth: report.metrics.activityWidth,
            wheelScroll: report.scroll,
            screenshot: report.screenshot,
          },
          null,
          0,
        ),
      );
    }

    for (const report of reports) {
      assert.equal(
        report.overflowOk,
        true,
        `Overflow horizontal en ${report.viewport}`,
      );
      assert.equal(
        report.sideBySideOk,
        true,
        `Layout paralelo inesperado en ${report.viewport}: sideBySide=${report.metrics.sideBySide}`,
      );
    }

    // On QHD, content should clearly grow past the old 1680 cap.
    const qhd = reports.find((r) => r.size === "qhd-2k");
    assert.ok(qhd, "Falta reporte qhd-2k");
    assert.ok(
      (qhd.metrics.overviewWidth ?? 0) >= 1900,
      `Overview demasiado estrecho en 2K: ${qhd.metrics.overviewWidth}`,
    );

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }

    console.log("VISUAL_OVERVIEW_OK");
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("VISUAL_OVERVIEW_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
