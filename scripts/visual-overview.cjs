const { SERVER_CARD } = require("./e2e-dom-hooks.cjs");
/**
 * Overview visual review per docs/visual-testing.md (#96).
 * Captures empty / small / populated fleet fixtures, Compact + Comfortable
 * density, and install-check toolbar cohesion at HD / Full HD / QHD.
 *
 * Uses an isolated YARK_E2E_USER_DATA profile and SQLite seeds (no UI create).
 *
 * Usage: npm run build && node scripts/visual-overview.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.resolve(__dirname, "..");

/** Family axis (#PUX-005-B): default Fluent, or the Plasma Breeze family. */
const FAMILY = process.env.YARK_VISUAL_FAMILY === "plasma-breeze" ? "plasma-breeze" : "fluent";

const sizes = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

function fleetKind(count) {
  if (count <= 0) return "empty";
  if (count <= 3) return "small";
  return "populated";
}

async function launchApp(userData) {
  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env: { ...process.env, YARK_E2E_USER_DATA: userData },
  });
}

async function quitApp(app) {
  const proc = app.process();
  const exited =
    proc == null || proc.exitCode != null ? Promise.resolve() : new Promise((resolve) => proc.once("exit", resolve));
  await app.evaluate(({ app: electronApp }) => electronApp.quit());
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Electron did not quit within 20 seconds")), 20_000)),
  ]);
}

async function goNav(page, label) {
  const btn = page.getByRole("button", { name: label, exact: true }).first();
  if ((await btn.count()) > 0) {
    await btn.click();
    await page.waitForTimeout(200);
  }
}

async function waitForOverviewLayoutReady(page) {
  await goNav(page, "Servers");
  await page.getByRole("heading", { name: "Servers", level: 1 }).waitFor({
    state: "visible",
    timeout: 20000,
  });
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-overview-content]").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(300);
}

async function measureOverview(page) {
  return page.evaluate((serverCardSel) => {
    const root = document.documentElement;
    const body = document.body;
    const overview = document.querySelector("[data-overview-page]");
    const content = document.querySelector("[data-overview-content]");
    const servers = document.querySelector("[data-server-list]");
    const activity = document.querySelector("[data-recent-activity]");
    const scanStatus = document.querySelector("[data-install-health-scan]");
    const discordInvite = document.querySelector("[data-discord-invite-card]");
    const checkBtn = Array.from(document.querySelectorAll("button")).find((el) =>
      /Check Servers Health|Checking servers health/i.test(el.textContent ?? ""),
    );

    const style = content ? getComputedStyle(content) : null;
    const overviewRect = overview?.getBoundingClientRect();
    const serversRect = servers?.getBoundingClientRect();
    const activityVisible = activity !== null && getComputedStyle(activity).display !== "none";
    const activityRect = activityVisible ? activity.getBoundingClientRect() : undefined;
    const scanRect = scanStatus?.getBoundingClientRect();
    const checkRect = checkBtn?.getBoundingClientRect();
    const inviteRect = discordInvite?.getBoundingClientRect();
    const invitePosition = discordInvite ? getComputedStyle(discordInvite).position : null;

    const inviteOverlapsContent =
      inviteRect !== undefined &&
      overviewRect !== undefined &&
      content !== null &&
      (() => {
        const contentRect = content.getBoundingClientRect();
        return !(
          inviteRect.right <= contentRect.left ||
          inviteRect.left >= contentRect.right ||
          inviteRect.bottom <= contentRect.top ||
          inviteRect.top >= contentRect.bottom
        );
      })();

    const sideBySide =
      activityVisible &&
      serversRect !== undefined &&
      activityRect !== undefined &&
      Math.abs(serversRect.top - activityRect.top) < 48 &&
      activityRect.left > serversRect.right - 8;

    const scanOnButton =
      scanStatus !== null && checkBtn !== undefined && (scanStatus === checkBtn || checkBtn.contains(scanStatus));

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      overviewWidth: overviewRect?.width ?? null,
      contentDisplay: style?.display ?? null,
      serversWidth: serversRect?.width ?? null,
      activityWidth: activityRect?.width ?? null,
      sideBySide,
      cardCount: document.querySelectorAll(serverCardSel).length,
      density: root.getAttribute("data-ui-density"),
      scanVisible: scanStatus !== null,
      scanOnButton,
      scanTop: scanRect?.top ?? null,
      checkTop: checkRect?.top ?? null,
      discordInviteVisible: discordInvite !== null,
      discordInvitePosition: invitePosition,
      discordInviteOverlapsContent: inviteOverlapsContent,
    };
  }, SERVER_CARD);
}

async function setDensity(page, density) {
  await goNav(page, "Settings");
  await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({ timeout: 10000 });
  const label = density === "compact" ? "Compact" : "Comfortable";
  await page.locator("[aria-label='Display size']").getByText(label, { exact: true }).click();
  await page.waitForFunction((wanted) => document.documentElement.getAttribute("data-ui-density") === wanted, density, {
    timeout: 5000,
  });
  await waitForOverviewLayoutReady(page);
}

