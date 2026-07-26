const assert = require("node:assert/strict");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await window.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 15000 });
    const h1 = await window.locator("h1").first().textContent();

    assert.ok(h1 !== null, "Main UI title was not found");
    assert.ok(
      h1.includes("Servers") || h1.includes("YARK"),
      `Unexpected title. Expected to include 'Servers' or 'YARK', got: ${h1}`,
    );

    const navLabels = ["Servers", "Clusters", "Backups", "SteamCMD", "Logs"];
    for (const label of navLabels) {
      const btn = window.getByRole("button", { name: label, exact: true }).first();
      assert.ok((await btn.count()) > 0, `Missing sidebar nav: ${label}`);
    }

    console.log("E2E_OK");
    console.log(`UI_H1=${h1}`);
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("E2E_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
