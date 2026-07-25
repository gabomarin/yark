import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  gameUserSettingsIniPath,
  syncProfileSettingsToIni,
} from "@backend/domains/instances/sync-profile-ini";
import { flattenIniText, INI_FLAT_SEP } from "@shared/ini-text";
import type { ServerProfile } from "@shared/types";

function flatKey(section: string, key: string): string {
  return `${section}${INI_FLAT_SEP}${key}`;
}

function profile(installDir: string, overrides: Partial<ServerProfile> = {}): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "id-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir,
    sessionName: "gabo",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: "join1234",
    adminPassword: "admin1234",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
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

describe("syncProfileSettingsToIni", () => {
  it("writes RCON, passwords, ports, and session into GameUserSettings.ini", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-sync-ini-"));
    tmpDirs.push(installDir);
    const gusPath = gameUserSettingsIniPath(installDir);
    mkdirSync(join(installDir, "ShooterGame", "Saved", "Config", "WindowsServer"), {
      recursive: true,
    });
    writeFileSync(
      gusPath,
      "[ServerSettings]\nRCONEnabled=False\nRCONPort=1\n\n[SessionSettings]\nPort=1\nQueryPort=1\nSessionName=old\n",
      "utf8",
    );

    await syncProfileSettingsToIni(profile(installDir));

    const flat = flattenIniText(readFileSync(gusPath, "utf8"));
    expect(flat[flatKey("ServerSettings", "RCONEnabled")]).toBe("True");
    expect(flat[flatKey("ServerSettings", "RCONPort")]).toBe("27020");
    expect(flat[flatKey("ServerSettings", "ServerAdminPassword")]).toBe("admin1234");
    expect(flat[flatKey("ServerSettings", "ServerPassword")]).toBe("join1234");
    expect(flat[flatKey("SessionSettings", "SessionName")]).toBe("gabo");
    expect(flat[flatKey("SessionSettings", "Port")]).toBe("7777");
    expect(flat[flatKey("SessionSettings", "QueryPort")]).toBe("27015");
  });

  it("clears ServerPassword when profile has null", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-sync-ini-"));
    tmpDirs.push(installDir);

    await syncProfileSettingsToIni(
      profile(installDir, { serverPassword: null }),
    );

    const flat = flattenIniText(
      readFileSync(gameUserSettingsIniPath(installDir), "utf8"),
    );
    expect(flat[flatKey("ServerSettings", "ServerPassword")]).toBe("");
    expect(flat[flatKey("ServerSettings", "RCONEnabled")]).toBe("True");
  });
});
