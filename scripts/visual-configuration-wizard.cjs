/**
 * Configuration wizard chrome visual audit — docs/visual-testing.md (#224)
 * Usage: npm run build && node scripts/visual-configuration-wizard.cjs
 *
 * Isolated YARK_E2E_USER_DATA. Creates one server, opens the wizard, captures
 * Profile + selected card + Pace at HD / Full HD / QHD (Compact), then one
 * Comfortable HD pass.
 */
const assert = require("node:assert/strict");
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
  console.log(`SHOT ${file}`);
  return file;
}

async function measureWizard(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const wizard = document.querySelector("[data-configuration-wizard]");
    const selected = wizard?.querySelector("[data-selected]");
    const continueBtn = Array.from(document.querySelectorAll("button")).find((el) =>
      /^Continue$/i.test((el.textContent ?? "").trim()),
    );
    const wizardRect = wizard?.getBoundingClientRect();
    const selectedStyle = selected ? getComputedStyle(selected) : null;
    const inView = (rect) =>
      rect != null &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth;

    return {
      density: root.getAttribute("data-ui-density"),
      hasHorizontalOverflow:
        Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1,
      wizardVisible: wizard !== null && (wizardRect?.width ?? 0) > 0,
      wizardHeight: wizardRect ? Math.round(wizardRect.height) : null,
      continueInView: inView(continueBtn?.getBoundingClientRect() ?? null),
      selectedCount: wizard?.querySelectorAll("[data-selected]").length ?? 0,
      selectedBackground: selectedStyle?.backgroundImage || selectedStyle?.backgroundColor || null,
      selectedBoxShadow: selectedStyle?.boxShadow ?? null,
      selectedRadius: selectedStyle?.borderRadius ?? null,
    };
  });
}

async function assertWizardOk(page, label) {
  const metrics = await measureWizard(page);
  assert.equal(metrics.wizardVisible, true, `${label}: wizard missing`);
  assert.equal(metrics.hasHorizontalOverflow, false, `${label}: horizontal overflow`);
  assert.equal(metrics.continueInView, true, `${label}: Continue out of view`);
  return metrics;
}

async function dismissOnboardingIfPresent(page) {
  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // onboarding not shown
  }
}

