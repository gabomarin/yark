import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, writeFile, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { MoveInstallService, MOVE_STAGING_MARKER } from "@backend/domains/instances/move-install-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile, ServerProfileInput } from "@shared/types";
import { inspectServerInstallation } from "@backend/domains/instances/server-installation";
import { syncProfileSettingsToIni } from "@backend/domains/instances/sync-profile-ini";
import * as robocopyTreeModule from "@backend/domains/updates/robocopy-tree";
import * as backupDisk from "@backend/domains/backups/backup-disk";
import { cp } from "node:fs/promises";

vi.mock("@backend/domains/instances/server-installation", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@backend/domains/instances/server-installation")
  >();
  const inspectServerInstallation = vi.fn();
  return {
    ...actual,
    inspectServerInstallation,
    inspectServerInstallationAsync: vi.fn(
      async (
        serverId: string,
        installDir: string,
        options?: Parameters<typeof actual.inspectServerInstallationAsync>[2],
      ) => inspectServerInstallation(serverId, installDir, options),
    ),
    classifyInstallHealthAsync: vi.fn(
      async (installDir: string, binaryPath: string) =>
        actual.classifyInstallHealth(installDir, binaryPath),
    ),
  };
});

vi.mock("@backend/domains/instances/sync-profile-ini", () => ({
  syncProfileSettingsToIni: vi.fn(async () => undefined),
}));

vi.mock("@backend/infra/process/host-port-probe", () => ({
  assertHostPortsAvailable: vi.fn(async () => undefined),
}));

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\ARK\\Island",
    enabled: true,
    autoStart: false,
    sessionName: "Island Session",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    disabledMods: [],
    modMetadataCache: {},
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function harness(
  initialProfiles: ServerProfile[],
  stagingRegistryPath: string | null = null,
  pendingCleanupRegistryPath: string | null = null,
) {
  let profiles = initialProfiles;
  const repo = {
    get: vi.fn((id: string) => profiles.find((item) => item.id === id) ?? null),
    list: vi.fn(() => profiles),
    update: vi.fn((id: string, input: ServerProfileInput) => {
      const current = profiles.find((item) => item.id === id);
      if (current === undefined) return null;
      const updated = { ...current, ...input, updatedAt: new Date().toISOString() };
      profiles = profiles.map((item) => (item.id === id ? updated : item));
      return updated;
    }),
    updateInstallDir: vi.fn((id: string, installDir: string) => {
      const current = profiles.find((item) => item.id === id);
      if (current === undefined) return null;
      const updated = {
        ...current,
        installDir,
        updatedAt: new Date().toISOString(),
      };
      profiles = profiles.map((item) => (item.id === id ? updated : item));
      return updated;
    }),
    addEvent: vi.fn(),
  } as unknown as ServerRepository;
  const processes = {
    on: vi.fn(),
    isActive: vi.fn(() => false),
  } as unknown as ProcessManager;
  const backups = {
    hasServerWork: vi.fn(() => false),
  } as unknown as BackupService;
  const locks = new InstanceLockManager();
  const instances = new InstanceService(repo, processes, backups, locks);
  vi.spyOn(
    instances as unknown as { ensureDefaultIniFiles(path: string): Promise<void> },
    "ensureDefaultIniFiles",
  ).mockResolvedValue(undefined);
  const move = new MoveInstallService(
    repo,
    instances,
    processes,
    backups,
    locks,
    stagingRegistryPath,
    pendingCleanupRegistryPath,
  );
  return { instances, move, repo, processes, backups, getProfiles: () => profiles };
}

async function makeReadyInstall(root: string): Promise<void> {
  const binDir = join(root, "ShooterGame", "Binaries", "Win64");
  await mkdir(binDir, { recursive: true });
  await writeFile(join(binDir, "ArkAscendedServer.exe"), "fake-exe", "utf8");
  await mkdir(join(root, "ShooterGame", "Saved"), { recursive: true });
  await writeFile(join(root, "ShooterGame", "Saved", "save.ark"), "world", "utf8");
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(inspectServerInstallation).mockImplementation((serverId, installDir) => ({
    serverId,
    installed: true,
    health: "ready",
    reasonCodes: ["ready"],
    guidance: "Installation looks ready to start.",
    build: null,
    steamBuild: null,
    arkVersion: null,
    version: null,
    binaryPath: join(installDir, "ShooterGame", "Binaries", "Win64", "ArkAscendedServer.exe"),
    checkedAt: new Date().toISOString(),
  }));
  vi.mocked(syncProfileSettingsToIni).mockResolvedValue(undefined);
  vi.spyOn(backupDisk, "readVolumeSpace").mockResolvedValue({
    volumePath: "C:\\",
    freeBytes: 500 * 1024 ** 3,
    totalBytes: 1000 * 1024 ** 3,
  });
});

