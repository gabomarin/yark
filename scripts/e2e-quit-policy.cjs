/**
 * E2E bugbash: quit / desktop shell Settings (#59).
 *
 * Asserts quit-with-servers Ask/Stop preference is gone, tray help still works,
 * and app.quit() completes (native MessageBox auto-confirmed for CI).
 *
 * Usage: node scripts/e2e-quit-policy.cjs
 * Requires: prior npm run build
 */
const assert = require("node:assert/strict");
const {
  createE2eFixtureRoots,
  launchElectronApp,
  waitForOverview,
  removeFixtureDir,
} = require("./e2e-launch.cjs");

delete process.env.ELECTRON_RUN_AS_NODE;

/** Auto-accept Electron dialog.showMessageBox (first button = Stop / OK). */
async function autoConfirmNativeDialogs(app) {
  await app.evaluate(async ({ dialog }) => {
    // Do not call the real MessageBox — that waits for a human click and hangs CI.
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
}

/**
 * Quit via Electron app.quit() (before-quit confirm), not Playwright window close.
 * Closing the BrowserWindow with "Close window to tray" on only hides — process never exits.
 */
async function closeAppGracefully(app) {
  await autoConfirmNativeDialogs(app);

  const timeoutMs = 20_000;
  const proc = app.process();
  const exited =
    proc == null || proc.exitCode != null
      ? Promise.resolve()
      : new Promise((resolve) => {
          proc.once("exit", resolve);
        });

  await app.evaluate(({ app: electronApp }) => {
    electronApp.quit();
  });

  await Promise.race([
    exited,
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(`app.quit() timed out after ${timeoutMs}ms (process still alive)`),
          ),
        timeoutMs,
      );
    }),
  ]);
}

async function run() {
  const { profileDir } = createE2eFixtureRoots("quit-policy", { createServers: false });

  const consoleErrors = [];
  const pageErrors = [];

  const app = await launchElectronApp({ profileDir });

  let page = null;
  try {
    page = await waitForOverview(app);
    await autoConfirmNativeDialogs(app);

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.waitForLoadState("domcontentloaded");
    await page.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: 15000,
    });

    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await page.getByText("Close window to tray").waitFor({
      state: "visible",
      timeout: 10000,
    });

    assert.equal(
      await page.getByText("On quit with active servers").count(),
      0,
      "On quit with active servers setting must be removed",
    );
    assert.equal(
      await page.getByRole("radio", { name: "Ask" }).count(),
      0,
      "Ask/Stop quit policy radios must not appear",
    );
    assert.equal(await page.getByRole("radio", { name: "Leave" }).count(), 0);

    const trayHelp = page.getByText(/Quitting while servers are running always asks/i);
    assert.ok(
      (await trayHelp.count()) > 0,
      "Close-to-tray help should mention always-ask quit confirmation",
    );

    const traySwitch = page.getByRole("switch", {
      name: "Close window to system tray",
    });
    await traySwitch.waitFor({ state: "attached", timeout: 5000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          'input[type="checkbox"][aria-label="Close window to system tray"]:not([disabled])',
        );
        return el !== null;
      },
      { timeout: 10000 },
    );

    const trayWasOn = await traySwitch.isChecked();
    if (!trayWasOn) {
      await traySwitch.click({ force: true });
      await page.waitForTimeout(300);
    }

    const notifySwitch = page.getByRole("switch", {
      name: "Show notification when hiding to tray",
    });
    assert.ok(
      (await notifySwitch.count()) > 0,
      "Tray notification switch should show when Close window to tray is on",
    );

    await traySwitch.click({ force: true });
    await page.waitForTimeout(400);
    assert.equal(await traySwitch.isChecked(), false);
    assert.equal(
      await notifySwitch.count(),
      0,
      "Tray notification switch should hide when Close window to tray is off",
    );

    await traySwitch.click({ force: true });
    await page.waitForTimeout(300);
    if (!trayWasOn) {
      await traySwitch.click({ force: true });
      await page.waitForTimeout(300);
    }

    const finalPrefs = await page.evaluate(async () => {
      return window.api.getDesktopShellPreferences();
    });
    assert.equal(finalPrefs.ok, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(finalPrefs.data, "onQuitWithActiveServers"),
      false,
      "Desktop shell preferences must not expose onQuitWithActiveServers",
    );

    if (pageErrors.length > 0) {
      throw new Error(`pageerror: ${pageErrors.join(" | ")}`);
    }
    const actionableConsole = consoleErrors.filter(
      (text) => !/Failed to load resource|net::ERR_/i.test(text),
    );
    if (actionableConsole.length > 0) {
      console.warn("E2E_QUIT_CONSOLE_WARN", actionableConsole.join(" | "));
    }

    console.log("E2E_QUIT_POLICY_OK");
  } finally {
    try {
      await closeAppGracefully(app);
    } catch (error) {
      console.warn(
        `E2E_QUIT_CLOSE_WARN ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        const pid = app.process()?.pid;
        if (pid) {
          require("node:child_process").spawnSync(
            "taskkill",
            ["/PID", String(pid), "/T", "/F"],
            { windowsHide: true, stdio: "ignore" },
          );
        }
      } catch {
        // ignore
      }
    }
    await removeFixtureDir(profileDir);
  }
}

run().catch((error) => {
  console.error("E2E_QUIT_POLICY_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
