import { describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ServerProfile, ServerStopProgress } from "@shared/types";

function makeProfile(id = "srv-1"): ServerProfile {
  const now = new Date().toISOString();
  return {
    id,
    name: "Stop Test",
    map: "TheIsland_WP",
    installDir: "C:/ARK/StopTest",
    enabled: true,
    autoStart: false,
    sessionName: "Session",
    maxPlayers: 70,
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
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

function makeRepo(profile: ServerProfile): ServerRepository {
  return {
    get: vi.fn((id: string) => (id === profile.id ? profile : null)),
    list: vi.fn(() => [profile]),
    addEvent: vi.fn(),
  } as unknown as ServerRepository;
}

function makeProcesses(
  profile: ServerProfile,
  overrides: Record<string, unknown> = {},
): ProcessManager {
  return {
    on: vi.fn(),
    isActive: vi.fn(() => true),
    getStatus: vi.fn(() => ({ status: "running" })),
    waitWhileStarting: vi.fn(async () => undefined),
    applyRuntimePorts: vi.fn((p: ServerProfile) => p),
    beginGracefulStop: vi.fn(async () => ({
      phase: "saved" as const,
      handle: { serverId: profile.id, identity: {} },
    })),
    finishGracefulStop: vi.fn(async () => "stopped" as const),
    kill: vi.fn(),
    ...overrides,
  } as unknown as ProcessManager;
}

describe("InstanceService.stop", () => {
  it("runs SaveWorld backup then finish, and emits progress phases", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const progress: ServerStopProgress[] = [];

    const processes = makeProcesses(profile);

    const backups = {
      createPreStopBackup: vi.fn(
        async (
          _id: string,
          options?: {
            onKindProgress?: (
              kind: "world" | "players" | "ini",
              index: number,
              total: number,
            ) => void;
          },
        ) => {
          options?.onKindProgress?.("world", 0, 3);
          options?.onKindProgress?.("players", 1, 3);
          options?.onKindProgress?.("ini", 2, 3);
          return [];
        },
      ),
    } as unknown as BackupService;

    const service = new InstanceService(repo, processes, backups, new InstanceLockManager());
    service.on("stop-progress", (payload: ServerStopProgress) => {
      progress.push(payload);
    });

    await service.stop(profile.id);

    expect(processes.beginGracefulStop).toHaveBeenCalledWith(profile);
    expect(backups.createPreStopBackup).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({ skipFlush: true }),
    );
    expect(processes.finishGracefulStop).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({ serverId: profile.id }),
    );
    expect(
      vi.mocked(processes.finishGracefulStop).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(backups.createPreStopBackup).mock.invocationCallOrder[0]!,
    );
    expect(repo.addEvent).toHaveBeenCalledWith(
      profile.id,
      "server_stopped",
      "info",
      expect.stringContaining("pre-stop backup"),
    );

    expect(progress.some((p) => p.active && p.phase === "saving")).toBe(true);
    expect(progress.some((p) => p.active && p.reason === "user")).toBe(true);
    expect(progress.some((p) => p.active && p.phase === "backing_up")).toBe(true);
    expect(progress.some((p) => p.active && p.phase === "stopping")).toBe(true);
    expect(
      progress
        .filter((p) => p.phase === "backing_up")
        .map((p) => p.percent),
    ).toEqual([40, 63, 85]);
    expect(progress.at(-1)).toMatchObject({
      serverId: profile.id,
      active: false,
    });
  });

  it("waits for starting servers before SaveWorld", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const progress: ServerStopProgress[] = [];
    let status: "starting" | "running" = "starting";
    const processes = makeProcesses(profile, {
      getStatus: vi.fn(() => ({ status })),
      waitWhileStarting: vi.fn(async () => {
        status = "running";
      }),
    });
    const backups = {
      createPreStopBackup: vi.fn(async () => []),
    } as unknown as BackupService;
    const service = new InstanceService(repo, processes, backups, new InstanceLockManager());
    service.on("stop-progress", (payload: ServerStopProgress) => {
      progress.push(payload);
    });

    await service.stop(profile.id);

    expect(processes.waitWhileStarting).toHaveBeenCalledWith(profile.id);
    expect(
      vi.mocked(processes.waitWhileStarting).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(processes.beginGracefulStop).mock.invocationCallOrder[0]!,
    );
    expect(progress.some((p) => p.active && p.phase === "waiting")).toBe(true);
    expect(progress.some((p) => p.label.includes("finish starting"))).toBe(true);
  });

  it("skips backup when backup:false", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    const backups = {
      createPreStopBackup: vi.fn(),
    } as unknown as BackupService;

    const service = new InstanceService(repo, processes, backups, new InstanceLockManager());
    await service.stop(profile.id, { backup: false });

    expect(backups.createPreStopBackup).not.toHaveBeenCalled();
    expect(processes.finishGracefulStop).toHaveBeenCalled();
    expect(repo.addEvent).toHaveBeenCalledWith(
      profile.id,
      "server_stopped",
      "info",
      expect.stringContaining("prior save"),
    );
  });

  it("continues stop when pre-stop backup fails", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    const backups = {
      createPreStopBackup: vi.fn(async () => {
        throw new Error("disk full");
      }),
    } as unknown as BackupService;

    const progress: ServerStopProgress[] = [];
    const service = new InstanceService(repo, processes, backups, new InstanceLockManager());
    service.on("stop-progress", (payload: ServerStopProgress) => {
      progress.push(payload);
    });

    await service.stop(profile.id);

    expect(processes.finishGracefulStop).toHaveBeenCalled();
    expect(repo.addEvent).toHaveBeenCalledWith(
      profile.id,
      "error",
      "warning",
      expect.stringContaining("Pre-stop backup failed"),
    );
    expect(
      progress.some((p) => p.label.includes("Backup failed — server remains stopped")),
    ).toBe(true);
  });

  it("does not backup when RCON kill path already terminated the process", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile, {
      beginGracefulStop: vi.fn(async () => ({
        phase: "killed" as const,
        handle: null,
      })),
    });
    const backups = {
      createPreStopBackup: vi.fn(),
    } as unknown as BackupService;

    const service = new InstanceService(repo, processes, backups, new InstanceLockManager());
    await service.stop(profile.id);

    expect(backups.createPreStopBackup).not.toHaveBeenCalled();
    expect(processes.finishGracefulStop).not.toHaveBeenCalled();
    expect(repo.addEvent).toHaveBeenCalledWith(
      profile.id,
      "server_stopped",
      "warning",
      expect.stringContaining("SaveWorld failed"),
    );
  });

  it("blocks force close and coalesces duplicate stops while backup is pending", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    let finishBackup!: () => void;
    const backupPending = new Promise<void>((resolve) => {
      finishBackup = resolve;
    });
    const processes = makeProcesses(profile);
    const backups = {
      createPreStopBackup: vi.fn(async () => {
        await backupPending;
        return [];
      }),
    } as unknown as BackupService;
    const service = new InstanceService(repo, processes, backups, new InstanceLockManager());

    const first = service.stop(profile.id);
    await vi.waitFor(() => {
      expect(backups.createPreStopBackup).toHaveBeenCalledTimes(1);
    });
    const second = service.stop(profile.id);

    expect(service.isStopInProgress(profile.id)).toBe(true);
    await expect(service.kill(profile.id)).rejects.toThrow(/disabled/i);
    expect(processes.kill).not.toHaveBeenCalled();

    finishBackup();
    await Promise.all([first, second]);
    expect(processes.beginGracefulStop).toHaveBeenCalledTimes(1);
    expect(backups.createPreStopBackup).toHaveBeenCalledTimes(1);
    expect(service.isStopInProgress(profile.id)).toBe(false);
  });

  it("finishes the stable backup when the process exited externally", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile, {
      finishGracefulStop: vi.fn(async () => "already_exited" as const),
    });
    const backups = {
      createPreStopBackup: vi.fn(async () => []),
    } as unknown as BackupService;
    const service = new InstanceService(repo, processes, backups, new InstanceLockManager());

    await service.stop(profile.id);

    expect(backups.createPreStopBackup).toHaveBeenCalled();
    expect(repo.addEvent).toHaveBeenCalledWith(
      profile.id,
      "server_stopped",
      "warning",
      expect.stringContaining("exited externally"),
    );
  });

  it("never backs up or stops a replacement process", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile, {
      finishGracefulStop: vi.fn(async () => "replaced" as const),
    });
    const backups = {
      createPreStopBackup: vi.fn(),
    } as unknown as BackupService;
    const service = new InstanceService(repo, processes, backups, new InstanceLockManager());

    await expect(service.stop(profile.id)).rejects.toThrow(/replacement|replaced/i);
    expect(backups.createPreStopBackup).not.toHaveBeenCalled();
  });

  it("rejects user start and stop while another operation owns the server", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    const backups = {} as BackupService;
    const locks = new InstanceLockManager();
    const service = new InstanceService(repo, processes, backups, locks);

    await locks.withLock(profile.id, "update", async () => {
      await expect(service.stop(profile.id)).rejects.toThrow(/running job/i);
      await expect(service.start(profile.id)).rejects.toThrow(/running job/i);
    });
  });
});
