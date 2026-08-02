import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile, ServerProfileInput } from "@shared/types";
import { inspectServerInstallation } from "@backend/domains/instances/server-installation";
import { syncProfileSettingsToIni } from "@backend/domains/instances/sync-profile-ini";

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
  };
});

vi.mock("@backend/domains/instances/sync-profile-ini", () => ({
  syncProfileSettingsToIni: vi.fn(async () => undefined),
}));

function profile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "srv-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:\\ARK\\Island",
    enabled: true,
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

function harness(initialProfiles: ServerProfile[]) {
  let profiles = initialProfiles;
  const repo = {
    get: vi.fn((id: string) => profiles.find((item) => item.id === id) ?? null),
    list: vi.fn(() => profiles),
    setEnabled: vi.fn((id: string, enabled: boolean) => {
      const current = profiles.find((item) => item.id === id);
      if (current === undefined) return null;
      const updated = { ...current, enabled };
      profiles = profiles.map((item) => (item.id === id ? updated : item));
      return updated;
    }),
    create: vi.fn((input: ServerProfileInput, enabled = true) => {
      const created = profile({
        ...input,
        id: `srv-${profiles.length + 1}`,
        enabled,
      });
      profiles = [...profiles, created];
      return created;
    }),
    addEvent: vi.fn(),
  } as unknown as ServerRepository;
  const processes = {
    isActive: vi.fn(() => false),
    start: vi.fn(),
  } as unknown as ProcessManager;
  const backups = {
    hasServerWork: vi.fn(() => false),
  } as unknown as BackupService;
  const locks = new InstanceLockManager();
  const service = new InstanceService(repo, processes, backups, locks);
  vi.spyOn(
    service as unknown as { ensureDefaultIniFiles(path: string): Promise<void> },
    "ensureDefaultIniFiles",
  ).mockResolvedValue(undefined);
  return { service, repo, processes, backups, locks };
}

beforeEach(() => {
  vi.mocked(inspectServerInstallation).mockReturnValue({
    serverId: "srv",
    installed: true,
    health: "ready",
    reasonCodes: ["ready"],
    guidance: "Installation looks ready to start.",
    build: null,
    steamBuild: null,
    arkVersion: null,
    version: null,
    binaryPath: "C:\\ARK\\ArkAscendedServer.exe",
    checkedAt: new Date().toISOString(),
  } as ReturnType<typeof inspectServerInstallation>);
  vi.mocked(syncProfileSettingsToIni).mockResolvedValue(undefined);
});

describe("InstanceService enabled state", () => {
  it("rejects disabling a running server without changing persistence", async () => {
    const source = profile();
    const { service, repo, processes } = harness([source]);
    vi.mocked(processes.isActive).mockReturnValue(true);

    await expect(service.setServerEnabled(source.id, false)).rejects.toThrow(
      /while it is running/,
    );
    expect(repo.setEnabled).not.toHaveBeenCalled();
  });

  it("rejects disabling while backup work is active without changing persistence", async () => {
    const source = profile();
    const { service, repo, backups } = harness([source]);
    vi.mocked(backups.hasServerWork).mockReturnValue(true);

    await expect(service.setServerEnabled(source.id, false)).rejects.toThrow(
      /backup or restore job is still in progress/,
    );
    expect(repo.setEnabled).not.toHaveBeenCalled();
  });

  it("leaves a disabled profile unchanged when installation validation fails", async () => {
    const source = profile({ enabled: false });
    const { service, repo } = harness([source]);
    vi.mocked(inspectServerInstallation).mockReturnValue({
      serverId: source.id,
      installed: false,
      health: "missing",
      reasonCodes: ["path_missing"],
      guidance: "Create the folder or correct the install path, then install server files.",
      build: null,
      steamBuild: null,
      arkVersion: null,
      version: null,
      binaryPath: "C:\\missing\\ArkAscendedServer.exe",
      checkedAt: new Date().toISOString(),
    } as ReturnType<typeof inspectServerInstallation>);

    await expect(service.setServerEnabled(source.id, true)).rejects.toThrow(
      /files are not ready/,
    );
    expect(repo.setEnabled).not.toHaveBeenCalled();
  });

  it("rejects enable when another saved profile owns one of its ports", async () => {
    const source = profile({ enabled: false });
    const other = profile({
      id: "srv-2",
      name: "Scorched",
      installDir: "C:\\ARK\\Scorched",
      gamePort: source.gamePort,
      queryPort: 27016,
      rconPort: 27021,
    });
    const { service, repo } = harness([source, other]);

    await expect(service.setServerEnabled(source.id, true)).rejects.toThrow(
      /port conflict/,
    );
    expect(repo.setEnabled).not.toHaveBeenCalled();
  });

  it("guards the common start path for disabled profiles", async () => {
    const source = profile({ enabled: false });
    const { service, processes } = harness([source]);

    await expect(service.start(source.id)).rejects.toThrow(/is disabled/);
    expect(processes.start).not.toHaveBeenCalled();
  });

  it("keeps Disable out while manual Start owns the operational lock", async () => {
    const source = profile();
    const { service, repo } = harness([source]);
    let releaseSync!: () => void;
    const syncGate = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    vi.mocked(syncProfileSettingsToIni).mockImplementation(async () => syncGate);

    const startPromise = service.start(source.id);
    await vi.waitFor(() => expect(syncProfileSettingsToIni).toHaveBeenCalled());
    await expect(service.setServerEnabled(source.id, false)).rejects.toThrow(
      /running job \(start\)/,
    );
    expect(repo.setEnabled).not.toHaveBeenCalled();

    releaseSync();
    await startPromise;
  });

  it("reports the owning operation when Start is blocked by the instance lock", async () => {
    const source = profile();
    const { service, locks } = harness([source]);
    let releaseUpdate!: () => void;
    const updateGate = new Promise<void>((resolve) => {
      releaseUpdate = resolve;
    });
    const updatePromise = locks.withLock(source.id, "update", () => updateGate);

    await expect(service.start(source.id)).rejects.toThrow(
      /running job \(update\); cannot start start/,
    );

    releaseUpdate();
    await updatePromise;
  });
});

