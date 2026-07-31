import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateService } from "@backend/domains/updates/update-service";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { InstanceService } from "@backend/domains/instances/instance-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { BackupRecord, ServerProfile } from "@shared/types";

function makeProfile(id = "srv-update-1"): ServerProfile {
  const now = new Date().toISOString();
  return {
    id,
    name: "Safe Update Test",
    map: "TheIsland_WP",
    installDir: "C:/ARK/SafeUpdateTest",
    sessionName: "Session",
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

function makePreUpdateBackups(serverId: string): BackupRecord[] {
  const now = new Date().toISOString();
  return (["world", "players", "ini"] as const).map((kind, index) => ({
    id: `bu-${kind}`,
    serverId,
    type: "pre_update",
    kind,
    path: `C:/backups/${kind}.zip`,
    sizeBytes: 100 + index,
    status: "completed",
    createdAt: now,
    completedAt: now,
    notes: null,
  }));
}

type SteamStub = {
  code: number;
  stdout?: string;
  stderr?: string;
};

type Harness = {
  profile: ServerProfile;
  service: UpdateService;
  instances: {
    stop: ReturnType<typeof vi.fn>;
    startForMaintenance: ReturnType<typeof vi.fn>;
    isStopInProgress: ReturnType<typeof vi.fn>;
  };
  backups: {
    createPreUpdateBackupForJob: ReturnType<typeof vi.fn>;
    createPreStopBackup: ReturnType<typeof vi.fn>;
    restoreBackupForJob: ReturnType<typeof vi.fn>;
  };
  processes: {
    isActive: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
  };
  runSteamUpdate: ReturnType<typeof vi.fn>;
  waitForHealthy: ReturnType<typeof vi.fn>;
  performUpdate: () => Promise<void>;
  performVerify: () => Promise<void>;
  logDir: string;
};

function createHarness(options?: {
  wasRunning?: boolean;
  steam?: SteamStub | (() => SteamStub | Promise<SteamStub>);
  healthy?: boolean;
}): Harness {
  const profile = makeProfile();
  const wasRunning = options?.wasRunning ?? true;
  let active = wasRunning;
  const logDir = mkdtempSync(join(tmpdir(), "yark-update-"));

  const repo = {
    get: vi.fn((id: string) => (id === profile.id ? profile : null)),
    list: vi.fn(() => [profile]),
    addEvent: vi.fn(),
  } as unknown as ServerRepository;

  const backups = {
    createPreUpdateBackupForJob: vi.fn(async () => makePreUpdateBackups(profile.id)),
    createPreStopBackup: vi.fn(),
    restoreBackupForJob: vi.fn(async () => undefined),
  };

  const instances = {
    stop: vi.fn(async () => {
      active = false;
    }),
    startForMaintenance: vi.fn(async () => {
      active = true;
    }),
    isStopInProgress: vi.fn(() => false),
  };

  const processes = {
    isActive: vi.fn(() => active),
    getStatus: vi.fn(() => ({
      status: active ? ("running" as const) : ("stopped" as const),
    })),
  };

  const settings = {
    get: vi.fn(() => null),
    set: vi.fn(),
  } as unknown as AppSettingsRepository;

  const service = new UpdateService(
    repo,
    backups as unknown as BackupService,
    instances as unknown as InstanceService,
    processes as unknown as ProcessManager,
    new InstanceLockManager(),
    settings,
    logDir,
    join(logDir, "steamcmd"),
  );

  const steamFactory =
    options?.steam ??
    ((): SteamStub => ({ code: 0, stdout: "ok", stderr: "" }));

  const runSteamUpdate = vi.fn(async () => {
    const result =
      typeof steamFactory === "function" ? await steamFactory() : steamFactory;
    return {
      code: result.code,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  });
  const waitForHealthy = vi.fn(async () => options?.healthy ?? true);

  // Private orchestration seams — stub so no real SteamCMD/spawn runs.
  Object.assign(service as object, {
    runSteamUpdate,
    waitForHealthy,
  });

  return {
    profile,
    service,
    instances,
    backups,
    processes,
    runSteamUpdate,
    waitForHealthy,
    performUpdate: () =>
      (service as unknown as { performUpdateServer: (id: string) => Promise<void> })
        .performUpdateServer(profile.id),
    performVerify: () =>
      (
        service as unknown as {
          performVerifyServerFiles: (id: string) => Promise<void>;
        }
      ).performVerifyServerFiles(profile.id),
    logDir,
  };
}

describe("UpdateService safe update orchestration", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir !== undefined) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("stops without pre_stop, takes pre_update, then restarts when it was running", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);

    await h.performUpdate();

    expect(h.instances.stop).toHaveBeenCalledWith(h.profile.id, {
      backup: false,
    });
    expect(h.backups.createPreStopBackup).not.toHaveBeenCalled();
    expect(h.backups.createPreUpdateBackupForJob).toHaveBeenCalledWith(
      h.profile.id,
    );
    expect(h.runSteamUpdate).toHaveBeenCalled();
    expect(h.instances.startForMaintenance).toHaveBeenCalledWith(h.profile.id);
    expect(h.waitForHealthy).toHaveBeenCalled();

    const stopOrder = h.instances.stop.mock.invocationCallOrder[0]!;
    const backupOrder =
      h.backups.createPreUpdateBackupForJob.mock.invocationCallOrder[0]!;
    const steamOrder = h.runSteamUpdate.mock.invocationCallOrder[0]!;
    const startOrder =
      h.instances.startForMaintenance.mock.invocationCallOrder[0]!;
    expect(stopOrder).toBeLessThan(backupOrder);
    expect(backupOrder).toBeLessThan(steamOrder);
    expect(steamOrder).toBeLessThan(startOrder);
  });

  it("leaves an already-stopped server stopped after a successful update", async () => {
    const h = createHarness({ wasRunning: false });
    dirs.push(h.logDir);

    await h.performUpdate();

    expect(h.instances.stop).not.toHaveBeenCalled();
    expect(h.backups.createPreUpdateBackupForJob).toHaveBeenCalled();
    expect(h.instances.startForMaintenance).not.toHaveBeenCalled();
    expect(h.waitForHealthy).not.toHaveBeenCalled();
  });

  it("rolls back pre_update backups and restarts when SteamCMD fails while wasRunning", async () => {
    const h = createHarness({
      wasRunning: true,
      steam: { code: 1, stderr: "boom" },
    });
    dirs.push(h.logDir);

    await expect(h.performUpdate()).rejects.toThrow(/SteamCMD exited with code 1/);

    expect(h.backups.restoreBackupForJob).toHaveBeenCalledTimes(3);
    expect(h.backups.restoreBackupForJob).toHaveBeenCalledWith(
      h.profile.id,
      "bu-world",
    );
    expect(h.backups.restoreBackupForJob).toHaveBeenCalledWith(
      h.profile.id,
      "bu-players",
    );
    expect(h.backups.restoreBackupForJob).toHaveBeenCalledWith(
      h.profile.id,
      "bu-ini",
    );
    expect(h.instances.startForMaintenance).toHaveBeenCalledWith(h.profile.id);
    expect(h.waitForHealthy).toHaveBeenCalled();
  });

  it("verify stops and restarts when running, without pre_update or rollback", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);

    await h.performVerify();

    expect(h.instances.stop).toHaveBeenCalledWith(h.profile.id, {
      backup: false,
    });
    expect(h.backups.createPreUpdateBackupForJob).not.toHaveBeenCalled();
    expect(h.backups.restoreBackupForJob).not.toHaveBeenCalled();
    expect(h.instances.startForMaintenance).toHaveBeenCalledWith(h.profile.id);
  });

  it("rejects update while a stop+backup is in progress", async () => {
    const h = createHarness({ wasRunning: true });
    dirs.push(h.logDir);
    h.instances.isStopInProgress.mockReturnValue(true);

    await expect(h.service.updateServer(h.profile.id)).rejects.toThrow(
      "Server stop and backup are still in progress",
    );
    expect(h.runSteamUpdate).not.toHaveBeenCalled();
    expect(h.backups.createPreUpdateBackupForJob).not.toHaveBeenCalled();
  });
});
