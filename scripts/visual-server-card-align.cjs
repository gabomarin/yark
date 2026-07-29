/**
 * Visual review: Overview server-card column alignment across install states.
 * Usage: node scripts/visual-server-card-align.cjs
 * Requires: prior npm run build, and ≥2 cards (ideally installed + not installed).
 *
 * Asserts meta column left edges stay within a small delta across cards at
 * docs/visual-testing.md viewports, and writes screenshots under os.tmpdir().
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
  { name: "qhd-2k", width: 2560, height: 1440 },
];

/** Max horizontal drift (px) between matching meta columns on different cards. */
const META_ALIGN_TOLERANCE_PX = 2;

async function waitForOverview(page) {
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-server-list]").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-server-card]").first().waitFor({ state: "visible", timeout: 15000 });
}

async function measureCardAlignment(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-server-card]")];
    return cards.map((card) => {
      const columns = [...card.querySelectorAll("[data-meta-item]")].map((el, index) => {
        const rect = el.getBoundingClientRect();
        return {
          index,
          label: el.getAttribute("data-meta-label") ?? `col-${index}`,
          left: Math.round(rect.left * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
        };
      });

      const actions = card.querySelector("[data-row-actions]");
      const actionsRect = actions?.getBoundingClientRect();

      return {
        name: card.getAttribute("data-server-name"),
        tone: card.getAttribute("data-tone"),
        reserved: {
          restart: card.querySelector("[data-restart-action][data-reserved]") !== null,
          update: card.querySelector("[data-update-action][data-reserved]") !== null,
        },
        actionsWidth: actionsRect ? Math.round(actionsRect.width * 100) / 100 : null,
        actionsLeft: actionsRect ? Math.round(actionsRect.left * 100) / 100 : null,
        metaColumns: columns,
      };
    });
  });
}

function assertMetaAligned(cards, sizeName) {
  assert.ok(cards.length >= 2, `[${sizeName}] need ≥2 server cards to compare alignment`);

  const withMeta = cards.filter((c) => c.metaColumns.length > 0);
  assert.ok(withMeta.length >= 2, `[${sizeName}] cards missing meta grid`);

  const columnCount = Math.min(...withMeta.map((c) => c.metaColumns.length));
  assert.ok(columnCount >= 3, `[${sizeName}] expected meta columns, got ${columnCount}`);

  const drifts = [];
  for (let col = 0; col < columnCount; col += 1) {
    const lefts = withMeta.map((c) => c.metaColumns[col].left);
    const min = Math.min(...lefts);
    const max = Math.max(...lefts);
    const drift = max - min;
    drifts.push({ col, drift, lefts });
    assert.ok(
      drift <= META_ALIGN_TOLERANCE_PX,
      `[${sizeName}] meta column ${col} drift ${drift.toFixed(2)}px > ${META_ALIGN_TOLERANCE_PX}px ` +
        `(cards: ${withMeta.map((c, i) => `${c.name}:${lefts[i]}`).join(", ")})`,
    );
  }

  const actionWidths = withMeta.map((c) => c.actionsWidth).filter((w) => w !== null);
  if (actionWidths.length >= 2) {
    const aMin = Math.min(...actionWidths);
    const aMax = Math.max(...actionWidths);
    assert.ok(
      aMax - aMin <= META_ALIGN_TOLERANCE_PX,
      `[${sizeName}] action row width drift ${(aMax - aMin).toFixed(2)}px ` +
        `(${withMeta.map((c) => `${c.name}:${c.actionsWidth}`).join(", ")})`,
    );
  }

  return drifts;
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-server-card-align");
  fs.mkdirSync(outDir, { recursive: true });

  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
  });

  const errors = [];
  const reports = [];

  try {
    const page = await app.firstWindow();
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.waitForLoadState("domcontentloaded");
    await waitForOverview(page);

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(250);
      await waitForOverview(page);

      const cards = await measureCardAlignment(page);
      const drifts = assertMetaAligned(cards, size.name);

      const shotPath = path.join(outDir, `overview-align-${size.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      reports.push({
        size: size.name,
        viewport: size,
        cardCount: cards.length,
        cards: cards.map((c) => ({
          name: c.name,
          tone: c.tone,
          reserved: c.reserved,
          actionsWidth: c.actionsWidth,
          metaLefts: c.metaColumns.map((m) => m.left),
        })),
        drifts,
        screenshot: shotPath,
      });
    }

    const reportPath = path.join(outDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify({ reports, errors }, null, 2));

    console.log(JSON.stringify({ ok: true, outDir, reportPath, reports }, null, 2));
    assert.equal(errors.length, 0, `page errors: ${errors.join(" | ")}`);
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
