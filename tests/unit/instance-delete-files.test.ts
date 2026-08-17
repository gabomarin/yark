import { mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile } from "@shared/types";

const tmpDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

function makeProfile(installDir: string, id = "srv-1"): ServerProfile {
  const now = new Date().toISOString();
  return {
    id,
    name: "Delete Me",
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
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeService(
  repo: ServerRepository,
  processes: ProcessManager,
): InstanceService {
  const backups = {} as import("@backend/domains/backups/backup-service").BackupService;
  return new InstanceService(repo, processes, backups, new InstanceLockManager());
}

describe("InstanceService.delete", () => {
  it("deletes the profile and the install folder from disk when wipe is requested", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-delete-"));
    tmpDirs.push(installDir);
    await mkdir(join(installDir, "ShooterGame"), { recursive: true });
    await writeFile(join(installDir, "marker.txt"), "x", "utf8");

    const profile = makeProfile(installDir);
    const repo = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      delete: vi.fn(() => true),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const processes = {
      on: vi.fn(),
      isActive: vi.fn(() => false),
    } as unknown as ProcessManager;

    const service = makeService(repo, processes);
    await service.delete(profile.id, { deleteInstallFiles: true });

    expect(repo.delete).toHaveBeenCalledWith(profile.id);
    expect(repo.addEvent).toHaveBeenCalledWith(
      null,
      "server_deleted",
      "info",
      expect.stringMatching(/profile \+ files/),
    );
    await expect(access(installDir, fsConstants.F_OK)).rejects.toThrow();
  });

  it("removes the profile and keeps install files when wipe is not requested", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-delete-keep-"));
    tmpDirs.push(installDir);
    await writeFile(join(installDir, "marker.txt"), "x", "utf8");

    const profile = makeProfile(installDir);
    const repo = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      delete: vi.fn(() => true),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const processes = {
      on: vi.fn(),
      isActive: vi.fn(() => false),
    } as unknown as ProcessManager;

    const service = makeService(repo, processes);
    await service.delete(profile.id, { deleteInstallFiles: false });

    expect(repo.delete).toHaveBeenCalledWith(profile.id);
    expect(repo.addEvent).toHaveBeenCalledWith(
      null,
      "server_deleted",
      "info",
      expect.stringMatching(/files kept at/),
    );
    await expect(
      access(join(installDir, "marker.txt"), fsConstants.F_OK),
    ).resolves.toBeUndefined();
  });

  it("does not wipe disk when another profile shares the same installDir", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-delete-shared-"));
    tmpDirs.push(installDir);
    await writeFile(join(installDir, "marker.txt"), "x", "utf8");

    const profile = makeProfile(installDir, "srv-a");
    const clone = makeProfile(installDir, "srv-b");
    clone.name = "Clone";

    const repo = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile, clone]),
      delete: vi.fn(() => true),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const processes = {
      on: vi.fn(),
      isActive: vi.fn(() => false),
    } as unknown as ProcessManager;

    const service = makeService(repo, processes);
    await expect(
      service.delete(profile.id, { deleteInstallFiles: true }),
    ).rejects.toThrow(/also used by/i);
    expect(repo.delete).not.toHaveBeenCalled();
    await expect(
      access(join(installDir, "marker.txt"), fsConstants.F_OK),
    ).resolves.toBeUndefined();
  });

  it("allows profile-only remove when another profile shares the same installDir", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-delete-shared-keep-"));
    tmpDirs.push(installDir);
    await writeFile(join(installDir, "marker.txt"), "x", "utf8");

    const profile = makeProfile(installDir, "srv-a");
    const clone = makeProfile(installDir, "srv-b");
    clone.name = "Clone";

    const repo = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile, clone]),
      delete: vi.fn(() => true),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const processes = {
      on: vi.fn(),
      isActive: vi.fn(() => false),
    } as unknown as ProcessManager;

    const service = makeService(repo, processes);
    await service.delete(profile.id, { deleteInstallFiles: false });

    expect(repo.delete).toHaveBeenCalledWith(profile.id);
    await expect(
      access(join(installDir, "marker.txt"), fsConstants.F_OK),
    ).resolves.toBeUndefined();
  });

  it("rejects both modes while the server process is active", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-delete-running-"));
    tmpDirs.push(installDir);
    await writeFile(join(installDir, "marker.txt"), "x", "utf8");

    const profile = makeProfile(installDir);
    const repo = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      delete: vi.fn(() => true),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const processes = {
      on: vi.fn(),
      isActive: vi.fn(() => true),
    } as unknown as ProcessManager;

    const service = makeService(repo, processes);

    await expect(
      service.delete(profile.id, { deleteInstallFiles: false }),
    ).rejects.toThrow(/while it is running/i);
    await expect(
      service.delete(profile.id, { deleteInstallFiles: true }),
    ).rejects.toThrow(/while it is running/i);

    expect(repo.delete).not.toHaveBeenCalled();
    await expect(
      access(join(installDir, "marker.txt"), fsConstants.F_OK),
    ).resolves.toBeUndefined();
  });

  it("wipes when requireEmptyInstall and the folder is still empty", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-delete-empty-ok-"));
    tmpDirs.push(installDir);

    const profile = makeProfile(installDir);
    const repo = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      delete: vi.fn(() => true),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const processes = {
      on: vi.fn(),
      isActive: vi.fn(() => false),
    } as unknown as ProcessManager;

    const service = makeService(repo, processes);
    await service.delete(profile.id, {
      deleteInstallFiles: true,
      requireEmptyInstall: true,
    });

    expect(repo.delete).toHaveBeenCalledWith(profile.id);
    await expect(access(installDir, fsConstants.F_OK)).rejects.toThrow();
  });

  it("refuses requireEmptyInstall wipe when the folder is no longer empty", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-delete-empty-stale-"));
    tmpDirs.push(installDir);
    await writeFile(join(installDir, "marker.txt"), "x", "utf8");

    const profile = makeProfile(installDir);
    const repo = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      list: vi.fn(() => [profile]),
      delete: vi.fn(() => true),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const processes = {
      on: vi.fn(),
      isActive: vi.fn(() => false),
    } as unknown as ProcessManager;

    const service = makeService(repo, processes);
    await expect(
      service.delete(profile.id, {
        deleteInstallFiles: true,
        requireEmptyInstall: true,
      }),
    ).rejects.toThrow(/no longer empty/i);

    expect(repo.delete).not.toHaveBeenCalled();
    await expect(
      access(join(installDir, "marker.txt"), fsConstants.F_OK),
    ).resolves.toBeUndefined();
  });
});
