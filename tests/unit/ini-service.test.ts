import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerProfile } from "@shared/types";
import { IniService } from "@backend/domains/config/ini-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";

function makeProfile(installDir: string): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "srv-ini-1",
    name: "INI Test",
    map: "TheIsland_WP",
    installDir,
    enabled: true,
    autoStart: false,
    sessionName: "Session",
    maxPlayers: 70,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin1234",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeService(installDir: string, addEvent = vi.fn()) {
  const profile = makeProfile(installDir);
  const repo = {
    get: (id: string) => (id === profile.id ? profile : null),
    addEvent,
  } as unknown as ServerRepository;

  return {
    service: new IniService(repo, new InstanceLockManager()),
    profile,
    addEvent,
  };
}

function gameUserSettingsPath(installDir: string): string {
  return join(
    installDir,
    "ShooterGame",
    "Saved",
    "Config",
    "WindowsServer",
    "GameUserSettings.ini",
  );
}

function gameIniPath(installDir: string): string {
  return join(
    installDir,
    "ShooterGame",
    "Saved",
    "Config",
    "WindowsServer",
    "Game.ini",
  );
}

function prepareIniFiles(installDir: string): void {
  const settingsPath = gameUserSettingsPath(installDir);
  const iniPath = gameIniPath(installDir);
  mkdirSync(join(installDir, "ShooterGame", "Saved", "Config", "WindowsServer"), {
    recursive: true,
  });
  writeFileSync(settingsPath, "", "utf8");
  writeFileSync(iniPath, "", "utf8");
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors in tests
    }
  }
});

describe("IniService semantic validation", () => {
  it("marks invalid when RCONPort is not numeric", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile } = makeService(installDir);
    const preview = await service.previewServerIni(profile.id, {
      gameUserSettings: "[ServerSettings]\nRCONPort=abc\n",
      game: "",
    });

    expect(preview.valid).toBe(false);
    expect(preview.issues.some((i) => i.message.includes("RCONPort"))).toBe(true);
  });

  it("marks invalid when RCONPort is out of range", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile } = makeService(installDir);
    const preview = await service.previewServerIni(profile.id, {
      gameUserSettings: "[ServerSettings]\nRCONPort=70000\n",
      game: "",
    });

    expect(preview.valid).toBe(false);
    expect(preview.issues.some((i) => i.message.includes("1024 and 65535"))).toBe(true);
  });

  it("marks invalid when MaxPlayers is not a positive integer", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile } = makeService(installDir);
    const preview = await service.previewServerIni(profile.id, {
      gameUserSettings: "[/Script/Engine.GameSession]\nMaxPlayers=0\n",
      game: "",
    });

    expect(preview.valid).toBe(false);
    expect(preview.issues.some((i) => i.message.includes("MaxPlayers"))).toBe(true);
  });

  it("still rejects legacy ServerSettings MaxPlayers out of range", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile } = makeService(installDir);
    const preview = await service.previewServerIni(profile.id, {
      gameUserSettings: "[ServerSettings]\nMaxPlayers=0\n",
      game: "",
    });

    expect(preview.valid).toBe(false);
    expect(preview.issues.some((i) => i.message.includes("MaxPlayers"))).toBe(true);
  });

  it("rejects saving INI with invalid semantic validation", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile, addEvent } = makeService(installDir);

    await expect(
      service.saveServerIni(profile.id, {
        gameUserSettings: "[ServerSettings]\nRCONPort=99999\n",
        game: "",
      }),
    ).rejects.toThrow("Invalid INI");

    expect(addEvent).not.toHaveBeenCalled();
    const saved = readFileSync(gameUserSettingsPath(installDir), "utf8");
    expect(saved).toBe("");
  });

  it("allows saving a valid INI and records an event", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile, addEvent } = makeService(installDir);

    const preview = await service.saveServerIni(profile.id, {
      gameUserSettings: "[ServerSettings]\nRCONPort=27020\nMaxPlayers=70\n",
      game: "[/Script/ShooterGame.ShooterGameMode]\n",
    });

    expect(preview.valid).toBe(true);
    expect(preview.changedCount).toBeGreaterThan(0);
    expect(addEvent).toHaveBeenCalledTimes(1);
    const saved = readFileSync(gameUserSettingsPath(installDir), "utf8");
    expect(saved).toContain("RCONPort=27020");
  });

  it("strips client keys when saving dedicated INI", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile } = makeService(installDir);

    await service.saveServerIni(profile.id, {
      gameUserSettings: [
        "[ServerSettings]",
        "RCONPort=27020",
        "MaxPlayers=70",
        "LastJoinedSessionPerCategory=Foo",
        "LastJoinedSessionPerCategory=Bar",
        "",
      ].join("\n"),
      game: "",
    });

    const saved = readFileSync(gameUserSettingsPath(installDir), "utf8");
    expect(saved).toContain("RCONPort=27020");
    expect(saved).toContain("MaxPlayers=70");
    expect(saved).not.toContain("LastJoinedSessionPerCategory");
  });

  it("ignores ASA-generated client noise when reading without modifying disk", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const settingsPath = gameUserSettingsPath(installDir);
    const rawSettings = [
      "[ServerSettings]",
      "RCONPort=27020",
      "MaxPlayers=70",
      "",
      "[/Script/ShooterGame.ShooterGameUserSettings]",
      "LastJoinedSessionPerCategory=Foo",
      "ResolutionSizeX=1920",
      "",
    ].join("\n");
    writeFileSync(settingsPath, rawSettings, "utf8");

    const { service, profile } = makeService(installDir);
    const snapshot = await service.readServerIni(profile.id);

    expect(snapshot.payload.gameUserSettings).toContain("MaxPlayers=70");
    expect(snapshot.payload.gameUserSettings).not.toContain(
      "ShooterGameUserSettings",
    );
    expect(snapshot.payload.gameUserSettings).not.toContain(
      "LastJoinedSessionPerCategory",
    );
    expect(snapshot.payload.gameUserSettings).not.toContain("ResolutionSizeX");
    expect(readFileSync(settingsPath, "utf8")).toBe(rawSettings);
  });
});
