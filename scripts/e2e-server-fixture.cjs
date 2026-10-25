/**
 * Shared create / reopen / INI path helpers for file-writing Electron suites.
 */
const fs = require("node:fs");
const path = require("node:path");
const { SERVER_CARD } = require("./e2e-dom-hooks.cjs");
const { pickPathField } = require("./e2e-launch.cjs");
const { leaveWorkspaceToServers } = require("./e2e-leave-workspace.cjs");

const MAP_TOKEN = "TheIsland_WP";
const ADMIN_PASSWORD = "admin1234";

function uniquePorts() {
  const base = 25000 + (Math.floor(Date.now() / 1000) % 3000);
  return { game: base, query: base + 1, rcon: base + 2 };
}

function resolvedInstallDir(baseDir, serverName) {
  return path.join(baseDir, serverName);
}

function windowsServerDir(installDir) {
  return path.join(installDir, "ShooterGame", "Saved", "Config", "WindowsServer");
}

function gameUserSettingsPath(installDir) {
  return path.join(windowsServerDir(installDir), "GameUserSettings.ini");
}

function gameIniPath(installDir) {
  return path.join(windowsServerDir(installDir), "Game.ini");
}

function worldArkPath(installDir, mapToken = MAP_TOKEN) {
  return path.join(installDir, "ShooterGame", "Saved", "SavedArks", mapToken, `${mapToken}.ark`);
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function seedReadyInstall(installDir) {
  const bin = path.join(installDir, "ShooterGame", "Binaries", "Win64");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "ArkAscendedServer.exe"), "fake-asa-binary\n");
  fs.writeFileSync(path.join(bin, "version.txt"), "e2e-1.0\n");
}

function identityGameUserSettings(options) {
  const extra = options.extraServerSettings ?? "";
  return [
    "[SessionSettings]",
    `SessionName=${options.sessionName}`,
    `Port=${options.gamePort}`,
    `QueryPort=${options.queryPort}`,
    "",
    "[ServerSettings]",
    "RCONEnabled=True",
    `RCONPort=${options.rconPort}`,
    `ServerAdminPassword=${options.adminPassword}`,
    "ServerPassword=",
    extra,
  ].join("\n");
}

async function dismissOnboarding(page) {
  const later = page.getByRole("button", { name: /^Later$/i });
  try {
    await later.waitFor({ state: "visible", timeout: 8000 });
    await later.click();
  } catch {
    // First-server prompt is not shown on every create.
  }
}

async function createServer(app, page, name, installDir, ports) {
  fs.mkdirSync(installDir, { recursive: true });
  await page.getByRole("button", { name: "New server" }).first().click();
  await page.getByRole("heading", { name: "New server" }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("textbox", { name: /^Name$/ }).fill(name);
  await page.getByRole("textbox", { name: /^Session name$/ }).fill(`Session ${name}`);
  await pickPathField(app, page, "Base folder", installDir);
  await page.getByLabel("Game port").fill(String(ports.game));
  await page.getByLabel("Query port").fill(String(ports.query));
  await page.getByLabel("RCON port").fill(String(ports.rcon));
  await page.locator("input[type='password']").last().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Create server" }).click();
  await dismissOnboarding(page);
  await page.getByRole("tab", { name: "Server", exact: true }).waitFor({
    state: "visible",
    timeout: 15000,
  });
}

async function openServerFromOverview(page, name) {
  const card = page.locator(SERVER_CARD, { has: page.getByText(name, { exact: true }) }).first();
  await card.waitFor({ state: "visible", timeout: 15000 });
  await card.getByRole("button", { name: new RegExp(`Open settings for ${name}`, "i") }).click();
  await page.getByRole("tab", { name: "Server", exact: true }).waitFor({
    state: "visible",
    timeout: 15000,
  });
}

async function clickIniSave(page) {
  const save = page.locator("[data-configuration-editor]").getByRole("button", { name: "Save", exact: true });
  await save.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector("[data-configuration-editor]");
      const button = [...(root?.querySelectorAll("button") ?? [])].find((node) => node.textContent?.trim() === "Save");
      return button !== undefined && button instanceof HTMLButtonElement && !button.disabled;
    },
    null,
    { timeout: 15000 },
  );
  await save.click();
}

async function waitForFileText(file, predicate, timeout = 20000) {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeout) {
    if (fs.existsSync(file)) {
      last = fs.readFileSync(file, "utf8");
      if (predicate(last)) return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${file}. Last contents:\n${last}`);
}

function pageErrorFilter(errors) {
  return errors.filter(
    (message) =>
      !/ResizeObserver|Non-Error promise rejection|Failed to load resource|net::ERR_|dbus|GPU process/i.test(message),
  );
}

module.exports = {
  MAP_TOKEN,
  ADMIN_PASSWORD,
  leaveWorkspaceToServers,
  uniquePorts,
  resolvedInstallDir,
  gameUserSettingsPath,
  gameIniPath,
  worldArkPath,
  writeText,
  seedReadyInstall,
  identityGameUserSettings,
  createServer,
  openServerFromOverview,
  clickIniSave,
  waitForFileText,
  pageErrorFilter,
};
