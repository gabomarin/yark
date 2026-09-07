import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import {
  resolveAsaApiInjectMode,
  syncAsaApiVersionDll,
} from "@backend/domains/asa-api/asa-api-inject";
import {
  deleteAsaApiPlugin,
  readAsaApiStatus,
  setAsaApiPluginEnabled,
} from "@backend/domains/asa-api/asa-api-status";
import { uninstallAsaApiFromInstall } from "@backend/domains/asa-api/asa-api-uninstall";
import { resolveLaunchBinaryPath } from "@backend/domains/instances/launch-args";
import type { ServerProfile } from "@shared/types";

let root: string | null = null;

afterEach(() => {
  if (root !== null) {
    rmSync(root, { recursive: true, force: true });
    root = null;
  }
});

describe("asa-api status", () => {
  it("detects loader, version.dll, and lists enabled/disabled plugins", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asaapi-"));
    const win64 = join(root, "ShooterGame", "Binaries", "Win64");
    const plugins = join(win64, "ArkApi", "Plugins");
    const disabled = join(win64, "ArkApi", "Disabled_Plugins");
    await mkdir(join(plugins, "Permissions"), { recursive: true });
    await mkdir(join(disabled, "CrossChat"), { recursive: true });
    await writeFile(join(win64, "AsaApiLoader.exe"), "x");
    await writeFile(join(win64, "Version.dll"), "v");
    await writeFile(join(win64, "ArkApi", "AsaApi.dll"), "a");
    await writeFile(join(plugins, "Permissions", "Permissions.dll"), "x");
    await writeFile(join(plugins, "Permissions", "config.json"), "{}");
    await writeFile(join(disabled, "CrossChat", "CrossChat.dll"), "x");

    const status = await readAsaApiStatus(root);
    expect(status.installedOnDisk).toBe(true);
    expect(status.loaderPresent).toBe(true);
    expect(status.versionDllPresent).toBe(true);
    expect(status.apiCorePresent).toBe(true);
    expect(status.plugins).toHaveLength(2);
    const perms = status.plugins.find((p) => p.name === "Permissions");
    const chat = status.plugins.find((p) => p.name === "CrossChat");
    expect(perms?.enabled).toBe(true);
    expect(chat?.enabled).toBe(false);
  });

  it("moves plugin folders into ArkApi\\Disabled_Plugins when toggling off", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asaapi-"));
    const win64 = join(root, "ShooterGame", "Binaries", "Win64");
    const plugins = join(win64, "ArkApi", "Plugins");
    const disabledRoot = join(win64, "ArkApi", "Disabled_Plugins");
    await mkdir(join(plugins, "ArkShop"), { recursive: true });
    await writeFile(join(plugins, "ArkShop", "ArkShop.dll"), "x");

    const disabled = await setAsaApiPluginEnabled(root, "ArkShop", false);
    expect(disabled.plugins[0]?.enabled).toBe(false);
    expect(disabled.plugins[0]?.folderName).toBe("ArkShop");
    expect(existsSync(join(plugins, "ArkShop"))).toBe(false);
    expect(existsSync(join(disabledRoot, "ArkShop"))).toBe(true);

    const enabled = await setAsaApiPluginEnabled(root, "ArkShop", true);
    expect(enabled.plugins[0]?.enabled).toBe(true);
    expect(existsSync(join(plugins, "ArkShop"))).toBe(true);
    expect(existsSync(join(disabledRoot, "ArkShop"))).toBe(false);
  });

  it("migrates legacy Plugins\\Name.disabled into ArkApi\\Disabled_Plugins", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asaapi-leg-"));
    const win64 = join(root, "ShooterGame", "Binaries", "Win64");
    const plugins = join(win64, "ArkApi", "Plugins");
    await mkdir(join(plugins, "ArkShop.disabled"), { recursive: true });
    await writeFile(join(plugins, "ArkShop.disabled", "ArkShop.dll"), "x");

    const status = await readAsaApiStatus(root);
    expect(status.plugins).toHaveLength(1);
    expect(status.plugins[0]?.name).toBe("ArkShop");
    expect(status.plugins[0]?.enabled).toBe(false);
    expect(existsSync(join(plugins, "ArkShop.disabled"))).toBe(false);
    expect(existsSync(join(win64, "ArkApi", "Disabled_Plugins", "ArkShop"))).toBe(
      true,
    );
  });

  it("migrates Win64\\Disabled_Plugins into ArkApi\\Disabled_Plugins", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asaapi-w64-"));
    const win64 = join(root, "ShooterGame", "Binaries", "Win64");
    const legacy = join(win64, "Disabled_Plugins", "ArkShop");
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, "ArkShop.dll"), "x");

    const status = await readAsaApiStatus(root);
    expect(status.plugins[0]?.enabled).toBe(false);
    expect(existsSync(join(win64, "Disabled_Plugins"))).toBe(false);
    expect(existsSync(join(win64, "ArkApi", "Disabled_Plugins", "ArkShop"))).toBe(
      true,
    );
  });

  it("deletes plugin folders from Plugins or Disabled_Plugins", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asaapi-del-"));
    const win64 = join(root, "ShooterGame", "Binaries", "Win64");
    const plugins = join(win64, "ArkApi", "Plugins");
    const disabledRoot = join(win64, "ArkApi", "Disabled_Plugins");
    await mkdir(join(plugins, "ArkShop"), { recursive: true });
    await writeFile(join(plugins, "ArkShop", "ArkShop.dll"), "x");
    await mkdir(join(disabledRoot, "CrossChat"), { recursive: true });
    await writeFile(join(disabledRoot, "CrossChat", "CrossChat.dll"), "x");

    const afterShop = await deleteAsaApiPlugin(root, "ArkShop");
    expect(afterShop.plugins.some((p) => p.name === "ArkShop")).toBe(false);
    expect(existsSync(join(plugins, "ArkShop"))).toBe(false);

    const afterChat = await deleteAsaApiPlugin(root, "CrossChat");
    expect(afterChat.plugins).toHaveLength(0);
    expect(existsSync(join(disabledRoot, "CrossChat"))).toBe(false);
  });
});