describe("InstanceService cloning", () => {
  it("creates automatic clones in a unique sibling install directory", () => {
    const source = profile();
    const { service, repo } = harness([source]);

    const clone = service.clone(source.id);

    expect(clone.installDir).toBe("C:\\ARK\\Island (copy)");
    expect(clone.installDir).not.toBe(source.installDir);
    expect(repo.create).toHaveBeenCalled();
  });

  it("avoids case-only collisions when deriving an automatic clone name", () => {
    const source = profile({ name: "Island" });
    const existingCopy = profile({
      id: "srv-2",
      name: "island (copy)",
      installDir: "C:\\ARK\\island-copy-existing",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    });
    const { service } = harness([source, existingCopy]);

    const clone = service.clone(source.id);

    expect(clone.name).toBe("Island (copy 2)");
  });

  it("advances the automatic clone suffix for a case-only install-dir collision", () => {
    const source = profile({ name: "Island" });
    const existingFolderOwner = profile({
      id: "srv-2",
      name: "Archive",
      installDir: "c:\\ark\\ISLAND (COPY)",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    });
    const { service } = harness([source, existingFolderOwner]);

    const clone = service.clone(source.id);

    expect(clone.name).toBe("Island (copy 2)");
    expect(clone.installDir).toBe("C:\\ARK\\Island (copy 2)");
  });

  it("treats a customized parameterized clone install directory as the final path", () => {
    const source = profile();
    const { service } = harness([source]);

    const clone = service.cloneWithParams(source.id, {
      name: "Winter",
      sessionName: "Winter Session",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
      installDir: "D:/Custom/Clone/",
    });

    expect(clone.installDir).toBe("D:\\Custom\\Clone");
  });

  it("rejects duplicate clone names with an actionable error", () => {
    const source = profile();
    const duplicate = profile({
      id: "srv-2",
      name: "Winter",
      installDir: "D:\\ARK Servers\\Existing",
      gamePort: 7797,
      queryPort: 27035,
      rconPort: 27040,
    });
    const { service } = harness([source, duplicate]);

    expect(() =>
      service.cloneWithParams(source.id, {
        name: "winter",
        sessionName: "Winter Session",
        gamePort: 7787,
        queryPort: 27025,
        rconPort: 27030,
        installDir: "D:\\ARK Servers\\Winter Clone",
      }),
    ).toThrow(/server named "winter" already exists/i);
  });

  it("rejects a clone whose normalized install directory is already owned", () => {
    const source = profile();
    const existing = profile({
      id: "srv-2",
      name: "Existing",
      installDir: "D:\\ARK Servers\\Winter",
      gamePort: 7797,
      queryPort: 27035,
      rconPort: 27040,
    });
    const { service } = harness([source, existing]);

    expect(() =>
      service.cloneWithParams(source.id, {
        name: "Winter",
        sessionName: "Winter Session",
        gamePort: 7787,
        queryPort: 27025,
        rconPort: 27030,
        installDir: "D:\\ARK Servers\\Winter",
      }),
    ).toThrow(/already uses folder/i);
  });
});