describe("InstanceService.update installDir lock", () => {
  it("rejects changing installDir via normal update", () => {
    const source = profile();
    const { instances, repo } = harness([source]);

    expect(() =>
      instances.update(source.id, {
        ...source,
        installDir: "C:\\ARK\\Elsewhere",
      }),
    ).toThrow(/Move installation/);

    expect(repo.update).not.toHaveBeenCalled();
  });

  it("allows update when installDir is unchanged", () => {
    const source = profile();
    const { instances } = harness([source]);

    const updated = instances.update(source.id, {
      ...source,
      sessionName: "Renamed Session",
      installDir: "C:\\ark\\island", // case-insensitive match
    });
    expect(updated.sessionName).toBe("Renamed Session");
    expect(updated.installDir).toBe(source.installDir);
  });
});

describe("MoveInstallService", () => {
  it("same-volume: renames, verifies, commits, and leaves no old source", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-move-"));
    const sourceDir = join(root, "source");
    const destDir = join(root, "dest");
    await makeReadyInstall(sourceDir);

    const robocopySpy = vi.spyOn(robocopyTreeModule, "robocopyTree");

    const source = profile({ installDir: sourceDir });
    const { move, repo, getProfiles } = harness([source]);

    const result = await move.moveInstall(source.id, destDir);

    expect(robocopySpy).not.toHaveBeenCalled();
    expect(result.destinationDir).toBe(destDir);
    expect(result.oldSourceDir).toBe(sourceDir);
    expect(result.oldSourceRemoved).toBe(true);
    expect(result.cleanupError).toBeNull();
    expect(getProfiles()[0]?.installDir).toBe(destDir);
    expect(repo.updateInstallDir).toHaveBeenCalledWith(source.id, destDir);
    await expect(access(sourceDir)).rejects.toThrow();
    await access(join(destDir, "ShooterGame", "Binaries", "Win64", "ArkAscendedServer.exe"));
    expect(repo.addEvent).toHaveBeenCalledWith(
      source.id,
      "install_move_completed",
      "info",
      expect.stringContaining(destDir),
      expect.objectContaining({
        context: expect.objectContaining({ sameVolumeRename: true }),
      }),
    );

    await rm(root, { recursive: true, force: true });
  });

  it("cross-volume: copies with robocopy then removes the old source", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-move-xvol-"));
    const sourceDir = join(root, "source");
    const destDir = join(root, "dest");
    await makeReadyInstall(sourceDir);

    vi.spyOn(backupDisk, "volumeRootForPath").mockImplementation((pathValue) => {
      const resolved = pathValue.toLowerCase();
      if (resolved.includes("source")) return "C:\\";
      if (resolved.includes("dest") || resolved.includes(".yark-move")) return "D:\\";
      return "C:\\";
    });

    vi.spyOn(robocopyTreeModule, "robocopyTree").mockImplementation(
      async (from, to) => {
        await cp(from, to, { recursive: true });
        return 1;
      },
    );

    const source = profile({ installDir: sourceDir });
    const { move, getProfiles } = harness([source]);

    const result = await move.moveInstall(source.id, destDir);

    expect(robocopyTreeModule.robocopyTree).toHaveBeenCalled();
    expect(result.oldSourceRemoved).toBe(true);
    expect(getProfiles()[0]?.installDir).toBe(destDir);
    await expect(access(sourceDir)).rejects.toThrow();
    await access(join(destDir, "ShooterGame", "Binaries", "Win64", "ArkAscendedServer.exe"));

    await rm(root, { recursive: true, force: true });
  });

  it("leaves the profile on the source when copy fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-move-fail-"));
    const sourceDir = join(root, "source");
    const destDir = join(root, "dest");
    await makeReadyInstall(sourceDir);

    vi.spyOn(backupDisk, "volumeRootForPath").mockImplementation((pathValue) => {
      const resolved = pathValue.toLowerCase();
      if (resolved.includes("source")) return "C:\\";
      return "D:\\";
    });

    vi.spyOn(robocopyTreeModule, "robocopyTree").mockRejectedValue(
      new Error("robocopy blew up"),
    );

    const source = profile({ installDir: sourceDir });
    const { move, getProfiles, repo } = harness([source]);

    await expect(move.moveInstall(source.id, destDir)).rejects.toThrow(/robocopy blew up/);
    expect(getProfiles()[0]?.installDir).toBe(sourceDir);
    expect(repo.updateInstallDir).not.toHaveBeenCalled();
    expect(repo.addEvent).toHaveBeenCalledWith(
      source.id,
      "install_move_failed",
      "error",
      expect.stringContaining("still uses"),
      expect.any(Object),
    );

    await rm(root, { recursive: true, force: true });
  });

  it("refuses cleanup while the profile still points at the old path", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-move-cleanup-points-"));
    const pendingPath = join(root, "pending-cleanup.json");
    const oldDir = join(root, "Island");
    await mkdir(oldDir, { recursive: true });
    await writeFile(
      pendingPath,
      `${JSON.stringify({ byServerId: { "srv-1": oldDir } }, null, 2)}\n`,
      "utf8",
    );
    const source = profile({ installDir: oldDir });
    const { move } = harness([source], null, pendingPath);

    await expect(move.cleanupOldSource(source.id, oldDir)).rejects.toThrow(
      /still points at it/,
    );

    await rm(root, { recursive: true, force: true });
  });

  it("binds cleanup deletes to the main-recorded prior path (#215)", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-move-cleanup-bind-"));
    const pendingPath = join(root, "pending-cleanup.json");
    const oldDir = join(root, "old-Island");
    const otherDir = join(root, "unrelated");
    const newDir = join(root, "new-Island");
    await mkdir(oldDir, { recursive: true });
    await writeFile(join(oldDir, "keep-me.txt"), "data", "utf8");
    await mkdir(otherDir, { recursive: true });
    await writeFile(join(otherDir, "do-not-delete.txt"), "safe", "utf8");
    await writeFile(
      pendingPath,
      `${JSON.stringify({ byServerId: { "srv-1": oldDir } }, null, 2)}\n`,
      "utf8",
    );

    const source = profile({ installDir: newDir });
    const { move } = harness([source], null, pendingPath);

    await expect(move.cleanupOldSource(source.id, otherDir)).rejects.toThrow(
      /does not match the previous installation recorded/,
    );
    await access(join(otherDir, "do-not-delete.txt"));
    await access(join(oldDir, "keep-me.txt"));

    await expect(move.cleanupOldSource(source.id, `${oldDir}\\`)).resolves.toBeUndefined();
    await expect(access(oldDir)).rejects.toThrow();

    const pendingRaw = await readFile(pendingPath, "utf8");
    expect(JSON.parse(pendingRaw)).toEqual({ byServerId: {} });

    await expect(move.cleanupOldSource(source.id, oldDir)).rejects.toThrow(
      /No pending install cleanup/,
    );

    await rm(root, { recursive: true, force: true });
  });

  it("clears pending cleanup on dismiss without deleting files (#215)", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-move-cleanup-dismiss-"));
    const pendingPath = join(root, "pending-cleanup.json");
    const oldDir = join(root, "old-Island");
    await mkdir(oldDir, { recursive: true });
    await writeFile(join(oldDir, "keep-me.txt"), "data", "utf8");
    await writeFile(
      pendingPath,
      `${JSON.stringify({ byServerId: { "srv-1": oldDir } }, null, 2)}\n`,
      "utf8",
    );

    const source = profile({ installDir: join(root, "new-Island") });
    const { move } = harness([source], null, pendingPath);

    await move.dismissCleanupPrompt(source.id);
    await access(join(oldDir, "keep-me.txt"));
    await expect(move.cleanupOldSource(source.id, oldDir)).rejects.toThrow(
      /No pending install cleanup/,
    );

    await rm(root, { recursive: true, force: true });
  });

  it("keeps an older pending leftover when a later move auto-deletes successfully (#215)", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-move-cleanup-preserve-"));
    const pendingPath = join(root, "pending-cleanup.json");
    const leftoverA = join(root, "leftover-A");
    const sourceB = join(root, "source-B");
    const destC = join(root, "dest-C");
    await mkdir(leftoverA, { recursive: true });
    await writeFile(join(leftoverA, "keep-me.txt"), "old", "utf8");
    await makeReadyInstall(sourceB);
    await writeFile(
      pendingPath,
      `${JSON.stringify({ byServerId: { "srv-1": leftoverA } }, null, 2)}\n`,
      "utf8",
    );

    const source = profile({ installDir: sourceB });
    const { move, getProfiles } = harness([source], null, pendingPath);

    const result = await move.moveInstall(source.id, destC);
    expect(result.oldSourceRemoved).toBe(true);
    expect(getProfiles()[0]?.installDir).toBe(destC);

    const pendingRaw = await readFile(pendingPath, "utf8");
    expect(JSON.parse(pendingRaw)).toEqual({
      byServerId: { "srv-1": leftoverA },
    });
    await access(join(leftoverA, "keep-me.txt"));

    await expect(move.cleanupOldSource(source.id, leftoverA)).resolves.toBeUndefined();
    await expect(access(leftoverA)).rejects.toThrow();

    await rm(root, { recursive: true, force: true });
  });

  it("cleans up a leftover staging marker directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-move-sweep-"));
    const installDir = join(root, "Island");
    await mkdir(installDir, { recursive: true });
    const staging = join(root, ".yark-move-srv-1-staging");
    await mkdir(staging, { recursive: true });
    await writeFile(join(staging, MOVE_STAGING_MARKER), "serverId=srv-1\n", "utf8");

    const source = profile({ installDir });
    const { move } = harness([source]);
    const removed = await move.sweepStaleStaging();
    expect(removed).toBe(1);
    await expect(access(staging)).rejects.toThrow();

    await rm(root, { recursive: true, force: true });
  });

  it("sweeps registered staging under a non-profile destination parent", async () => {
    const root = await mkdtemp(join(tmpdir(), "yark-move-sweep-reg-"));
    const profileRoot = join(root, "profiles");
    const destRoot = join(root, "elsewhere");
    const installDir = join(profileRoot, "Island");
    const staging = join(destRoot, ".yark-move-srv-1-staging");
    const registryPath = join(root, "move-install-staging.json");
    await mkdir(installDir, { recursive: true });
    await mkdir(staging, { recursive: true });
    await writeFile(join(staging, MOVE_STAGING_MARKER), "serverId=srv-1\n", "utf8");
    await writeFile(
      registryPath,
      `${JSON.stringify({ paths: [staging] }, null, 2)}\n`,
      "utf8",
    );

    const source = profile({ installDir });
    const { move } = harness([source], registryPath);
    const removed = await move.sweepStaleStaging();
    expect(removed).toBe(1);
    await expect(access(staging)).rejects.toThrow();
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
      paths: string[];
    };
    expect(registry.paths).toEqual([]);

    await rm(root, { recursive: true, force: true });
  });
});

describe("same-volume rename helpers", () => {
  it("detects nested paths as unsafe for rename", async () => {
    const { canUseSameVolumeRename, isPathInside } = await import(
      "@backend/domains/instances/move-install-service"
    );
    expect(isPathInside("C:\\ARK\\Server", "C:\\ARK\\Server\\nested")).toBe(true);
    expect(canUseSameVolumeRename("C:\\ARK\\Server", "C:\\ARK\\Server\\nested")).toBe(
      false,
    );
  });
});

describe("isWindowsDriveRoot", () => {
  it("recognizes drive roots", async () => {
    const { isWindowsDriveRoot } = await import(
      "@backend/domains/instances/install-dir-safety"
    );
    expect(isWindowsDriveRoot("H:\\")).toBe(true);
    expect(isWindowsDriveRoot("H:")).toBe(true);
    expect(isWindowsDriveRoot("H:\\ARK\\Server")).toBe(false);
  });
});
