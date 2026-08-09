/**
 * Visual review for Mantine 9 / React 19 migration — docs/visual-testing.md
 *
 * Usage: npm run build && node scripts/visual-mantine9.cjs
 * Captures HD / Full HD / QHD for shell routes + Settings (Switch) + optional
 * workspace / menu if a server card exists.
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

const ROUTES = ["Servers", "Clusters", "Backups", "Logs", "Settings"];

async function shot(page, outDir, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SHOT ${file}`);
  return file;
}

async function goNav(page, label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(300);
}

async function measureShell(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const main =
      document.querySelector(".mantine-AppShell-main") ?? document.querySelector("main");
    const navbar = document.querySelector(".mantine-AppShell-navbar");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      mainScrollHeight: main?.scrollHeight ?? null,
      mainClientHeight: main?.clientHeight ?? null,
      navbarWidth: navbar?.getBoundingClientRect().width ?? null,
      lightVariantCount: document.querySelectorAll('[data-variant="light"]').length,
      switchCount: document.querySelectorAll(".mantine-Switch-root").length,
    };
  });
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-mantine9");
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
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 20000 });

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(200);

      for (const route of ROUTES) {
        await goNav(page, route);
        if (route === "Servers") {
          await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
        } else if (route === "Settings") {
          await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({
            timeout: 10000,
          });
        }

        const metrics = await measureShell(page);
        reports.push({ size: size.name, route, metrics });
        assert.equal(
          metrics.hasHorizontalOverflow,
          false,
          `Horizontal overflow on ${route} @ ${size.name}`,
        );
        await shot(page, outDir, `${route.toLowerCase()}-${size.name}`);
      }

      // High-risk: Settings Switch + light variants are on Settings already.
      // Open a server kebab if present (Menu / Tooltip stacking).
      await goNav(page, "Servers");
      const more = page.getByRole("button", { name: "More options" }).first();
      if ((await more.count()) > 0) {
        await more.click();
        await page.waitForTimeout(250);
        await shot(page, outDir, `menu-open-${size.name}`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);

        const openSettings = page.getByRole("button", { name: /Open settings/i }).first();
        if ((await openSettings.count()) > 0) {
          await openSettings.click();
          await page.waitForTimeout(400);
          // Workspace tabs matter for portals/drawers/theme.
          for (const tab of ["Server", "Mods", "INI Files", "Backups", "Logs"]) {
            const tabBtn = page.getByRole("tab", { name: tab });
            if ((await tabBtn.count()) === 0) continue;
            await tabBtn.click();
            await page.waitForTimeout(250);
            const metrics = await measureShell(page);
            reports.push({ size: size.name, route: `workspace:${tab}`, metrics });
            assert.equal(
              metrics.hasHorizontalOverflow,
              false,
              `Horizontal overflow on workspace ${tab} @ ${size.name}`,
            );
            await shot(
              page,
              outDir,
              `workspace-${tab.toLowerCase().replace(/\s+/g, "-")}-${size.name}`,
            );
          }

          const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");
          await leaveWorkspaceToServers(page, 10000);
        }
      }
    }

    // Confirm-modal smoke (open New server form — Cancel).
    await goNav(page, "Servers");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.getByRole("button", { name: "New server" }).first().click();
    await page.getByRole("heading", { name: "New server" }).waitFor({ timeout: 10000 });
    await shot(page, outDir, "form-new-server-full-hd");
    const cancel = page.getByRole("button", { name: /^Cancel$/i });
    const back = page.getByRole("button", { name: /^Back$/i });
    if ((await cancel.count()) > 0) {
      await cancel.first().click();
    } else if ((await back.count()) > 0) {
      await back.first().click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });

    if (errors.length > 0) {
      throw new Error(`UI errors:\n${errors.join("\n")}`);
    }

    console.log("VISUAL_MANTINE9_OK");
    console.log(`ARTIFACTS_DIR=${outDir}`);
    console.log(`REPORTS=${JSON.stringify(reports, null, 2)}`);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("VISUAL_MANTINE9_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
