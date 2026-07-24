/**
 * Iteration 2 closing design review — docs/visual-testing.md
 * Usage: node scripts/visual-iter2-review.cjs
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
  { name: "qhd-2k", width: 2560, height: 1440 },
];

async function measureLayout(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const main =
      document.querySelector(".mantine-AppShell-main") ?? document.querySelector("main");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      canScrollMain: main !== null && main.scrollHeight > main.clientHeight + 2,
    };
  });
}

async function measureOverviewClarity(page) {
  return page.evaluate(() => {
    const summary = document.querySelector("[data-server-summary]")?.textContent ?? "";
    const attentionEl = document.querySelector("[data-attention-count]");
    const attention = attentionEl?.textContent ?? null;
    const attentionCount = attentionEl?.getAttribute("data-attention-count") ?? null;
    const cards = [...document.querySelectorAll("[data-server-card]")].map((card) => ({
      name: card.getAttribute("data-server-name"),
      tone: card.getAttribute("data-tone"),
      primary:
        card.querySelector("[data-primary-action]")?.textContent?.trim() ?? null,
    }));
    const newServer = document.querySelector(
      "header button, header [data-mantine-button]",
    );
    const headerButtons = [...document.querySelectorAll("header button")].map((btn) =>
      btn.textContent?.trim(),
    );
    return { summary, attention, attentionCount, cards, headerButtons };
  });
}

async function wheelScroll(page) {
  const main = page.locator(".mantine-AppShell-main").first();
  if ((await main.count()) === 0) return { scrolled: false };
  const before = await main.evaluate((el) => el.scrollTop);
  await main.hover();
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(180);
  const after = await main.evaluate((el) => el.scrollTop);
  await main.evaluate((el) => {
    el.scrollTop = 0;
  });
  return { scrolled: after !== before, before, after };
}

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function goNav(page, label) {
  const btn = page.getByRole("button", { name: label }).first();
  await btn.click();
  await page.waitForTimeout(200);
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-iter2");
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
    await page.getByRole("heading", { name: "Servers", level: 1 }).waitFor({
      timeout: 20000,
    });
    // Wait for the operational summary to settle (avoids measuring the initial empty state).
    await page.waitForFunction(() => {
      const summary = document.querySelector("[data-server-summary]")?.textContent ?? "";
      return /server/.test(summary);
    }, null, { timeout: 15000 });

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(200);

      // --- Overview ---
      await goNav(page, "Servers");
      await page.locator("[data-overview-page]").waitFor({ timeout: 10000 });
      const overviewClarity = await measureOverviewClarity(page);
      const overviewLayout = await measureLayout(page);
      const overviewShot = await shot(page, outDir, `${size.name}-overview`);
      const overviewScroll = overviewLayout.canScrollMain
        ? await wheelScroll(page)
        : { scrolled: false };

      assert.equal(
        overviewLayout.hasHorizontalOverflow,
        false,
        `Overflow Overview ${size.name}`,
      );
      assert.ok(
        overviewClarity.headerButtons.some((t) => t?.includes("New server")),
        "Missing New server CTA",
      );
      assert.ok(
        overviewClarity.cards.every((c) => c.primary),
        "Some card is missing a primary action",
      );

      // --- SteamCMD ---
      await goNav(page, "SteamCMD");
      await page.waitForTimeout(250);
      const steamLayout = await measureLayout(page);
      const steamShot = await shot(page, outDir, `${size.name}-steamcmd`);
      assert.equal(steamLayout.hasHorizontalOverflow, false, `Overflow SteamCMD ${size.name}`);

      // --- Logs ---
      await goNav(page, "Logs");
      await page.waitForTimeout(250);
      const eventsTab = page.getByRole("tab", { name: /Events/i });
      if ((await eventsTab.count()) > 0) await eventsTab.click();
      const logsEventsShot = await shot(page, outDir, `${size.name}-logs-events`);
      const updatesTab = page.getByRole("tab", { name: /Updates/i });
      if ((await updatesTab.count()) > 0) {
        await updatesTab.click();
        await page.waitForTimeout(150);
      }
      const logsUpdatesShot = await shot(page, outDir, `${size.name}-logs-updates`);
      const logsLayout = await measureLayout(page);
      assert.equal(logsLayout.hasHorizontalOverflow, false, `Overflow Logs ${size.name}`);

      // --- Workspace (if servers exist) ---
      let workspaceShots = [];
      await goNav(page, "Servers");
      await page.locator("[data-overview-page]").waitFor({ timeout: 10000 });
      const firstCard = page.locator("[data-server-card]").first();
      if ((await firstCard.count()) > 0) {
        await firstCard.getByRole("button", { name: /Open settings/i }).click();
        await page.waitForTimeout(400);

        const workspaceTabs = [
          { name: "Server", file: "workspace-server" },
          { name: "INI Files", file: "workspace-ini" },
          { name: "Mods", file: "workspace-mods" },
        ];

        for (const tab of workspaceTabs) {
          const tabBtn = page.getByRole("tab", { name: tab.name });
          if ((await tabBtn.count()) === 0) continue;
          await tabBtn.click();
          await page.waitForTimeout(200);
          const wsLayout = await measureLayout(page);
          assert.equal(
            wsLayout.hasHorizontalOverflow,
            false,
            `Overflow workspace ${tab.file} ${size.name}`,
          );
          workspaceShots.push(
            await shot(page, outDir, `${size.name}-${tab.file}`),
          );
        }

        const back = page.getByLabel(/Back to servers/i);
        if ((await back.count()) > 0) {
          await back.click();
        } else {
          await goNav(page, "Servers");
        }
        await page.waitForTimeout(200);
      }

      reports.push({
        size: size.name,
        overviewClarity,
        overviewLayout,
        overviewScroll,
        screenshots: {
          overview: overviewShot,
          steamcmd: steamShot,
          logsEvents: logsEventsShot,
          logsUpdates: logsUpdatesShot,
          workspace: workspaceShots,
        },
      });
    }

    console.log("VISUAL_ITER2_DIR=" + outDir);
    for (const report of reports) {
      console.log(
        JSON.stringify(
          {
            size: report.size,
            summary: report.overviewClarity.summary,
            attention: report.overviewClarity.attention,
            cards: report.overviewClarity.cards,
            headerButtons: report.overviewClarity.headerButtons,
            overflow: report.overviewLayout.hasHorizontalOverflow,
            screenshots: report.screenshots,
          },
          null,
          0,
        ),
      );
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }

    console.log("VISUAL_ITER2_OK");
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("VISUAL_ITER2_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