describe("asa-api inject mode", () => {
  it("defaults to versionDll when AsaApi is on without loader flag", () => {
    expect(
      resolveAsaApiInjectMode({ useAsaApi: true, useAsaApiLoader: false }),
    ).toBe("versionDll");
    expect(
      resolveAsaApiInjectMode({ useAsaApi: true, useAsaApiLoader: true }),
    ).toBe("loader");
    expect(
      resolveAsaApiInjectMode({ useAsaApi: false, useAsaApiLoader: true }),
    ).toBe("off");
  });

  it("parks and restores Version.dll across modes", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asaapi-inj-"));
    const win64 = join(root, "ShooterGame", "Binaries", "Win64");
    await mkdir(win64, { recursive: true });
    const active = join(win64, "Version.dll");
    const disabled = join(win64, "Version.dll.yark-off");
    await writeFile(active, "v");

    syncAsaApiVersionDll(root, "off");
    expect(existsSync(active)).toBe(false);
    expect(existsSync(disabled)).toBe(true);

    syncAsaApiVersionDll(root, "versionDll");
    expect(existsSync(active)).toBe(true);
    expect(existsSync(disabled)).toBe(false);

    syncAsaApiVersionDll(root, "loader");
    expect(existsSync(active)).toBe(false);
    expect(existsSync(disabled)).toBe(true);
  });
});

describe("asa-api uninstall", () => {
  it("removes AsaApi files and leaves the game binary", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asaapi-un-"));
    const win64 = join(root, "ShooterGame", "Binaries", "Win64");
    const plugins = join(win64, "ArkApi", "Plugins", "Permissions");
    await mkdir(plugins, { recursive: true });
    await mkdir(join(win64, "Lib"), { recursive: true });
    await mkdir(join(win64, "logs"), { recursive: true });
    await writeFile(join(win64, "ArkAscendedServer.exe"), "game");
    await writeFile(join(win64, "AsaApiLoader.exe"), "loader");
    await writeFile(join(win64, "Version.dll"), "v");
    await writeFile(join(win64, "Version.dll.yark-off"), "parked");
    await writeFile(join(win64, "libcrypto-3-x64.dll"), "c");
    await writeFile(join(win64, "ArkApi", "AsaApi.dll"), "api");
    await writeFile(join(plugins, "Permissions.dll"), "p");
    await writeFile(
      join(win64, "config.json"),
      JSON.stringify({
        settings: { AutomaticPluginReloading: true, AttachToParent: true },
      }),
    );
    await writeFile(join(win64, "logs", "ArkApi.log"), "log");
    await writeFile(join(win64, "steam_appid.txt"), "2430930");

    const status = await uninstallAsaApiFromInstall(root);
    expect(status.installedOnDisk).toBe(false);
    expect(existsSync(join(win64, "ArkAscendedServer.exe"))).toBe(true);
    expect(existsSync(join(win64, "steam_appid.txt"))).toBe(true);
    expect(existsSync(join(win64, "AsaApiLoader.exe"))).toBe(false);
    expect(existsSync(join(win64, "Version.dll"))).toBe(false);
    expect(existsSync(join(win64, "ArkApi"))).toBe(false);
    expect(existsSync(join(win64, "config.json"))).toBe(false);
  });

  it("does not delete unrelated Win64 config.json", async () => {
    root = await mkdtemp(join(tmpdir(), "yark-asaapi-cfg-"));
    const win64 = join(root, "ShooterGame", "Binaries", "Win64");
    await mkdir(win64, { recursive: true });
    await writeFile(join(win64, "AsaApiLoader.exe"), "loader");
    await writeFile(join(win64, "config.json"), JSON.stringify({ foo: 1 }));

    await uninstallAsaApiFromInstall(root);
    expect(existsSync(join(win64, "config.json"))).toBe(true);
    expect(existsSync(join(win64, "AsaApiLoader.exe"))).toBe(false);
  });
});

describe("resolveLaunchBinaryPath", () => {
  it("uses AsaApiLoader only when AsaApi and loader flags are both on", () => {
    const profile = {
      installDir: "C:\\asa\\island",
      useAsaApi: true,
      useAsaApiLoader: true,
    } as ServerProfile;
    expect(resolveLaunchBinaryPath(profile).replace(/\//g, "\\")).toMatch(
      /AsaApiLoader\.exe$/i,
    );
  });

  it("keeps ArkAscendedServer.exe for Version.dll mode", () => {
    const profile = {
      installDir: "C:\\asa\\island",
      useAsaApi: true,
      useAsaApiLoader: false,
    } as ServerProfile;
    expect(resolveLaunchBinaryPath(profile).replace(/\//g, "\\")).toMatch(
      /ArkAscendedServer\.exe$/i,
    );
  });
});