async function createServerAndOpenWizard(app, page, outDir) {
  await page.getByRole("button", { name: "Servers", exact: true }).first().click();
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });

  const installDir = path.join(outDir, "visual-wizard-server");
  fs.mkdirSync(installDir, { recursive: true });
  const serverName = `Visual-Wizard-${Date.now()}`;

  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("textbox", { name: /^Name$/ }).fill(serverName);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(`Session ${serverName}`);
  await pickPathField(app, page, "Base folder", installDir);
  await page.getByLabel("Game port").fill("17777");
  await page.getByLabel("Query port").fill("37015");
  await page.getByLabel("RCON port").fill("37020");
  await page.locator("input[type='password']").last().fill("visual-test-admin");
  await page.getByRole("button", { name: "Create server" }).click();
  await dismissOnboardingIfPresent(page);
  await page.getByRole("button", { name: "Configuration wizard" }).waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Configuration wizard" }).click();
  await page.locator("[data-configuration-wizard]").waitFor({
    state: "visible",
    timeout: 15000,
  });
  await page.getByRole("heading", { name: "Set up the play experience" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function setDensity(page, density) {
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor({ timeout: 10000 });
  const label = density === "compact" ? "Compact" : "Comfortable";
  await page.locator("[aria-label='Display size']").getByText(label, { exact: true }).click();
  await page.waitForFunction(
    (wanted) => document.documentElement.getAttribute("data-ui-density") === wanted,
    density,
    { timeout: 5000 },
  );
}

async function returnToWizard(page) {
  await page.getByRole("button", { name: "Servers", exact: true }).first().click();
  const later = page.getByRole("button", { name: /^Later$/i });
  if (await later.isVisible().catch(() => false)) {
    await later.click();
  }
  const wizardBtn = page.getByRole("button", { name: "Configuration wizard" });
  if (await wizardBtn.isVisible().catch(() => false)) {
    await wizardBtn.click();
  } else {
    await page.locator("[data-server-card]").first().getByRole("button", { name: /Open settings/i }).click();
    await page.getByRole("button", { name: "Configuration wizard" }).click();
  }
  await page.locator("[data-configuration-wizard]").waitFor({ state: "visible", timeout: 15000 });
}

async function run() {
  const fixture = createE2eFixtureRoots("visual-config-wizard", { createServers: false });
  const outDir = path.join(os.tmpdir(), "ark-gbo-visual-configuration-wizard");
  fs.mkdirSync(outDir, { recursive: true });
  const app = await launchElectronApp({ profileDir: fixture.profileDir });

  try {
    const page = await waitForOverview(app);
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    const skipSetup = page.getByRole("button", { name: "Skip setup" });
    try {
      await skipSetup.waitFor({ state: "visible", timeout: 4000 });
      await skipSetup.click();
      await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
    } catch {
      // first-run setup already dismissed
    }

    await createServerAndOpenWizard(app, page, outDir);

    for (const size of sizes) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(200);
      const profileMetrics = await assertWizardOk(page, `${size.name} profile`);
      assert.equal(profileMetrics.density, "compact", `${size.name}: expected Compact`);
      await shot(page, outDir, `wizard-profile-${size.name}`);

      await page.getByRole("button", { name: /Play with friends/i }).click();
      const selectedMetrics = await assertWizardOk(page, `${size.name} selected`);
      assert.ok(selectedMetrics.selectedCount >= 1, `${size.name}: no selected profile card`);
      assert.ok(
        /gradient|linear-gradient/i.test(selectedMetrics.selectedBackground ?? ""),
        `${size.name}: selected card missing list-selected background`,
      );
      assert.ok(
        /inset/i.test(selectedMetrics.selectedBoxShadow ?? ""),
        `${size.name}: selected card missing inset selection rail`,
      );
      await shot(page, outDir, `wizard-profile-selected-${size.name}`);

      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("heading", { name: "Set the progression pace" }).waitFor({
        state: "visible",
        timeout: 5000,
      });
      await assertWizardOk(page, `${size.name} pace`);
      await page.getByRole("button", { name: "Technical", exact: true }).hover();
      await page.waitForTimeout(150);
      await shot(page, outDir, `wizard-pace-${size.name}`);
      await page.mouse.move(0, 0);
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await page.getByRole("heading", { name: "What kind of server do you want?" }).waitFor({
        state: "visible",
        timeout: 5000,
      });
    }

    await page.locator("[data-workspace-scroll]").hover();
    await page.mouse.wheel(0, 400);
    await shot(page, outDir, "wizard-profile-hd-scrolled");

    await page.getByRole("button", { name: "Cancel" }).click();
    const leave = page.getByRole("dialog", { name: "Leave the wizard" });
    if (await leave.isVisible().catch(() => false)) {
      await leave.getByRole("button", { name: "Discard draft" }).click();
    }
    await page.getByRole("button", { name: "Configuration wizard" }).waitFor({
      state: "visible",
      timeout: 10000,
    });

    await setDensity(page, "comfortable");
    await returnToWizard(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(200);
    const comfortable = await assertWizardOk(page, "comfortable full-hd");
    assert.equal(comfortable.density, "comfortable", "expected Comfortable density");
    await shot(page, outDir, "wizard-profile-full-hd-comfortable");

    assert.deepEqual(errors, [], errors.join(" | "));
    console.log(`VISUAL_WIZARD_DIR=${outDir}`);
    console.log("VISUAL_WIZARD_OK");
  } finally {
    await quitElectronApp(app);
    await removeFixtureDir(fixture.profileDir);
  }
}

run().catch((error) => {
  console.error("VISUAL_WIZARD_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
