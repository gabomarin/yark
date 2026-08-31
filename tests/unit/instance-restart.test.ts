import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ServerProfile } from "@shared/types";
import { inspectServerInstallationAsync } from "@backend/domains/instances/server-installation";

vi.mock("@backend/domains/instances/sync-profile-ini", () => ({
  syncProfileSettingsToIni: vi.fn(async () => undefined),
}));

vi.mock("@backend/infra/process/host-port-probe", () => ({
  assertHostPortsAvailable: vi.fn(async () => undefined),
}));

vi.mock("@backend/domains/instances/server-installation", () => ({
  inspectServerInstallation: vi.fn(),
  inspectServerInstallationAsync: vi.fn(),
  readOfficialArkVersionCached: vi.fn(),
  readOfficialArkBuildCached: vi.fn(),
}));

function readyInstallation(serverId: string) {
  return {
    serverId,
    installed: true,
    health: "ready" as const,
    reasonCodes: ["ready"],
    guidance: "Installation looks ready to start.",
    build: null,
    steamBuild: null,
    arkVersion: null,
    version: null,
    binaryPath: "C:/ARK/RestartTest/ShooterGame/Binaries/Win64/ArkAscendedServer.exe",
    checkedAt: new Date().toISOString(),
  };
}

function makeProfile(id = "srv-1"): ServerProfile {
  const now = new Date().toISOString();
  return {
    id,
    name: "Restart Test",
    map: "TheIsland_WP",
    installDir: "C:/ARK/RestartTest",
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

function makeProcesses(profile: ServerProfile, active = true) {
  let isActive = active;
  return {
    on: vi.fn(),
    isActive: vi.fn(() => isActive),
    getStatus: vi.fn(() => ({
      serverId: profile.id,
      status: isActive ? ("running" as const) : ("stopped" as const),
      pid: isActive ? 1 : null,
      startedAt: null,
      lastError: null,
    })),
    waitWhileStarting: vi.fn(async () => undefined),
    applyRuntimePorts: vi.fn((p: ServerProfile) => p),
    beginGracefulStop: vi.fn(async () => {
      return {
        phase: "saved" as const,
        handle: { serverId: profile.id, identity: {} },
      };
    }),
    finishGracefulStop: vi.fn(async () => {
      isActive = false;
      return "stopped" as const;
    }),
    start: vi.fn(() => {
      isActive = true;
    }),
  } as unknown as ProcessManager & {
    isActive: ReturnType<typeof vi.fn>;
    beginGracefulStop: ReturnType<typeof vi.fn>;
    finishGracefulStop: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  };
}

describe("InstanceService.restart", () => {
  beforeEach(() => {
    vi.mocked(inspectServerInstallationAsync).mockImplementation(async (serverId: string) =>
      readyInstallation(serverId),
    );
  });

  it("stops without pre_stop, then fail-hard pre_restart, then starts", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    const backups = {
      createPreStopBackup: vi.fn(),
      createPreRestartBackup: vi.fn(async () => []),
    } as unknown as BackupService;

    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
    );

    await service.restart(profile.id, { openNativeConsole: true });

    expect(backups.createPreStopBackup).not.toHaveBeenCalled();
    expect(backups.createPreRestartBackup).toHaveBeenCalledWith(
      profile.id,
      expect.objectContaining({ skipFlush: true }),
    );
    expect(processes.start).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({ openNativeConsole: true }),
    );

    const stopOrder = vi.mocked(processes.finishGracefulStop).mock
      .invocationCallOrder[0]!;
    const backupOrder = vi.mocked(backups.createPreRestartBackup).mock
      .invocationCallOrder[0]!;
    const startOrder = vi.mocked(processes.start).mock.invocationCallOrder[0]!;
    expect(stopOrder).toBeLessThan(backupOrder);
    expect(backupOrder).toBeLessThan(startOrder);
  });

  it("applies Settings Show server console when restart omits openNativeConsole", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    const backups = {
      createPreStopBackup: vi.fn(),
      createPreRestartBackup: vi.fn(async () => []),
    } as unknown as BackupService;

    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
      { resolveOpenNativeConsole: () => true },
    );

    await service.restart(profile.id);

    expect(processes.start).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({ openNativeConsole: true }),
    );
  });

  it("rejects when the server is not running", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile, false);
    const backups = {
      createPreRestartBackup: vi.fn(),
    } as unknown as BackupService;

    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
    );

    await expect(service.restart(profile.id)).rejects.toThrow(
      "Server is not running",
    );
    expect(backups.createPreRestartBackup).not.toHaveBeenCalled();
    expect(processes.start).not.toHaveBeenCalled();
  });

  it("aborts start when pre_restart backup fails", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    const backups = {
      createPreRestartBackup: vi.fn(async () => {
        throw new Error("disk full");
      }),
    } as unknown as BackupService;

    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
    );

    await expect(service.restart(profile.id)).rejects.toThrow("disk full");
    expect(processes.finishGracefulStop).toHaveBeenCalled();
    expect(processes.start).not.toHaveBeenCalled();
    expect(processes.isActive()).toBe(false);
  });

  it("leaves the server stopped when start fails after backup", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    vi.mocked(processes.start).mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const backups = {
      createPreRestartBackup: vi.fn(async () => []),
    } as unknown as BackupService;

    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
    );

    await expect(service.restart(profile.id)).rejects.toThrow("spawn failed");
    expect(backups.createPreRestartBackup).toHaveBeenCalled();
    expect(processes.isActive()).toBe(false);
  });

  it("aborts when stop fails because the process was replaced", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    vi.mocked(processes.finishGracefulStop).mockResolvedValue("replaced");
    const backups = {
      createPreRestartBackup: vi.fn(),
    } as unknown as BackupService;

    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
    );

    await expect(service.restart(profile.id)).rejects.toThrow(/replaced/);
    expect(backups.createPreRestartBackup).not.toHaveBeenCalled();
    expect(processes.start).not.toHaveBeenCalled();
  });

  it("aborts when SaveWorld fails and the process is force-killed", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    vi.mocked(processes.beginGracefulStop).mockResolvedValue({
      phase: "killed",
      handle: null,
    });
    const backups = {
      createPreRestartBackup: vi.fn(),
    } as unknown as BackupService;

    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
    );

    await expect(service.restart(profile.id)).rejects.toThrow(
      /SaveWorld failed and the process was force-killed/,
    );
    expect(backups.createPreRestartBackup).not.toHaveBeenCalled();
    expect(processes.start).not.toHaveBeenCalled();
    expect(processes.finishGracefulStop).not.toHaveBeenCalled();
  });

  it("rejects when another instance lock is held", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    const backups = {
      createPreRestartBackup: vi.fn(),
    } as unknown as BackupService;
    const locks = new InstanceLockManager();

    const service = new InstanceService(repo, processes, backups, locks);

    await expect(
      locks.withLock(profile.id, "update", async () => {
        await service.restart(profile.id);
      }),
    ).rejects.toThrow(/already has a running job \(update\)/);
    expect(backups.createPreRestartBackup).not.toHaveBeenCalled();
    expect(processes.start).not.toHaveBeenCalled();
  });

  it("keeps quit/kill/stop blocked during pre_restart backup after stopJobs clear", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    let finishBackup!: () => void;
    const backupPending = new Promise<void>((resolve) => {
      finishBackup = resolve;
    });
    const backups = {
      createPreRestartBackup: vi.fn(async () => {
        await backupPending;
        return [];
      }),
    } as unknown as BackupService;

    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
    );

    const restartPromise = service.restart(profile.id);

    await vi.waitFor(() => {
      expect(backups.createPreRestartBackup).toHaveBeenCalled();
    });

    expect(service.isStopInProgress(profile.id)).toBe(true);
    expect(service.isStopInProgress()).toBe(true);
    await expect(service.kill(profile.id)).rejects.toThrow(/restart backup is in progress/);
    await expect(service.stop(profile.id)).rejects.toThrow(
      /restart is in progress/,
    );
    await expect(service.start(profile.id)).rejects.toThrow(
      /stop and backup are still in progress/,
    );

    const waitPromise = service.waitForStopJobs();
    finishBackup();
    await waitPromise;
    expect(service.isStopInProgress(profile.id)).toBe(false);

    await restartPromise;
    expect(processes.start).toHaveBeenCalled();
  });

  it("clears the critical job before start so quit can stop leftover processes", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    const processes = makeProcesses(profile);
    let finishStart!: () => void;
    const startGate = new Promise<void>((resolve) => {
      finishStart = resolve;
    });
    const backups = {
      createPreRestartBackup: vi.fn(async () => []),
      createPreStopBackup: vi.fn(async () => []),
    } as unknown as BackupService;
    const locks = new InstanceLockManager();
    const service = new InstanceService(repo, processes, backups, locks);

    const syncMod = await import("@backend/domains/instances/sync-profile-ini");
    vi.mocked(syncMod.syncProfileSettingsToIni).mockImplementation(async () => {
      await startGate;
    });

    try {
      const restartPromise = service.restart(profile.id);
      await vi.waitFor(() => {
        expect(backups.createPreRestartBackup).toHaveBeenCalled();
      });
      await vi.waitFor(() => {
        expect(service.isStopInProgress(profile.id)).toBe(false);
      });
      expect(service.shouldBlockAppQuit()).toBe(true);
      expect(locks.isLocked(profile.id)).toBe(true);

      const stopsBeforeQuit = vi.mocked(processes.beginGracefulStop).mock.calls.length;

      // Simulate quit during the post-backup / pre-start window.
      const settlePromise = service.settleForAppQuit();
      finishStart();
      await restartPromise;
      await settlePromise;

      expect(vi.mocked(processes.beginGracefulStop).mock.calls.length).toBeGreaterThan(
        stopsBeforeQuit,
      );
      expect(backups.createPreStopBackup).toHaveBeenCalled();
      expect(processes.isActive(profile.id)).toBe(false);
      expect(service.shouldBlockAppQuit()).toBe(false);
    } finally {
      vi.mocked(syncMod.syncProfileSettingsToIni).mockImplementation(
        async () => undefined,
      );
    }
  });

  it("rejects concurrent Stop during restart stop instead of coalescing without backup", async () => {
    const profile = makeProfile();
    const repo = makeRepo(profile);
    let releaseStop!: () => void;
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    const processes = makeProcesses(profile);
    vi.mocked(processes.beginGracefulStop).mockImplementation(async () => {
      await stopGate;
      return {
        phase: "saved" as const,
        handle: { serverId: profile.id, identity: {} },
      };
    });
    const backups = {
      createPreRestartBackup: vi.fn(async () => []),
    } as unknown as BackupService;

    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
    );

    const restartPromise = service.restart(profile.id);
    await vi.waitFor(() => {
      expect(processes.beginGracefulStop).toHaveBeenCalled();
    });

    await expect(service.stop(profile.id)).rejects.toThrow(
      /restart is in progress/,
    );

    releaseStop();
    await restartPromise;
    expect(backups.createPreRestartBackup).toHaveBeenCalled();
  });
});
