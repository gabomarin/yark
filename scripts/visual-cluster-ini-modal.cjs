/**
 * Cluster INI modal: pinned footer + full-height text editor.
 * Usage: npm run build && node scripts/visual-cluster-ini-modal.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

async function openClusterIniModal(page) {
  await page.getByRole("button", { name: "Clusters" }).first().click();
  await page.locator("[data-clusters-page]").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(300);

  const detail = page.locator("[data-cluster-detail]");
  if ((await detail.count()) === 0) {
    const card = page.locator("[data-cluster-card]").first();
    if ((await card.count()) > 0) {
      await card.click();
      await page.waitForTimeout(300);
    }
  }

  const btn = page.getByRole("button", {
    name: /Create INI template|Edit INI template/i,
  });
  assert.ok((await btn.count()) > 0, "cluster INI template button present");
  await btn.first().click();
  await page.locator("[data-cluster-ini-footer]").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-ini-editor-nav]").waitFor({ state: "visible", timeout: 10000 });
}

async function measure(page) {
  return page.evaluate(() => {
    const footer = document.querySelector("[data-cluster-ini-footer]");
    const shell = document.querySelector("[data-cluster-ini-shell]");
    const editor = document.querySelector("[data-cluster-ini-editor]");
    const raw = document.querySelector("[data-cluster-ini-raw]");
    const textarea = raw?.querySelector("textarea");
    const footerRect = footer?.getBoundingClientRect();
    const shellRect = shell?.getBoundingClientRect();
    const editorRect = editor?.getBoundingClientRect();
    const taRect = textarea?.getBoundingClientRect();
    const vh = window.innerHeight;

    return {
      footerFound: footer !== null,
      footerVisible:
        footerRect !== undefined &&
        footerRect.top >= 0 &&
        footerRect.bottom <= vh + 1 &&
        footerRect.height > 20,
      footerBottom: footerRect?.bottom ?? null,
      shellBottom: shellRect?.bottom ?? null,
      editorHeight: editorRect?.height ?? null,
      textareaHeight: taRect?.height ?? null,
      mode: raw ? "raw" : "visual",
    };
  });
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);
  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-cluster-ini-modal");
  fs.mkdirSync(outDir, { recursive: true });

  const app = await electron.launch({ args: ["."], cwd: projectRoot });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.setViewportSize({ width: 1280, height: 720 });
    await openClusterIniModal(page);
    await page.waitForTimeout(500);

    const visual = await measure(page);
    console.log(JSON.stringify({ phase: "visual", ...visual }));
    assert.equal(visual.footerFound, true, "footer in DOM");
    assert.equal(visual.footerVisible, true, "footer visible in viewport");
    assert.ok((visual.editorHeight ?? 0) > 200, "editor region has height");
    await page.screenshot({
      path: path.join(outDir, "cluster-ini-visual.png"),
      fullPage: false,
    });

    await page.getByRole("radio", { name: "Text" }).click().catch(async () => {
      await page.locator("[data-ini-editor-nav]").getByText("Text", { exact: true }).click();
    });
    await page.locator("[data-cluster-ini-raw]").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(300);

    const raw = await measure(page);
    console.log(JSON.stringify({ phase: "raw", ...raw }));
    assert.equal(raw.footerVisible, true, "footer still visible in text mode");
    assert.ok((raw.textareaHeight ?? 0) >= 280, `textarea tall enough, got ${raw.textareaHeight}`);
    await page.screenshot({
      path: path.join(outDir, "cluster-ini-text.png"),
      fullPage: false,
    });

    console.log("VISUAL_CLUSTER_INI_MODAL_OK dir=" + outDir);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("VISUAL_CLUSTER_INI_MODAL_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
