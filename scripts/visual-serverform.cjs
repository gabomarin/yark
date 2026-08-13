/**
 * ServerForm Create visual audit — docs/visual-testing.md (#292)
 * Usage: npm run build && node scripts/visual-serverform.cjs
 *
 * Isolated YARK_E2E_USER_DATA. Does not Save. PNGs + metrics under
 * os.tmpdir()/ark-gbo-visual-serverform/.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createE2eFixtureRoots,
  launchElectronApp,
  waitForOverview,
  quitElectronApp,
  pickPathField,
  removeFixtureDir,
} = require("./e2e-launch.cjs");

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

async function measureCreateForm(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const heading = Array.from(document.querySelectorAll("h2, h1")).find((el) =>
      /new server/i.test(el.textContent ?? ""),
    );
    const save = Array.from(document.querySelectorAll("button")).find((el) =>
      /^Create server$/i.test((el.textContent ?? "").trim()),
    );
    const back = Array.from(document.querySelectorAll("button")).find((el) =>
      /^Back$/i.test((el.textContent ?? "").trim()),
    );
    const sections = Array.from(document.querySelectorAll("h4")).map((el) =>
      (el.textContent ?? "").trim(),
    );
    const grid = heading?.closest("div")?.querySelector("[class*='mantine-SimpleGrid']")
      ?? document.querySelector("[class*='mantine-SimpleGrid']");
    const gridStyle = grid ? getComputedStyle(grid) : null;
    const main =
      document.querySelector(".mantine-AppShell-main") ?? document.querySelector("main");
    const formScroll =
      document.querySelector("[data-server-form-scroll]") ??
      heading?.closest("[class]") ??
      null;
    const saveRect = save?.getBoundingClientRect();
    const headingRect = heading?.getBoundingClientRect();
    const clusterTitle = Array.from(document.querySelectorAll("h4")).find((el) =>
      /^Cluster$/i.test((el.textContent ?? "").trim()),
    );
    const clusterRect = clusterTitle?.getBoundingClientRect();
    const identityTitle =
      document.querySelector("[data-identity-hero]")
      ?? Array.from(document.querySelectorAll("h4")).find((el) =>
        /^Identity$/i.test((el.textContent ?? "").trim()),
      );
    const networkingTitle = Array.from(document.querySelectorAll("h4")).find((el) =>
      /^Reachability$/i.test((el.textContent ?? "").trim()),
    );
    const accessTitle = null;

    const inView = (rect) =>
      rect != null &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasHorizontalOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      documentScrollHeight: Math.max(root.scrollHeight, body.scrollHeight),
      mainScrollHeight: main?.scrollHeight ?? null,
      mainClientHeight: main?.clientHeight ?? null,
      formScrollHeight: formScroll?.scrollHeight ?? null,
      formClientHeight: formScroll?.clientHeight ?? null,
      gridColumns: gridStyle?.gridTemplateColumns ?? null,
      sectionTitles: sections,
      saveInView: inView(saveRect),
      backInView: inView(back?.getBoundingClientRect() ?? null),
      headingInView: inView(headingRect),
      identityInView: inView(identityTitle?.getBoundingClientRect() ?? null),
      networkingInView: inView(networkingTitle?.getBoundingClientRect() ?? null),
      accessInView: inView(accessTitle?.getBoundingClientRect() ?? null),
      clusterInView: inView(clusterRect),
      saveTop: saveRect ? Math.round(saveRect.top) : null,
      headingTop: headingRect ? Math.round(headingRect.top) : null,
      clusterTop: clusterRect ? Math.round(clusterRect.top) : null,
    };
  });
}

async function openCreateForm(page) {
  await page.getByRole("button", { name: "Servers", exact: true }).first().click();
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function fillCreateBasics(app, page, baseDir) {
  await page.getByRole("textbox", { name: /^Name$/ }).fill("Visual-Create");
  await page.getByRole("textbox", { name: /^Session name$/ }).fill("Visual Session");
  await pickPathField(app, page, "Base folder", baseDir);
}

async function scrollTowardCluster(page) {
  const cluster = page.getByRole("heading", { name: /^Cluster$/i });
  if ((await cluster.count()) > 0) {
    await cluster.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    return;
  }
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(250);
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-serverform");
  fs.mkdirSync(outDir, { recursive: true });

  const { profileDir, serversDir } = createE2eFixtureRoots("visual-serverform");
  const baseDir = path.join(serversDir, "base");
  fs.mkdirSync(baseDir, { recursive: true });

  const reports = [];
  const errors = [];
  let app = null;

  try {
    app = await launchElectronApp({ profileDir });
    const page = await waitForOverview(app);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await openCreateForm(page);

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(350);
      const emptyMetrics = await measureCreateForm(page);
      const emptyFile = await shot(page, outDir, `create-empty-${size.name}`);
      reports.push({ state: "empty", size: size.name, file: emptyFile, metrics: emptyMetrics });
    }

    await fillCreateBasics(app, page, baseDir);
    await page.waitForTimeout(400);

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(350);
      const filledMetrics = await measureCreateForm(page);
      const filledFile = await shot(page, outDir, `create-filled-${size.name}`);
      reports.push({ state: "filled", size: size.name, file: filledFile, metrics: filledMetrics });
    }

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(200);
      await scrollTowardCluster(page);
      const scrollMetrics = await measureCreateForm(page);
      const scrollFile = await shot(page, outDir, `create-cluster-${size.name}`);
      reports.push({ state: "cluster", size: size.name, file: scrollFile, metrics: scrollMetrics });
    }

    const reportPath = path.join(outDir, "report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify({ errors, reports }, null, 2)}\n`, "utf8");
    console.log(`VISUAL_SERVERFORM_DIR=${outDir}`);
    console.log(`VISUAL_SERVERFORM_REPORT=${reportPath}`);
    for (const row of reports) {
      console.log(
        `${row.state}/${row.size} saveInView=${row.metrics.saveInView} clusterInView=${row.metrics.clusterInView} cols=${row.metrics.gridColumns} overflowX=${row.metrics.hasHorizontalOverflow} file=${row.file}`,
      );
    }
    if (errors.length > 0) {
      console.warn(`VISUAL_SERVERFORM_CONSOLE_ERRORS=${errors.length}`);
      for (const err of errors) console.warn(err);
    }
  } finally {
    if (app !== null) {
      await quitElectronApp(app);
    }
    await removeFixtureDir(profileDir).catch(() => {});
    if (serversDir) {
      await removeFixtureDir(serversDir).catch(() => {});
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
