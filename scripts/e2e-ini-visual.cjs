/**
 * E2E: Game.ini Visual Engrams and Loot save, plus Use file values for a drifted port.
 *
 * Usage: npm run build && npm run e2e:ini-visual
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openWorkspaceTab } = require("./e2e-launch.cjs");
const {
  ADMIN_PASSWORD,
  createServer,
  openServerFromOverview,
  leaveWorkspaceToServers,
  uniquePorts,
  resolvedInstallDir,
  gameUserSettingsPath,
  gameIniPath,
  writeText,
  identityGameUserSettings,
  clickIniSave,
  waitForFileText,
  runElectronSuite,
} = require("./e2e-server-fixture.cjs");

const ENGRAM_CLASS = "EngramEntry_StonePick_C";
const CRATE_CLASS = "SupplyCrate_Cave_QualityTier1_C";
const ITEM_CLASS = "PrimalItemResource_Stone_C";

async function confirmClass(page, fieldName, className) {
  const field = page.getByRole("textbox", { name: fieldName });
  await field.click();
  await field.fill(className);
  const option = page.getByRole("option", { name: new RegExp(className) }).first();
  await option.waitFor({ state: "visible", timeout: 10000 });
  await option.click();
}

runElectronSuite("ini-visual", async ({ app, page, serversDir, runId, profileDir }) => {
  const serverName = `E2E-Ini-${runId}`;
  const installDir = path.join(serversDir, "base");
  const ports = uniquePorts();
  const fileGamePort = ports.game + 10;
  const serverDir = resolvedInstallDir(installDir, serverName);
  const gusPath = gameUserSettingsPath(serverDir);
  const gamePath = gameIniPath(serverDir);

  await createServer(app, page, serverName, installDir, ports);
  await leaveWorkspaceToServers(page);

  writeText(
    gusPath,
    identityGameUserSettings({
      sessionName: `Session ${serverName}`,
      gamePort: fileGamePort,
      queryPort: ports.query,
      rconPort: ports.rcon,
      adminPassword: ADMIN_PASSWORD,
      extraServerSettings: "MatingIntervalMultiplier=2.5\n",
    }),
  );

  await openServerFromOverview(page, serverName);
  const report = page.locator("[data-import-compatibility-report]");
  await report.waitFor({ state: "visible", timeout: 15000 });
  await report.getByText(`Game port in GameUserSettings.ini: ${fileGamePort}.`).waitFor({
    state: "visible",
    timeout: 5000,
  });
  await report.getByRole("button", { name: "Use file values" }).click();
  await report.waitFor({ state: "hidden", timeout: 15000 });
  const expectedPort = String(fileGamePort);
  const started = Date.now();
  let gamePortValue = "";
  while (Date.now() - started < 15000) {
    try {
      gamePortValue = await page.getByLabel("Game port").inputValue();
      if (gamePortValue === expectedPort) break;
    } catch {
      // The server form remounts after the profile update.
    }
    await page.waitForTimeout(200);
  }
  assert.equal(gamePortValue, expectedPort);

  const adopted = fs.readFileSync(gusPath, "utf8");
  assert.match(adopted, /MatingIntervalMultiplier=2\.5/);
  assert.match(adopted, new RegExp(`^Port=${fileGamePort}$`, "m"));

  await openWorkspaceTab(page, "INI Files");
  await page.locator("[data-configuration-editor]").waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("radiogroup", { name: "INI file" }).getByText("Game.ini", { exact: true }).click();
  await page.getByRole("radiogroup", { name: "Game.ini view" }).getByText("Engrams", { exact: true }).click();
  await confirmClass(page, "New engram class name", ENGRAM_CLASS);
  await page.getByText("A class alone does not change the game.").waitFor({ state: "visible", timeout: 5000 });
  await page.getByLabel("Points cost for new engram").fill("3");
  await page.getByLabel(`Points cost for ${ENGRAM_CLASS}`).waitFor({ state: "visible", timeout: 10000 });
  await clickIniSave(page);
  await waitForFileText(gamePath, (text) => text.includes(ENGRAM_CLASS) && text.includes("EngramPointsCost=3"));

  await page.getByRole("radiogroup", { name: "Game.ini view" }).getByText("Loot", { exact: true }).click();
  await page.locator("[data-loot-editor]").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("textbox", { name: "Add a crate" }).fill(CRATE_CLASS);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await confirmClass(page, "Add an item", ITEM_CLASS);
  await page.getByLabel("Minimum quantity").fill("2");
  await clickIniSave(page);
  const gameText = await waitForFileText(
    gamePath,
    (text) => text.includes(CRATE_CLASS) && text.includes(ITEM_CLASS) && text.includes("MinQuantity=2"),
  );
  assert.match(gameText, new RegExp(ENGRAM_CLASS));

  const gusAfterLoot = fs.readFileSync(gusPath, "utf8");
  assert.match(gusAfterLoot, /MatingIntervalMultiplier=2\.5/);
  console.log(`E2E_PROFILE=${profileDir}`);
}).catch((error) => {
  console.error("E2E_INI_VISUAL_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
