/**
 * INI settings table: min-width + horizontal scroll, no desc/restore overlap.
 * Usage: npm run build && node scripts/visual-ini-table-scroll.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const sizes = [
  { name: "compact", width: 1100, height: 720 },
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
];

async function measure(page) {
  return page.evaluate(() => {
    const scrollBody = document.querySelector("[data-ini-settings-scroll]");
    const tableWrap = scrollBody?.parentElement ?? null;
    if (!tableWrap) return { found: false };

    const head = tableWrap.firstElementChild;
    const rows = Array.from(scrollBody.querySelectorAll(":scope > div > div")).filter((el) => {
      return (
        getComputedStyle(el).display === "grid" &&
        el.children.length >= 4 &&
        !(el.textContent ?? "").includes("SETTING")
      );
    });
    // Rows are nested: sectionBlock > button + row divs
    const sampleRows = Array.from(scrollBody.querySelectorAll("div")).filter((el) => {
      if (getComputedStyle(el).display !== "grid" || el.children.length < 4) return false;
      const hasAction = el.querySelector("button") !== null;
      const hasText = (el.textContent ?? "").length > 8;
      return hasAction && hasText;
    });
    const sample = sampleRows[0] ?? null;

    let overlap = false;
    let gap = null;
    if (sample) {
      const desc = sample.children[2].getBoundingClientRect();
      const action = sample.children[3].getBoundingClientRect();
      gap = action.left - desc.right;
      overlap = desc.right > action.left + 1;
    }

    return {
      found: true,
      clientWidth: tableWrap.clientWidth,
      scrollWidth: tableWrap.scrollWidth,
      canScrollX: tableWrap.scrollWidth > tableWrap.clientWidth + 1,
      overlap,
      gap,
      sampleCount: sampleRows.length,
      rowMinWidth: sample ? getComputedStyle(sample).minWidth : null,
      headMinWidth: head ? getComputedStyle(head).minWidth : null,
      bodyMinWidth: getComputedStyle(scrollBody).minWidth,
    };
  });
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-ini-table-scroll");
  fs.mkdirSync(outDir, { recursive: true });

  const app = await electron.launch({ args: ["."], cwd: projectRoot });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("button", { name: "Servers" }).first().click();
    await page
      .locator("[data-server-card]")
      .first()
      .getByRole("button", { name: /Open settings/i })
      .click();
    await page.waitForTimeout(400);
    await page.getByRole("tab", { name: "INI Files" }).click();
    await page.waitForTimeout(600);

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(300);
      const m = await measure(page);
      console.log(JSON.stringify({ size: size.name, ...m }));
      assert.equal(m.found, true, `${size.name}: table found`);
      assert.ok(m.sampleCount > 0, `${size.name}: sample rows`);
      assert.equal(m.overlap, false, `${size.name}: description must not overlap restore`);
      assert.equal(m.rowMinWidth, "720px", `${size.name}: row min-width 720px`);
      assert.equal(m.headMinWidth, "720px", `${size.name}: head min-width 720px`);
      assert.equal(m.bodyMinWidth, "720px", `${size.name}: body min-width 720px`);
      if (m.clientWidth < 720) {
        assert.equal(m.canScrollX, true, `${size.name}: horizontal scroll when narrow`);
      }
      await page.screenshot({
        path: path.join(outDir, `ini-table-${size.name}.png`),
        fullPage: false,
      });
    }

    // Force a very narrow content check by shrinking viewport further
    await page.setViewportSize({ width: 900, height: 720 });
    await page.waitForTimeout(300);
    const narrow = await measure(page);
    console.log(JSON.stringify({ size: "900", ...narrow }));
    assert.equal(narrow.found, true, "900: table found");
    assert.equal(narrow.overlap, false, "900: no overlap");
    assert.ok(
      narrow.canScrollX || narrow.clientWidth >= 720,
      "900: scroll X when wrap under 720",
    );
    if (narrow.canScrollX) {
      await page.evaluate(() => {
        const body = document.querySelector("[data-ini-settings-scroll]");
        const wrap = body?.parentElement;
        if (wrap) wrap.scrollLeft = Math.min(200, wrap.scrollWidth - wrap.clientWidth);
      });
      await page.screenshot({
        path: path.join(outDir, "ini-table-900-scrolled.png"),
        fullPage: false,
      });
    }

    console.log("VISUAL_INI_TABLE_SCROLL_OK dir=" + outDir);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("VISUAL_INI_TABLE_SCROLL_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