function seedServers(userData, count) {
  const dbPath = path.join(userData, "yark-server-manager.db");
  assert.ok(fs.existsSync(dbPath), `DB missing at ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  db.prepare("DELETE FROM servers").run();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run("appearance.v1", JSON.stringify({ themeFamily: FAMILY, scheme: "dark", panels: "auto" }), now);
  const insert = db.prepare(
    `INSERT INTO servers (
      id, name, map, install_dir, enabled, session_name,
      game_port, query_port, rcon_port,
      server_password, admin_password,
      cluster_id, cluster_dir, extra_args, mods,
      disabled_mods, mod_metadata_cache, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (let i = 0; i < count; i += 1) {
    const installDir = path.join(userData, "servers", `server-${i}`);
    fs.mkdirSync(installDir, { recursive: true });
    insert.run(
      `visual-ov-${i}`,
      `Visual Overview ${i + 1}`,
      "TheIsland_WP",
      installDir,
      1,
      `Session Visual Overview ${i + 1}`,
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

async function captureMatrix(page, outDir, prefix, reports) {
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await waitForOverviewLayoutReady(page);

    const metrics = await measureOverview(page);
    const shot = path.join(outDir, `${prefix}-${size.name}.png`);
    await page.screenshot({ path: shot, fullPage: false });

    const expectSideBySide = size.width >= 1600;
    reports.push({
      prefix,
      size: size.name,
      viewport: `${size.width}x${size.height}`,
      metrics,
      screenshot: shot,
      expectSideBySide,
      sideBySideOk: expectSideBySide ? metrics.sideBySide === true : metrics.sideBySide !== true,
      overflowOk: metrics.hasHorizontalOverflow !== true,
      fleetKind: fleetKind(metrics.cardCount),
    });
  }
}

async function withOverviewSession(userData, fn) {
  const app = await launchApp(userData);
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await page.waitForLoadState("domcontentloaded");
    await waitForOverviewLayoutReady(page);
    await fn(page, errors);
  } finally {
    await quitApp(app);
  }
}

/**
 * Overview cards are one click target. A click on the card padding (a dead zone
 * before this guard: only the name, the map thumb and the metadata block
 * responded) must open the workspace, while an inner control keeps its own click
 * and the metadata grid must stay readable to assistive tech.
 */
async function assertCardSurfaceOpensWorkspace(page) {
  const card = page.locator(SERVER_CARD).first();
  await card.waitFor({ state: "visible", timeout: 15000 });

  const metaInsideAriaHidden = await page.evaluate(() => {
    const grid = document.querySelector("[data-meta-grid]");
    return grid != null && grid.closest('[aria-hidden="true"]') != null;
  });
  assert.equal(metaInsideAriaHidden, false, "Metadata grid must not sit inside an aria-hidden hit area");

  const box = await card.boundingBox();
  assert.ok(box, "Missing card bounding box");
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height - 4);
  const target = await page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      if (el == null) return "(none)";
      const first = String(el.className ?? "").split(" ")[0];
      return `${el.tagName.toLowerCase()}${first ? "." + first : ""}`;
    },
    [x, y],
  );

  await page.mouse.click(x, y);
  // Overview stays mounted while a workspace is open, so the marker is the page
  // heading losing visibility - not `[data-overview-page]` detaching.
  await page.getByRole("heading", { name: "Servers", level: 1 }).waitFor({ state: "hidden", timeout: 10000 });
  console.log(`VISUAL_OVERVIEW_CARD_SURFACE_CLICK=workspace opened (target ${target} at ${x},${y})`);

  await waitForOverviewLayoutReady(page);
  const reopened = page.locator(SERVER_CARD).first();
  await reopened.waitFor({ state: "visible", timeout: 15000 });
  await reopened.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menu").waitFor({ state: "visible", timeout: 5000 });
  assert.equal(
    await page.getByRole("heading", { name: "Servers", level: 1 }).isVisible(),
    true,
    "Clicking an inner control must not navigate away from Overview",
  );
  await page.keyboard.press("Escape");
  console.log("VISUAL_OVERVIEW_CARD_INNER_CONTROL=stayed on Overview");
}

