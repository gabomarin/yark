import { mkdir, mkdtemp, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "@backend/infra/db/database";
import { PlayerSessionWatcher } from "@backend/domains/backups/player-session-watcher";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import * as rconClient from "@backend/infra/rcon/rcon-client";
import { EventEmitter } from "node:events";

function makeProfile(installDir: string): ServerProfile {
  return {
    id: "srv-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir,
    sessionName: "Island",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
}

function runningStatus(serverId: string): ServerRuntimeInfo {
  return {
    serverId,
    status: "running",
    pid: 1,
    startedAt: "2026-07-25T00:00:00.000Z",
    lastError: null,
  };
}

describe("PlayerSessionWatcher", () => {
  let db: DatabaseSync;
  let installDir: string;
  let profile: ServerProfile;
  const tmpDirs: string[] = [];

  beforeEach(async () => {
    db = openDatabase(":memory:");
    installDir = await mkdtemp(join(tmpdir(), "ark-session-"));
    tmpDirs.push(installDir);
    profile = makeProfile(installDir);
    await mkdir(join(installDir, "ShooterGame", "Saved", "SavedArks"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    db.close();
    vi.restoreAllMocks();
    for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
      // best-effort cleanup via vitest process exit; dirs are in tmp
      void dir;
    }
  });

  it("backs up players that join or leave after the seed snapshot", async () => {
    const createPlayerSessionBackup = vi.fn().mockResolvedValue(null);
    const backups = { createPlayerSessionBackup } as unknown as BackupService;
    const servers = {
      list: vi.fn(() => [profile]),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const processes = Object.assign(new EventEmitter(), {
      getStatus: vi.fn(() => runningStatus(profile.id)),
    }) as unknown as ProcessManager;

    const rcon = vi
      .spyOn(rconClient, "rconExec")
      .mockResolvedValueOnce("0. Alice, 76561198000000000\n")
      .mockResolvedValueOnce(
        "0. Alice, 76561198000000000\n1. Bob, 76561198000000001\n",
      )
      .mockResolvedValueOnce("0. Bob, 76561198000000001\n");

    const watcher = new PlayerSessionWatcher(backups, servers, processes, 60_000);

    await watcher.tick();
    expect(createPlayerSessionBackup).not.toHaveBeenCalled();

    await watcher.tick();
    expect(createPlayerSessionBackup).toHaveBeenCalledWith(
      profile.id,
      "connect",
      "76561198000000001",
      "Bob",
    );

    await watcher.tick();
    expect(createPlayerSessionBackup).toHaveBeenCalledWith(
      profile.id,
      "disconnect",
      "76561198000000000",
      "Alice",
    );

    expect(rcon).toHaveBeenCalledTimes(3);
    watcher.stop();
  });

  it("flushes disconnect backups when the server leaves running", async () => {
    const createPlayerSessionBackup = vi.fn().mockResolvedValue(null);
    const backups = { createPlayerSessionBackup } as unknown as BackupService;
    const servers = {
      list: vi.fn(() => [profile]),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    let status: ServerRuntimeInfo["status"] = "running";
    const processes = Object.assign(new EventEmitter(), {
      getStatus: vi.fn(() => ({
        ...runningStatus(profile.id),
        status,
      })),
    }) as unknown as ProcessManager;

    vi.spyOn(rconClient, "rconExec").mockResolvedValue(
      "0. Alice, 76561198000000000\n",
    );

    const watcher = new PlayerSessionWatcher(backups, servers, processes, 60_000);
    await watcher.tick(); // seed
    expect(createPlayerSessionBackup).not.toHaveBeenCalled();

    status = "stopping";
    await watcher.tick();

    expect(createPlayerSessionBackup).toHaveBeenCalledWith(
      profile.id,
      "disconnect",
      "76561198000000000",
      "Alice",
    );
    watcher.stop();
  });

  it("backs up a new profile file flushed after leave when RCON missed the session", async () => {
    const createPlayerSessionBackup = vi.fn().mockResolvedValue(null);
    const backups = { createPlayerSessionBackup } as unknown as BackupService;
    const servers = {
      list: vi.fn(() => [profile]),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const processes = Object.assign(new EventEmitter(), {
      getStatus: vi.fn(() => runningStatus(profile.id)),
    }) as unknown as ProcessManager;

    // RCON always empty — short join/leave never observed.
    vi.spyOn(rconClient, "rconExec").mockResolvedValue("No Players Connected");

    const watcher = new PlayerSessionWatcher(backups, servers, processes, 60_000);
    await watcher.tick(); // seed online + profile mtimes
    expect(createPlayerSessionBackup).not.toHaveBeenCalled();

    const profilePath = join(
      installDir,
      "ShooterGame",
      "Saved",
      "SavedArks",
      "0002abcdef0123456789.arkprofile",
    );
    await writeFile(profilePath, "NEW_PROFILE", "utf8");

    await watcher.tick();
    expect(createPlayerSessionBackup).toHaveBeenCalledWith(
      profile.id,
      "disconnect",
      "0002abcdef0123456789",
      null,
    );
    watcher.stop();
  });

  it("backs up when an existing profile mtime changes while player is offline", async () => {
    const createPlayerSessionBackup = vi.fn().mockResolvedValue(null);
    const backups = { createPlayerSessionBackup } as unknown as BackupService;
    const servers = {
      list: vi.fn(() => [profile]),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const processes = Object.assign(new EventEmitter(), {
      getStatus: vi.fn(() => runningStatus(profile.id)),
    }) as unknown as ProcessManager;

    const profilePath = join(
      installDir,
      "ShooterGame",
      "Saved",
      "SavedArks",
      "76561198000000000.arkprofile",
    );
    await writeFile(profilePath, "OLD", "utf8");
    const past = new Date(Date.now() - 60_000);
    await utimes(profilePath, past, past);

    vi.spyOn(rconClient, "rconExec").mockResolvedValue("No Players Connected");

    const watcher = new PlayerSessionWatcher(backups, servers, processes, 60_000);
    await watcher.tick(); // seed
    expect(createPlayerSessionBackup).not.toHaveBeenCalled();

    await writeFile(profilePath, "FLUSHED", "utf8");
    const now = new Date();
    await utimes(profilePath, now, now);

    await watcher.tick();
    expect(createPlayerSessionBackup).toHaveBeenCalledWith(
      profile.id,
      "disconnect",
      "76561198000000000",
      null,
    );
    watcher.stop();
  });
});
