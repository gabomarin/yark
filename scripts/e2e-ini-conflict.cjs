/**
 * E2E: INI Save conflict review on settings, engrams, and loot (#696).
 *
 * Each view edits a line, then the file changes outside YARK. Accept keeps the
 * file value and an unrelated key that was already on disk.
 *
 * Usage: npm run build && npm run e2e:ini-conflict
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { openWorkspaceTab } = require("./e2e-launch.cjs");
const {
  ADMIN_PASSWORD,
  createServer,
  leaveWorkspaceToServers,
  openServerFromOverview,
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

function settingsText(serverName, ports, extraServerSettings) {
  return identityGameUserSettings({
    sessionName: `Session ${serverName}`,
    gamePort: ports.game,
    queryPort: ports.query,
    rconPort: ports.rcon,
    adminPassword: ADMIN_PASSWORD,
    extraServerSettings,
  });
}

function iniValue(text, key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match === null ? null : match[1];
}

const ENGRAM_CLASS = "EngramEntry_StonePick_C";
const CRATE_CLASS = "SupplyCrate_Cave_QualityTier1_C";
const ENGRAM_3 = `OverrideNamedEngramEntries=(EngramClassName="${ENGRAM_CLASS}",EngramHidden=False,EngramPointsCost=3)`;
const ENGRAM_5 = ENGRAM_3.replace("EngramPointsCost=3", "EngramPointsCost=5");
const CRATE_1 =
  `ConfigOverrideSupplyCrateItems=(SupplyCrateClassString="${CRATE_CLASS}",MinItemSets=1,MaxItemSets=1,` +
  "bSetsRandomWithoutReplacement=true,bAppendItemSets=false,ItemSets=((SetWeight=1.0,bItemsRandomWithoutReplacement=true," +
  'ItemEntries=((EntryWeight=1.0,ItemClassStrings=("PrimalItemResource_Stone_C"),ItemsWeights=(1.0),MinQuantity=1.0,MaxQuantity=1.0)))))';
const CRATE_4 = CRATE_1.replace("MinQuantity=1.0,MaxQuantity=1.0", "MinQuantity=4.0,MaxQuantity=6.0");

function gameIni(xp, engram, crate) {
  return `[/Script/ShooterGame.ShooterGameMode]\nXPMultiplier=${xp}\n${engram}\n${crate}\n`;
}

async function acceptConflict(page, radioName, heading) {
  const review = page.locator("[data-ini-conflict-review]");
  await review.waitFor({ state: "visible", timeout: 15000 });
  await page.getByText("Save did not write.").waitFor({ state: "visible", timeout: 5000 });
  const open = review.getByRole("button", { name: "Review conflicts" });
  if ((await open.count()) > 0) await open.click();
  const dialog = page.getByRole("dialog", { name: "INI conflict" });
  const scope = (await open.count()) > 0 ? dialog : review;
  await scope.getByText(heading, { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await scope.getByRole("radio", { name: radioName }).click();
  await scope.getByRole("button", { name: "Accept", exact: true }).click();
  await review.waitFor({ state: "hidden", timeout: 20000 });
}

async function editSetting(page, key, value) {
  await page.getByRole("textbox", { name: "Search settings" }).fill(key);
  const row = page.locator(`[data-ini-setting-key="${key}"]`);
  await row.waitFor({ state: "visible", timeout: 15000 });
  const input = row.locator("input").first();
  await input.click();
  await input.fill(value);
  await input.press("Tab");
  await page.locator(`[data-ini-setting-key="${key}"][data-ini-row-unsaved="true"]`).waitFor({
    state: "visible",
    timeout: 10000,
  });
}

runElectronSuite("ini-conflict", async ({ app, page, serversDir, runId }) => {
  const serverName = `E2E-Conflict-${runId}`;
  const installDir = path.join(serversDir, "base");
  const ports = uniquePorts();
  const serverDir = resolvedInstallDir(installDir, serverName);
  const gusPath = gameUserSettingsPath(serverDir);
  const gamePath = gameIniPath(serverDir);

  await createServer(app, page, serverName, installDir, ports);
  await leaveWorkspaceToServers(page);
  writeText(
    gusPath,
    settingsText(serverName, ports, "XPMultiplier=1\nTamingSpeedMultiplier=1\nMatingIntervalMultiplier=2.5\n"),
  );
  writeText(gamePath, gameIni("1", ENGRAM_3, CRATE_1));

  await openServerFromOverview(page, serverName);
  await openWorkspaceTab(page, "INI Files");
  await page.locator("[data-configuration-editor]").waitFor({ state: "visible", timeout: 15000 });
  await editSetting(page, "XPMultiplier", "6");
  await editSetting(page, "TamingSpeedMultiplier", "3");

  writeText(
    gusPath,
    settingsText(serverName, ports, "XPMultiplier=9\nTamingSpeedMultiplier=1\nMatingIntervalMultiplier=3.5\n"),
  );

  await clickIniSave(page);
  const blocked = fs.readFileSync(gusPath, "utf8");
  assert.equal(iniValue(blocked, "XPMultiplier"), "9");
  assert.equal(iniValue(blocked, "TamingSpeedMultiplier"), "1");
  assert.equal(iniValue(blocked, "MatingIntervalMultiplier"), "3.5");
  await acceptConflict(page, "Use the file's 9", "XPMultiplier");

  const accepted = fs.readFileSync(gusPath, "utf8");
  assert.equal(iniValue(accepted, "XPMultiplier"), "9");
  assert.equal(iniValue(accepted, "TamingSpeedMultiplier"), "1");
  assert.equal(iniValue(accepted, "MatingIntervalMultiplier"), "3.5");

  await clickIniSave(page);
  const saved = await waitForFileText(
    gusPath,
    (text) =>
      iniValue(text, "XPMultiplier") === "9" &&
      iniValue(text, "TamingSpeedMultiplier") === "3" &&
      iniValue(text, "MatingIntervalMultiplier") === "3.5",
  );
  assert.doesNotMatch(saved, /^XPMultiplier=6$/m);

  await page.getByRole("radiogroup", { name: "INI file" }).getByText("Game.ini", { exact: true }).click();
  await page.getByRole("radiogroup", { name: "Game.ini view" }).getByText("Engrams", { exact: true }).click();
  const points = page.getByRole("textbox", { name: `Points cost for ${ENGRAM_CLASS}` });
  await points.waitFor({ state: "visible", timeout: 15000 });
  await points.fill("8");
  await points.press("Tab");
  writeText(gamePath, gameIni("4", ENGRAM_5, CRATE_1));
  await clickIniSave(page);
  await acceptConflict(page, "Use the file's value", "OverrideNamedEngramEntries");
  const afterEngram = fs.readFileSync(gamePath, "utf8");
  assert.match(afterEngram, /EngramPointsCost=5/);
  assert.doesNotMatch(afterEngram, /EngramPointsCost=8/);
  assert.equal(iniValue(afterEngram, "XPMultiplier"), "4");
  assert.match(afterEngram, /MinQuantity=1\.0/);

  await page.getByRole("radiogroup", { name: "Game.ini view" }).getByText("Loot", { exact: true }).click();
  await page.locator("[data-loot-editor]").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: new RegExp(CRATE_CLASS) }).click();
  const minimum = page.getByLabel("Minimum quantity");
  const maximum = page.getByLabel("Maximum quantity");
  await minimum.waitFor({ state: "visible", timeout: 10000 });
  await minimum.fill("2");
  await maximum.fill("3");
  await maximum.press("Tab");
  writeText(gamePath, gameIni("7", ENGRAM_5, CRATE_4));
  await clickIniSave(page);
  await acceptConflict(page, "Use the file's value", "ConfigOverrideSupplyCrateItems");
  const afterCrate = fs.readFileSync(gamePath, "utf8");
  assert.match(afterCrate, /MinQuantity=4\.0/);
  assert.match(afterCrate, /MaxQuantity=6\.0/);
  assert.doesNotMatch(afterCrate, /MinQuantity=2/);
  assert.equal(iniValue(afterCrate, "XPMultiplier"), "7");
  assert.match(afterCrate, /EngramPointsCost=5/);
  assert.equal(iniValue(fs.readFileSync(gusPath, "utf8"), "MatingIntervalMultiplier"), "3.5");
}).catch((error) => {
  console.error("E2E_INI_CONFLICT_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