async function run() {
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-overview", FAMILY);
  fs.mkdirSync(outDir, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "yark-visual-overview-"));
  const reports = [];

  try {
    // Init schema on an empty profile, then capture empty Overview.
    await withOverviewSession(userData, async (page, errors) => {
      await setDensity(page, "comfortable");
      assert.equal(await page.locator(SERVER_CARD).count(), 0);
      assert.equal(
        await page.locator("[data-discord-invite-card]").count(),
        1,
        "Discord invite should appear for a fresh operator profile",
      );
      await captureMatrix(page, outDir, "empty-comfortable", reports);
      await page.locator("[data-discord-invite-dismiss]").click();
      await page.locator("[data-discord-invite-card]").waitFor({ state: "detached" });
      assert.equal(
        await page.locator("[data-discord-invite-card]").count(),
        0,
        "Discord invite should close immediately",
      );
      if (errors.length > 0) throw new Error(errors.join("\n"));
    });

    seedServers(userData, 1);
    await withOverviewSession(userData, async (page, errors) => {
      await setDensity(page, "comfortable");
      assert.equal(await page.locator(SERVER_CARD).count(), 1);
      assert.equal(
        await page.locator("[data-discord-invite-card]").count(),
        0,
        "Discord invite dismissal should persist after an app restart",
      );
      console.log("VISUAL_OVERVIEW_FLEET_SMALL=1");
      await captureMatrix(page, outDir, "small-comfortable", reports);
      if (errors.length > 0) throw new Error(errors.join("\n"));
    });

    seedServers(userData, 4);
    await withOverviewSession(userData, async (page, errors) => {
      await setDensity(page, "comfortable");
      assert.equal(await page.locator(SERVER_CARD).count(), 4);
      console.log("VISUAL_OVERVIEW_FLEET_POPULATED=4");
      await captureMatrix(page, outDir, "populated-comfortable", reports);

      await setDensity(page, "compact");
      for (const size of sizes.filter((s) => s.name === "hd" || s.name === "qhd-2k")) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await waitForOverviewLayoutReady(page);
        const metrics = await measureOverview(page);
        const shot = path.join(outDir, `populated-compact-${size.name}.png`);
        await page.screenshot({ path: shot, fullPage: false });
        reports.push({
          prefix: "populated-compact",
          size: size.name,
          viewport: `${size.width}x${size.height}`,
          metrics,
          screenshot: shot,
          expectSideBySide: size.width >= 1600,
          sideBySideOk: size.width >= 1600 ? metrics.sideBySide === true : metrics.sideBySide !== true,
          overflowOk: metrics.hasHorizontalOverflow !== true,
          fleetKind: fleetKind(metrics.cardCount),
        });
        assert.equal(metrics.density, "compact");
      }

      await setDensity(page, "comfortable");
      await page.setViewportSize({ width: 1920, height: 1080 });
      await waitForOverviewLayoutReady(page);
      await page.getByRole("button", { name: "Check Servers Health" }).click();
      await page.locator("[data-install-health-scan]").waitFor({ state: "visible", timeout: 5000 });
      const scanMetrics = await measureOverview(page);
      await page.screenshot({
        path: path.join(outDir, "install-scan-toolbar.png"),
        fullPage: false,
      });
      assert.equal(scanMetrics.scanVisible, true);
      assert.equal(
        scanMetrics.scanOnButton,
        true,
        "Install-scan marker should be on the Check Servers Health button (not a fixed top overlay)",
      );
      assert.ok((scanMetrics.scanTop ?? 0) > 40, "Install-scan control should not sit in a window-top overlay");
      await page.locator("[data-install-health-scan]").waitFor({ state: "detached", timeout: 60000 });

      if (errors.length > 0) throw new Error(errors.join("\n"));
    });

    console.log("VISUAL_OVERVIEW_DIR=" + outDir);
    for (const report of reports) {
      console.log(
        JSON.stringify(
          {
            prefix: report.prefix,
            size: report.size,
            viewport: report.viewport,
            fleetKind: report.fleetKind,
            cardCount: report.metrics.cardCount,
            density: report.metrics.density,
            overviewWidth: report.metrics.overviewWidth,
            sideBySide: report.metrics.sideBySide,
            sideBySideOk: report.sideBySideOk,
            overflowOk: report.overflowOk,
            screenshot: report.screenshot,
          },
          null,
          0,
        ),
      );
      assert.equal(report.overflowOk, true, `Horizontal overflow at ${report.prefix} ${report.viewport}`);
      assert.equal(report.sideBySideOk, true, `Unexpected side-by-side layout at ${report.prefix} ${report.viewport}`);
      if (report.metrics.discordInviteVisible) {
        assert.notEqual(
          report.metrics.discordInvitePosition,
          "fixed",
          `Discord invite should stay in Overview flow at ${report.viewport}`,
        );
        assert.equal(
          report.metrics.discordInviteOverlapsContent,
          false,
          `Discord invite overlaps Overview content at ${report.viewport}`,
        );
      }
    }

    const qhdPopulated = reports.find((r) => r.prefix === "populated-comfortable" && r.size === "qhd-2k");
    assert.ok(qhdPopulated, "Missing populated-comfortable qhd-2k report");
    assert.ok(
      (qhdPopulated.metrics.overviewWidth ?? 0) >= 1900,
      `Overview too narrow at QHD: ${qhdPopulated.metrics.overviewWidth}`,
    );
    console.log(
      `VISUAL_OVERVIEW_QHD_NOTE=populated cards=${qhdPopulated.metrics.cardCount}; no speculative QHD filler applied`,
    );
    seedServers(userData, 2);
    await withOverviewSession(userData, async (page) => {
      await assertCardSurfaceOpensWorkspace(page);
    });

    console.log("VISUAL_OVERVIEW_OK");
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error("VISUAL_OVERVIEW_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
