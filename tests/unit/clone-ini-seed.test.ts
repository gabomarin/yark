import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedCloneIniFiles } from "@backend/domains/instances/clone-ini-seed";
import { flattenIniText, INI_FLAT_SEP } from "@shared/ini-text";
import type { ServerProfile } from "@shared/types";

function flatKey(section: string, key: string): string {
  return `${section}${INI_FLAT_SEP}${key}`;
}

function windowsServerConfig(installDir: string): string {
  return join(installDir, "ShooterGame", "Saved", "Config", "WindowsServer");
}

function profile(installDir: string): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "clone-1",
    name: "Winter",
    map: "TheIsland_WP",
    installDir,
    enabled: true,
    autoStart: false,
    sessionName: "Winter Session",
    maxPlayers: 70,
    gamePort: 7787,
    queryPort: 27025,
    rconPort: 27030,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: now,
    updatedAt: now,
  };
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("seedCloneIniFiles", () => {
  it("copies source INIs and writes the clone ports and session name", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "ark-clone-ini-src-"));
    const destDir = mkdtempSync(join(tmpdir(), "ark-clone-ini-dst-"));
    tmpDirs.push(sourceDir, destDir);
    mkdirSync(windowsServerConfig(sourceDir), { recursive: true });
    writeFileSync(
      join(windowsServerConfig(sourceDir), "Game.ini"),
      "[/script/shootergame.shootergamemode]\nBabyMatureSpeedMultiplier=12.0\n",
      "utf8",
    );
    writeFileSync(
      join(windowsServerConfig(sourceDir), "GameUserSettings.ini"),
      "[ServerSettings]\nHarvestAmountMultiplier=3.0\nRCONPort=27020\n\n[SessionSettings]\nSessionName=Island Session\nPort=7777\nQueryPort=27015\n",
      "utf8",
    );

    await seedCloneIniFiles(sourceDir, profile(destDir));

    const game = readFileSync(
      join(windowsServerConfig(destDir), "Game.ini"),
      "utf8",
    );
    expect(game).toContain("BabyMatureSpeedMultiplier=12.0");

    const gus = flattenIniText(
      readFileSync(join(windowsServerConfig(destDir), "GameUserSettings.ini"), "utf8"),
    );
    expect(gus[flatKey("ServerSettings", "HarvestAmountMultiplier")]).toBe("3.0");
    expect(gus[flatKey("SessionSettings", "SessionName")]).toBe("Winter Session");
    expect(gus[flatKey("SessionSettings", "Port")]).toBe("7787");
    expect(gus[flatKey("SessionSettings", "QueryPort")]).toBe("27025");
    expect(gus[flatKey("ServerSettings", "RCONPort")]).toBe("27030");
  });

  it("falls back to default INIs when the source has none", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "ark-clone-ini-empty-"));
    const destDir = mkdtempSync(join(tmpdir(), "ark-clone-ini-dst-"));
    tmpDirs.push(sourceDir, destDir);

    await seedCloneIniFiles(sourceDir, profile(destDir));

    expect(
      readFileSync(join(windowsServerConfig(destDir), "Game.ini"), "utf8"),
    ).toContain("[/script/shootergame.shootergamemode]");
    const gus = flattenIniText(
      readFileSync(join(windowsServerConfig(destDir), "GameUserSettings.ini"), "utf8"),
    );
    expect(gus[flatKey("SessionSettings", "SessionName")]).toBe("Winter Session");
  });
});
