import { mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
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

describe("InstanceService.delete", () => {
  it("borra el perfil y la carpeta de instalación del disco", async () => {
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
      isActive: vi.fn(() => false),
    } as unknown as ProcessManager;

    const service = new InstanceService(repo, processes);
    await service.delete(profile.id);

    expect(repo.delete).toHaveBeenCalledWith(profile.id);
    await expect(access(installDir, fsConstants.F_OK)).rejects.toThrow();
  });

  it("no borra el disco si otro perfil comparte el mismo installDir", async () => {
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
      isActive: vi.fn(() => false),
    } as unknown as ProcessManager;

    const service = new InstanceService(repo, processes);
    await expect(service.delete(profile.id)).rejects.toThrow(/también lo usan/i);
    expect(repo.delete).not.toHaveBeenCalled();
    await expect(access(join(installDir, "marker.txt"), fsConstants.F_OK)).resolves.toBeUndefined();
  });
});
