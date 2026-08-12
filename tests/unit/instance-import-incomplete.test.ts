import { mkdtemp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile, ServerProfileInput } from "@shared/types";

const tmpDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

function baseInput(installDir: string): ServerProfileInput {
  return {
    name: "Imported",
    map: "TheIsland_WP",
    installDir,
    sessionName: "Imported",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    autoStart: false,
  };
}

function makeService(repo: ServerRepository): InstanceService {
  const processes = {
    on: vi.fn(),
    isActive: vi.fn(() => false),
  } as unknown as ProcessManager;
  const backups = {} as import("@backend/domains/backups/backup-service").BackupService;
  return new InstanceService(repo, processes, backups, new InstanceLockManager());
}

describe("InstanceService.importExisting incomplete opt-in (#283)", () => {
  it("rejects incomplete without allowIncompleteInstall", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-import-inc-"));
    tmpDirs.push(installDir);
    await mkdir(join(installDir, "ShooterGame"), { recursive: true });
    await mkdir(join(installDir, "Engine"), { recursive: true });

    const repo = {
      get: vi.fn(() => null),
      list: vi.fn(() => [] as ServerProfile[]),
      create: vi.fn(),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const service = makeService(repo);
    await expect(service.importExisting(baseInput(installDir))).rejects.toThrow(
      /incomplete/i,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("imports incomplete when allowIncompleteInstall is true", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-import-inc-ok-"));
    tmpDirs.push(installDir);
    await mkdir(join(installDir, "ShooterGame"), { recursive: true });
    await mkdir(join(installDir, "Engine"), { recursive: true });

    const created: ServerProfile = {
      id: "srv-import",
      ...baseInput(installDir),
      enabled: true,
      disabledMods: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const repo = {
      get: vi.fn(() => null),
      list: vi.fn(() => [] as ServerProfile[]),
      create: vi.fn(() => created),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const service = makeService(repo);
    const profile = await service.importExisting(baseInput(installDir), {
      allowIncompleteInstall: true,
    });
    expect(profile.id).toBe("srv-import");
    expect(repo.create).toHaveBeenCalled();
    expect(repo.addEvent).toHaveBeenCalledWith(
      "srv-import",
      "server_created",
      "info",
      expect.stringMatching(/incomplete/i),
    );
  });

  it("rejects empty even with allowIncompleteInstall", async () => {
    const installDir = await mkdtemp(join(tmpdir(), "ark-import-empty-"));
    tmpDirs.push(installDir);

    const repo = {
      get: vi.fn(() => null),
      list: vi.fn(() => [] as ServerProfile[]),
      create: vi.fn(),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const service = makeService(repo);
    await expect(
      service.importExisting(baseInput(installDir), {
        allowIncompleteInstall: true,
      }),
    ).rejects.toThrow(/ready ASA|empty/i);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("rejects nested ShooterGame paths even with allowIncompleteInstall", async () => {
    const root = await mkdtemp(join(tmpdir(), "ark-import-nested-"));
    tmpDirs.push(root);
    // Nested Win64 path can look incomplete (inner ShooterGame markers) without
    // being the dedicated root — must not import via IPC opt-in alone.
    const nested = join(root, "ShooterGame", "Binaries", "Win64");
    await mkdir(join(nested, "ShooterGame"), { recursive: true });

    const repo = {
      get: vi.fn(() => null),
      list: vi.fn(() => [] as ServerProfile[]),
      create: vi.fn(),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const service = makeService(repo);
    await expect(
      service.importExisting(baseInput(nested), {
        allowIncompleteInstall: true,
      }),
    ).rejects.toThrow(/inside an ASA install/i);
    expect(repo.create).not.toHaveBeenCalled();
  });
});
