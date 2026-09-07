import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerProfile } from "@shared/types";
import { IniService } from "@backend/domains/config/ini-service";
import { openDatabase } from "@backend/infra/db/database";
import { PendingServerIniRepository } from "@backend/infra/db/pending-server-ini-repository";
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
    useAsaApi: false,
    useAsaApiLoader: false,
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

function makeService(
  installDir: string,
  options?: {
    addEvent?: ReturnType<typeof vi.fn>;
    isServerActive?: () => boolean;
    withPending?: boolean;
  },
) {
  const profile = makeProfile(installDir);
  const addEvent = options?.addEvent ?? vi.fn();
  const repo = {
    get: (id: string) => (id === profile.id ? profile : null),
    addEvent,
  } as unknown as ServerRepository;

  const locks = new InstanceLockManager();
  if (options?.withPending === true) {
    const db = openDatabase(":memory:");
    const pending = new PendingServerIniRepository(db);
    return {
      service: new IniService(repo, locks, {
        pending,
        isServerActive: options.isServerActive ?? (() => false),
      }),
      profile,
      addEvent,
      locks,
      pending,
      db,
    };
  }

  return {
    service: new IniService(repo, locks),
    profile,
    addEvent,
    locks,
    pending: null,
    db: null,
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

  it("does not treat leftover SessionSettings MaxPlayers as a semantic error", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile } = makeService(installDir);
    const preview = await service.previewServerIni(profile.id, {
      gameUserSettings: "[SessionSettings]\nMaxPlayers=0\nSessionName=Test\n",
      game: "",
    });

    expect(preview.issues.some((i) => i.message.includes("MaxPlayers"))).toBe(
      false,
    );
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
    expect(preview.pending).toBe(false);
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

    expect(snapshot.pending).toBe(false);
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

describe("IniService pending queue (#530)", () => {
  it("queues GUS and Game.ini while active without writing live files", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);
    writeFileSync(
      gameUserSettingsPath(installDir),
      "[ServerSettings]\nRCONPort=27020\n",
      "utf8",
    );
    writeFileSync(gameIniPath(installDir), "[Game]\nFoo=1\n", "utf8");

    const { service, profile, pending, db } = makeService(installDir, {
      withPending: true,
      isServerActive: () => true,
    });

    const changed: Array<{ serverId: string; pending: boolean }> = [];
    service.on("changed", (payload) => changed.push(payload));

    const result = await service.saveServerIni(profile.id, {
      gameUserSettings: "[ServerSettings]\nRCONPort=27020\nXPMultiplier=2.0\n",
      game: "[Game]\nFoo=1\nBar=2\n",
    });

    expect(result.pending).toBe(true);
    expect(result.valid).toBe(true);
    expect(readFileSync(gameUserSettingsPath(installDir), "utf8")).toBe(
      "[ServerSettings]\nRCONPort=27020\n",
    );
    expect(readFileSync(gameIniPath(installDir), "utf8")).toBe("[Game]\nFoo=1\n");
    expect(pending?.get(profile.id)?.payload.gameUserSettings).toContain(
      "XPMultiplier=2.0",
    );
    expect(pending?.get(profile.id)?.payload.game).toContain("Bar=2");
    expect(changed).toEqual([{ serverId: profile.id, pending: true }]);

    const snapshot = await service.readServerIni(profile.id);
    expect(snapshot.pending).toBe(true);
    expect(snapshot.payload.gameUserSettings).toContain("XPMultiplier=2.0");
    expect(snapshot.payload.game).toContain("Bar=2");

    db?.close();
  });

  it("replaces a prior queued draft on a second save while active", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile, pending, db } = makeService(installDir, {
      withPending: true,
      isServerActive: () => true,
    });

    await service.saveServerIni(profile.id, {
      gameUserSettings: "[ServerSettings]\nRCONPort=27020\nXPMultiplier=2.0\n",
      game: "[Game]\nA=1\n",
    });
    await service.saveServerIni(profile.id, {
      gameUserSettings: "[ServerSettings]\nRCONPort=27020\nXPMultiplier=3.0\n",
      game: "[Game]\nA=2\n",
    });

    expect(pending?.get(profile.id)?.payload.gameUserSettings).toContain(
      "XPMultiplier=3.0",
    );
    expect(pending?.get(profile.id)?.payload.game).toContain("A=2");
    db?.close();
  });

  it("flushes pending INI to disk when idle and clears the queue", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);
    writeFileSync(
      gameUserSettingsPath(installDir),
      "[ServerSettings]\nRCONPort=27020\n",
      "utf8",
    );

    let active = true;
    const { service, profile, pending, locks, db } = makeService(installDir, {
      withPending: true,
      isServerActive: () => active,
    });

    await service.saveServerIni(profile.id, {
      gameUserSettings: "[ServerSettings]\nRCONPort=27020\nXPMultiplier=2.5\n",
      game: "[Game]\nQueued=1\n",
    });
    active = false;

    const changed: Array<{ pending: boolean }> = [];
    service.on("changed", (payload) => changed.push({ pending: payload.pending }));

    // Simulate stop holding the instance lock (must not deadlock on flush).
    await locks.withLock(profile.id, "stop-and-backup", async () => {
      const flushed = await service.flushPendingServerIni(profile.id);
      expect(flushed).toBe(true);
    });

    expect(pending?.get(profile.id)).toBeNull();
    expect(readFileSync(gameUserSettingsPath(installDir), "utf8")).toContain(
      "XPMultiplier=2.5",
    );
    expect(readFileSync(gameIniPath(installDir), "utf8")).toContain("Queued=1");
    expect(changed.at(-1)).toEqual({ pending: false });

    const after = await service.readServerIni(profile.id);
    expect(after.pending).toBe(false);
    expect(after.payload.gameUserSettings).toContain("XPMultiplier=2.5");

    const second = await service.flushPendingServerIni(profile.id);
    expect(second).toBe(false);
    db?.close();
  });

  it("writes immediately when stopped and clears any leftover pending row", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const { service, profile, pending, db } = makeService(installDir, {
      withPending: true,
      isServerActive: () => false,
    });
    pending?.upsert(profile.id, {
      gameUserSettings: "[ServerSettings]\nRCONPort=27020\nStale=1\n",
      game: "",
    });

    const result = await service.saveServerIni(profile.id, {
      gameUserSettings: "[ServerSettings]\nRCONPort=27020\nFresh=1\n",
      game: "[Game]\nOk=1\n",
    });

    expect(result.pending).toBe(false);
    expect(pending?.get(profile.id)).toBeNull();
    expect(readFileSync(gameUserSettingsPath(installDir), "utf8")).toContain("Fresh=1");
    expect(readFileSync(gameIniPath(installDir), "utf8")).toContain("Ok=1");
    db?.close();
  });

  it("queues profile-owned keys while active without writing live GUS", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);
    writeFileSync(
      gameUserSettingsPath(installDir),
      "[ServerSettings]\nRCONPort=27020\nXPMultiplier=1.0\n\n[SessionSettings]\nSessionName=DiskSession\n",
      "utf8",
    );

    const profile = makeProfile(installDir);
    profile.sessionName = "QueuedFromServerTab";
    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const db = openDatabase(":memory:");
    const pendingRepo = new PendingServerIniRepository(db);
    const service = new IniService(repo, new InstanceLockManager(), {
      pending: pendingRepo,
      isServerActive: () => true,
    });

    await service.syncProfileOwnedKeys(profile.id, profile);

    expect(readFileSync(gameUserSettingsPath(installDir), "utf8")).toContain(
      "DiskSession",
    );
    expect(readFileSync(gameUserSettingsPath(installDir), "utf8")).not.toContain(
      "QueuedFromServerTab",
    );
    const pending = pendingRepo.get(profile.id);
    expect(pending?.payload.gameUserSettings).toContain("QueuedFromServerTab");
    expect(pending?.payload.gameUserSettings).toContain("XPMultiplier=1.0");
    db.close();
  });

  it("merges profile sync into an existing gameplay pending draft while active", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const profile = makeProfile(installDir);
    profile.sessionName = "First";
    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const db = openDatabase(":memory:");
    const pendingRepo = new PendingServerIniRepository(db);
    const service = new IniService(repo, new InstanceLockManager(), {
      pending: pendingRepo,
      isServerActive: () => true,
    });

    await service.saveServerIni(profile.id, {
      gameUserSettings:
        "[ServerSettings]\nRCONPort=27020\nXPMultiplier=3.0\n\n[SessionSettings]\nSessionName=First\n",
      game: "[Game]\nKeep=1\n",
    });
    profile.sessionName = "AfterServerTab";
    await service.syncProfileOwnedKeys(profile.id, profile);

    const pending = pendingRepo.get(profile.id);
    expect(pending?.payload.gameUserSettings).toContain("AfterServerTab");
    expect(pending?.payload.gameUserSettings).toContain("XPMultiplier=3.0");
    expect(pending?.payload.game).toContain("Keep=1");
    expect(readFileSync(gameUserSettingsPath(installDir), "utf8")).not.toContain(
      "AfterServerTab",
    );
    db.close();
  });

  it("keeps Server-tab profile keys over an older pending draft on flush", async () => {
    const installDir = mkdtempSync(join(tmpdir(), "ark-ini-"));
    tmpDirs.push(installDir);
    prepareIniFiles(installDir);

    const profile = makeProfile(installDir);
    profile.sessionName = "OriginalSession";
    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const locks = new InstanceLockManager();
    const db = openDatabase(":memory:");
    const pendingRepo = new PendingServerIniRepository(db);
    let active = true;
    const service = new IniService(repo, locks, {
      pending: pendingRepo,
      isServerActive: () => active,
    });

    await service.saveServerIni(profile.id, {
      gameUserSettings:
        "[ServerSettings]\nRCONPort=27020\nXPMultiplier=2.0\n\n[SessionSettings]\nSessionName=OriginalSession\n",
      game: "[Game]\nQueued=1\n",
    });

    profile.sessionName = "UpdatedFromServerTab";
    active = false;

    const snapshot = await service.readServerIni(profile.id);
    expect(snapshot.pending).toBe(true);
    expect(snapshot.payload.gameUserSettings).toContain("UpdatedFromServerTab");
    expect(snapshot.payload.gameUserSettings).toContain("XPMultiplier=2.0");

    await service.flushPendingServerIni(profile.id);

    const gus = readFileSync(gameUserSettingsPath(installDir), "utf8");
    expect(gus).toContain("UpdatedFromServerTab");
    expect(gus).not.toContain("OriginalSession");
    expect(gus).toContain("XPMultiplier=2.0");
    expect(readFileSync(gameIniPath(installDir), "utf8")).toContain("Queued=1");
    db.close();
  });
});

