import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { ServerProfile, ServerStatus } from "@shared/types";
import { openDatabase } from "@backend/infra/db/database";
import { ClusterIniTemplateRepository } from "@backend/infra/db/cluster-ini-template-repository";
import { ClusterIniTemplateApplyService } from "@backend/domains/config/cluster-ini-template-apply-service";
import { IniService } from "@backend/domains/config/ini-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { BackupService } from "@backend/domains/backups/backup-service";

const tmpDirs: string[] = [];
let db: DatabaseSync | undefined;

afterEach(() => {
  db?.close();
  db = undefined;
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function makeProfile(
  installDir: string,
  overrides: Partial<ServerProfile> = {},
): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "srv-1",
    name: "Ragnarok",
    map: "Ragnarok_WP",
    installDir,
    enabled: true,
    autoStart: false,
    sessionName: "Ragnarok PvE",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: "join",
    adminPassword: "admin1234",
    clusterId: "alpha",
    clusterDir: "C:/ARK/cluster",
    extraArgs: [],
    mods: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function prepareIniFiles(installDir: string, gus: string, game: string): void {
  const dir = join(
    installDir,
    "ShooterGame",
    "Saved",
    "Config",
    "WindowsServer",
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "GameUserSettings.ini"), gus, "utf8");
  writeFileSync(join(dir, "Game.ini"), game, "utf8");
}

const MEMBER_GUS = [
  "[ServerSettings]",
  "MaxPlayers=20",
  "XPMultiplier=1",
  "RCONPort=27020",
  "ServerAdminPassword=admin1234",
  "ServerPassword=join",
  "",
  "[SessionSettings]",
  "SessionName=Ragnarok PvE",
  "Port=7777",
  "QueryPort=27015",
  "",
].join("\n");

function makeHarness(status: ServerStatus = "stopped") {
  const installDir = mkdtempSync(join(tmpdir(), "ark-cluster-ini-apply-"));
  tmpDirs.push(installDir);
  prepareIniFiles(
    installDir,
    MEMBER_GUS,
    "[/Script/ShooterGame.ShooterGameMode]\nHarvestAmountMultiplier=1\n",
  );

  const profile = makeProfile(installDir);
  const events: Array<{ message: string }> = [];
  const repo = {
    get: (id: string) => (id === profile.id ? profile : null),
    addEvent: (
      _serverId: string,
      _type: string,
      _severity: string,
      message: string,
    ) => {
      events.push({ message });
    },
  } as unknown as ServerRepository;

  db = openDatabase(":memory:");
  const templates = new ClusterIniTemplateRepository(db);
  templates.upsert("alpha", {
    gameUserSettings: "[ServerSettings]\nMaxPlayers=55\nXPMultiplier=3\n",
    game: "[/Script/ShooterGame.ShooterGameMode]\nHarvestAmountMultiplier=5\n",
  });

  const locks = new InstanceLockManager();
  const ini = new IniService(repo, locks);
  const backups = {
    createManualBackup: vi.fn(async () => {
      throw new Error("Install server files before creating or restoring backups");
    }),
  } as unknown as BackupService;

  const runtime = {
    getStatus: () => ({ status }),
  };

  const service = new ClusterIniTemplateApplyService(
    templates,
    repo,
    ini,
    locks,
    backups,
    runtime,
  );

  return { service, profile, templates, installDir, events, backups };
}

describe("ClusterIniTemplateApplyService", () => {
  it("restores a stopped member from the template and preserves profile-owned keys", async () => {
    const { service, profile, installDir, events } = makeHarness("stopped");
    const preview = await service.previewRestore("alpha", profile.id);
    expect(preview.preview.valid).toBe(true);
    expect(preview.preview.diff.some((row) => row.key === "RCONPort")).toBe(
      false,
    );
    expect(preview.preview.diff.some((row) => row.key === "SessionName")).toBe(
      false,
    );
    expect(preview.preview.changedCount).toBeGreaterThan(0);

    const result = await service.restore("alpha", profile.id);
    expect(result.operation).toBe("restore");
    expect(result.snapshotDir).not.toBeNull();

    const gus = readFileSync(
      join(
        installDir,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
        "GameUserSettings.ini",
      ),
      "utf8",
    );
    expect(gus).toContain("MaxPlayers=55");
    expect(gus).toContain("XPMultiplier=3");
    expect(gus).toContain("RCONPort=27020");
    expect(gus).toContain("ServerAdminPassword=admin1234");
    expect(gus).toContain("SessionName=Ragnarok PvE");
    expect(events.some((row) => /Restored INI from cluster template/i.test(row.message))).toBe(
      true,
    );
  });

  it("does not rewrite Server Information when restoring a template from another member", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "ark-cluster-ini-source-"));
    tmpDirs.push(sourceDir);
    prepareIniFiles(
      sourceDir,
      [
        "[ServerSettings]",
        "MaxPlayers=55",
        "XPMultiplier=3",
        "RCONPort=27030",
        "ServerAdminPassword=admin-b",
        "ServerPassword=join-b",
        "",
        "[SessionSettings]",
        "SessionName=Gabo Scorched yark-copy",
        "Port=7787",
        "QueryPort=27025",
        "",
      ].join("\n"),
      "[Custom]\nShared=1\n",
    );

    const target = makeHarness("stopped");
    const sourceProfile = makeProfile(sourceDir, {
      id: "srv-source",
      name: "Scorched",
      sessionName: "Gabo Scorched yark-copy",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
      adminPassword: "admin-b",
      serverPassword: "join-b",
    });

    const sourceRepo = {
      get: (id: string) => {
        if (id === sourceProfile.id) return sourceProfile;
        if (id === target.profile.id) return target.profile;
        return null;
      },
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    db?.close();
    db = openDatabase(":memory:");
    const templates = new ClusterIniTemplateRepository(db);
    const locks = new InstanceLockManager();
    const ini = new IniService(sourceRepo, locks);
    const service = new ClusterIniTemplateApplyService(
      templates,
      sourceRepo,
      ini,
      locks,
      {
        createManualBackup: vi.fn(async () => {
          throw new Error("Install server files before creating or restoring backups");
        }),
      } as unknown as BackupService,
      { getStatus: () => ({ status: "stopped" as const }) },
    );

    await service.promote("alpha", sourceProfile.id);
    const preview = await service.previewRestore("alpha", target.profile.id);
    expect(preview.preview.diff.some((row) => row.key === "RCONPort")).toBe(false);
    expect(preview.preview.diff.some((row) => row.key === "Port")).toBe(false);
    expect(preview.preview.diff.some((row) => row.key === "SessionName")).toBe(false);

    await service.restore("alpha", target.profile.id);
    const gus = readFileSync(
      join(
        target.installDir,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
        "GameUserSettings.ini",
      ),
      "utf8",
    );
    expect(gus).toContain("MaxPlayers=55");
    expect(gus).toContain("XPMultiplier=3");
    expect(gus).toContain("RCONPort=27020");
    expect(gus).toContain("Port=7777");
    expect(gus).toContain("QueryPort=27015");
    expect(gus).toContain("SessionName=Ragnarok PvE");
    expect(gus).not.toContain("7787");
    expect(gus).not.toContain("Gabo Scorched");
  });

  it("does not write member files when restore validation fails", async () => {
    const { service, profile, templates, installDir } = makeHarness("stopped");
    templates.upsert("alpha", {
      gameUserSettings: "[ServerSettings]\nMaxPlayers=999\n",
      game: "",
    });

    await expect(service.restore("alpha", profile.id)).rejects.toThrow(/MaxPlayers/i);

    const gus = readFileSync(
      join(
        installDir,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
        "GameUserSettings.ini",
      ),
      "utf8",
    );
    expect(gus).toContain("MaxPlayers=20");
    expect(gus).toContain("XPMultiplier=1");
  });

  it("rejects restore while the server is running and leaves files unchanged", async () => {
    const { service, profile, installDir } = makeHarness("running");
    await expect(service.restore("alpha", profile.id)).rejects.toThrow(/must be stopped/i);

    const gus = readFileSync(
      join(
        installDir,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
        "GameUserSettings.ini",
      ),
      "utf8",
    );
    expect(gus).toContain("MaxPlayers=20");
  });

  it("promotes a member into the template without changing install INI files", async () => {
    const { service, profile, templates, installDir } = makeHarness("stopped");
    const before = readFileSync(
      join(
        installDir,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
        "GameUserSettings.ini",
      ),
      "utf8",
    );

    const result = await service.promote("alpha", profile.id);
    expect(result.operation).toBe("promote");
    expect(result.template.payload.gameUserSettings).toContain("MaxPlayers=20");
    expect(result.template.payload.gameUserSettings).not.toMatch(/RCONPort=/i);

    const stored = templates.get("alpha");
    expect(stored?.payload.gameUserSettings).toContain("XPMultiplier=1");
    expect(stored?.payload.gameUserSettings).not.toMatch(/ServerAdminPassword=/i);

    const after = readFileSync(
      join(
        installDir,
        "ShooterGame",
        "Saved",
        "Config",
        "WindowsServer",
        "GameUserSettings.ini",
      ),
      "utf8",
    );
    expect(after).toBe(before);
  });

  it("seeds only after the server already belongs to the cluster", async () => {
    const { service, profile } = makeHarness("stopped");
    profile.clusterId = null;
    await expect(service.previewSeed("alpha", profile.id)).rejects.toThrow(
      /must join the cluster/i,
    );
    await expect(service.seed("alpha", profile.id)).rejects.toThrow(
      /must join the cluster/i,
    );
  });

  it("keeps the previous template when promote validation fails", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-cluster-ini-promote-fail-"));
    tmpDirs.push(installDir);
    prepareIniFiles(
      installDir,
      "[ServerSettings]\nMaxPlayers=999\n",
      "",
    );
    const profile = makeProfile(installDir);
    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    db = openDatabase(":memory:");
    const templates = new ClusterIniTemplateRepository(db);
    templates.upsert("alpha", {
      gameUserSettings: "[ServerSettings]\nMaxPlayers=40\n",
      game: "[Keep]\nA=1\n",
    });
    const locks = new InstanceLockManager();
    const service = new ClusterIniTemplateApplyService(
      templates,
      repo,
      new IniService(repo, locks),
      locks,
      { createManualBackup: vi.fn() } as unknown as BackupService,
      { getStatus: () => ({ status: "stopped" as const }) },
    );

    await expect(service.promote("alpha", profile.id)).rejects.toThrow(/MaxPlayers/i);
    const kept = templates.get("alpha");
    expect(kept?.payload.gameUserSettings).toContain("MaxPlayers=40");
    expect(kept?.payload.game).toContain("A=1");
  });
});
