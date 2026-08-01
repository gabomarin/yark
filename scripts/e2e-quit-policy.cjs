/**
 * E2E bugbash: quit policy / desktop shell Settings (#59).
 *
 * Asserts Ask/Stop only (no Leave), tray help copy, and preference persistence.
 * Closes via Electron app.quit() (not Playwright window close / taskkill).
 * Native MessageBox is auto-confirmed so Ask/Stop on quit does not hang CI.
 *
 * Usage: node scripts/e2e-quit-policy.cjs
 * Requires: prior npm run build
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

/** Auto-accept Electron dialog.showMessageBox (first button = Stop / OK). */
async function autoConfirmNativeDialogs(app) {
  await app.evaluate(async ({ dialog }) => {
    // Do not call the real MessageBox — that waits for a human click and hangs CI.
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
}

/**
 * Quit via Electron app.quit() (before-quit / Ask·Stop), not Playwright window close.
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
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const consoleErrors = [];
  const pageErrors = [];

  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
  });

  let page = null;
  try {
    page = await app.firstWindow();
    await autoConfirmNativeDialogs(app);

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    // HTML dialogs (rare); native MessageBox is handled via autoConfirmNativeDialogs.
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.waitForLoadState("domcontentloaded");
    await page.locator("[data-overview-page]").waitFor({
      state: "visible",
      timeout: 15000,
    });

    await page.getByRole("button", { name: "Settings", exact: true }).first().click();
    await page.getByText("On quit with active servers").waitFor({
      state: "visible",
      timeout: 10000,
    });

    const quitControl = page.getByRole("radiogroup", {
      name: "On quit with active servers",
    });
    await quitControl.waitFor({ state: "visible", timeout: 10000 });

    const ask = quitControl.getByRole("radio", { name: "Ask" });
    const stop = quitControl.getByRole("radio", { name: "Stop" });
    const leave = page.getByRole("radio", { name: "Leave" });

    assert.equal(await ask.count(), 1, "Ask radio missing");
    assert.equal(await stop.count(), 1, "Stop radio missing");
    assert.equal(await leave.count(), 0, "Leave radio must not appear");

    // Wait until desktop-shell prefs hydrate (controls start disabled).
    await stop.waitFor({ state: "attached", timeout: 10000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          'input[type="radio"][value="stop"]:not([disabled])',
        );
        return el !== null;
      },
      { timeout: 10000 },
    );

    const quitHelp = page.getByText(/Enable Close window to tray/i);
    assert.ok(
      (await quitHelp.count()) > 0,
      "Quit help should tell users to enable Close window to tray in Settings",
    );

    // Mantine SegmentedControl radios are visually hidden — click the label.
    await quitControl.getByText("Stop", { exact: true }).click();
    await page.waitForTimeout(400);
    assert.equal(await stop.isChecked(), true, "Stop should be selected");

    const prefsAfterStop = await page.evaluate(async () => {
      return window.api.getDesktopShellPreferences();
    });
    assert.equal(prefsAfterStop.ok, true);
    assert.equal(prefsAfterStop.data.onQuitWithActiveServers, "stop");

    await quitControl.getByText("Ask", { exact: true }).click();
    await page.waitForTimeout(400);
    assert.equal(await ask.isChecked(), true, "Ask should be selected");

    const prefsAfterAsk = await page.evaluate(async () => {
      return window.api.getDesktopShellPreferences();
    });
    assert.equal(prefsAfterAsk.ok, true);
    assert.equal(prefsAfterAsk.data.onQuitWithActiveServers, "ask");

    // Tray toggle: notification row only when Close window to tray is on.
    const traySwitch = page.getByRole("switch", {
      name: "Close window to system tray",
    });
    await traySwitch.waitFor({ state: "attached", timeout: 5000 });

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

    // Restore tray preference for the developer's machine.
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
    assert.ok(
      finalPrefs.data.onQuitWithActiveServers === "ask" ||
        finalPrefs.data.onQuitWithActiveServers === "stop",
    );
    assert.notEqual(finalPrefs.data.onQuitWithActiveServers, "leave");

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
      // Last resort only if app.quit() (with dialog auto-confirm) still hangs.
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
  }
}

run().catch((error) => {
  console.error("E2E_QUIT_POLICY_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
