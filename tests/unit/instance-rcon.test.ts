import { describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile } from "@shared/types";

const profile: ServerProfile = {
  id: "srv-1",
  name: "Island",
  map: "TheIsland_WP",
  installDir: "C:\\ARK\\Island",
  enabled: true,
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
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

function makeService(sessions: {
  getStatus: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  disconnect?: ReturnType<typeof vi.fn>;
}): InstanceService {
  const repo = {
    get: vi.fn(() => profile),
    addEvent: vi.fn(),
  } as unknown as ServerRepository;
  const processes = {
    on: vi.fn(),
    isActive: vi.fn(() => true),
    getStatus: vi.fn(() => ({
      serverId: profile.id,
      status: "running" as const,
      pid: 1,
      startedAt: "2026-08-03T00:00:00.000Z",
      lastError: null,
    })),
    applyRuntimePorts: vi.fn(() => profile),
  } as unknown as ProcessManager;
  const service = new InstanceService(
    repo,
    processes,
    {} as BackupService,
    new InstanceLockManager(),
  );
  (
    service as unknown as {
      rconSessions: typeof sessions;
    }
  ).rconSessions = sessions;
  return service;
}

describe("InstanceService.retryRconConnection", () => {
  it("does not connect until the RCON port is ready", async () => {
    const sessions = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(),
      getStatus: vi.fn(() => ({
        serverId: profile.id,
        status: "disconnected" as const,
        lastError: null,
      })),
      send: vi.fn(),
    };
    const service = makeService(sessions);
    const waitForPortReady = vi
      .spyOn(
        service as unknown as {
          waitForPortReady: (host: string, port: number, timeoutMs?: number) => Promise<boolean>;
        },
        "waitForPortReady",
      )
      .mockResolvedValue(false);

    await (service as unknown as { autoConnectRcon(profile: ServerProfile): Promise<void> }).autoConnectRcon(profile);

    expect(waitForPortReady).toHaveBeenCalledWith("127.0.0.1", profile.rconPort, expect.any(Number));
    expect(sessions.connect).not.toHaveBeenCalled();
  });

  it("replaces the failed session and reconnects with the active runtime port", async () => {
    const runtimeProfile = { ...profile, rconPort: 37020 };
    const repo = {
      get: vi.fn(() => profile),
    } as unknown as ServerRepository;
    const processes = {
      on: vi.fn(),
      isActive: vi.fn(() => true),
      applyRuntimePorts: vi.fn(() => runtimeProfile),
    } as unknown as ProcessManager;
    const service = new InstanceService(
      repo,
      processes,
      {} as BackupService,
      new InstanceLockManager(),
    );
    const sessions = {
      disconnect: vi.fn(),
      connect: vi.fn(async () => undefined),
    };
    (
      service as unknown as {
        rconSessions: typeof sessions;
      }
    ).rconSessions = sessions;

    await service.retryRconConnection(profile.id);

    expect(sessions.disconnect).toHaveBeenCalledWith(profile.id);
    expect(sessions.connect).toHaveBeenCalledWith(
      profile.id,
      "127.0.0.1",
      runtimeProfile.rconPort,
      profile.adminPassword,
    );
  });
});

describe("InstanceService.execRcon", () => {
  it("records an audit event for operator commands by default", async () => {
    const sessions = {
      getStatus: vi.fn(() => ({
        serverId: profile.id,
        status: "connected" as const,
        lastError: null,
      })),
      connect: vi.fn(),
      send: vi.fn(async () => "ok"),
    };
    const service = makeService(sessions);
    const repo = (
      service as unknown as { repo: { addEvent: ReturnType<typeof vi.fn> } }
    ).repo;

    await service.sendRcon(profile.id, "SaveWorld");

    expect(sessions.send).toHaveBeenCalledWith(profile.id, "SaveWorld");
    expect(repo.addEvent).toHaveBeenCalled();
  });

  it("skips audit events for silent internal commands", async () => {
    const sessions = {
      getStatus: vi.fn(() => ({
        serverId: profile.id,
        status: "connected" as const,
        lastError: null,
      })),
      connect: vi.fn(),
      send: vi.fn(async () => "0. Alice, 76561198000000000"),
    };
    const service = makeService(sessions);
    const repo = (
      service as unknown as { repo: { addEvent: ReturnType<typeof vi.fn> } }
    ).repo;

    const players = await service.listPlayers(profile.id);

    expect(sessions.send).toHaveBeenCalledWith(profile.id, "ListPlayers");
    expect(repo.addEvent).not.toHaveBeenCalled();
    expect(players).toEqual([
      { key: "76561198000000000", name: "Alice" },
    ]);
  });

  it("sends KickPlayer, BanPlayer, and Unban with the player key", async () => {
    const sessions = {
      getStatus: vi.fn(() => ({
        serverId: profile.id,
        status: "connected" as const,
        lastError: null,
      })),
      connect: vi.fn(),
      send: vi.fn(async () => ""),
    };
    const service = makeService(sessions);

    await service.kickPlayer(profile.id, "76561198000000000");
    await service.banPlayer(profile.id, "0002e03af5f4487985e94c6ba4080369");

    expect(sessions.send).toHaveBeenNthCalledWith(
      1,
      profile.id,
      "KickPlayer 76561198000000000",
    );
    expect(sessions.send).toHaveBeenNthCalledWith(
      2,
      profile.id,
      "BanPlayer 0002e03af5f4487985e94c6ba4080369",
    );
  });

  it("sends Unban (not UnbanPlayer) when unbanning", async () => {
    const sessions = {
      getStatus: vi.fn(() => ({
        serverId: profile.id,
        status: "connected" as const,
        lastError: null,
      })),
      connect: vi.fn(),
      send: vi.fn(async () => ""),
    };
    const service = makeService(sessions);
    const banList = await import("@backend/domains/instances/ban-list");
    vi.spyOn(banList, "resolveBanListId").mockResolvedValue("76561198000000000");
    vi.spyOn(banList, "removeFromBanList").mockResolvedValue([]);
    vi.spyOn(banList, "readBanList").mockResolvedValue([]);

    const result = await service.unbanPlayer(profile.id, "76561198000000000");

    expect(sessions.send).toHaveBeenCalledWith(
      profile.id,
      "Unban 76561198000000000",
    );
    expect(result.banned).toEqual([]);
    expect(result.warning).toBeNull();
  });
});
