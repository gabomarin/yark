/**
 * E2E: INI Save conflict review keeps the chosen file value and unrelated disk edits (#696).
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
  const gusPath = gameUserSettingsPath(resolvedInstallDir(installDir, serverName));

  await createServer(app, page, serverName, installDir, ports);
  await leaveWorkspaceToServers(page);
  writeText(
    gusPath,
    settingsText(serverName, ports, "XPMultiplier=1\nTamingSpeedMultiplier=1\nMatingIntervalMultiplier=2.5\n"),
  );

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
  const review = page.locator("[data-ini-conflict-review]");
  await review.waitFor({ state: "visible", timeout: 15000 });
  await page.getByText("Save did not write.").waitFor({ state: "visible", timeout: 5000 });

  const blocked = fs.readFileSync(gusPath, "utf8");
  assert.equal(iniValue(blocked, "XPMultiplier"), "9");
  assert.equal(iniValue(blocked, "TamingSpeedMultiplier"), "1");
  assert.equal(iniValue(blocked, "MatingIntervalMultiplier"), "3.5");

  await review.getByRole("radio", { name: "Use the file's 9" }).click();
  await review.getByRole("button", { name: "Accept", exact: true }).click();
  await review.waitFor({ state: "hidden", timeout: 20000 });

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
}).catch((error) => {
  console.error("E2E_INI_CONFLICT_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
