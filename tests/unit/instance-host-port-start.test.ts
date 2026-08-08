import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile } from "@shared/types";
import { inspectServerInstallation } from "@backend/domains/instances/server-installation";
import { syncProfileSettingsToIni } from "@backend/domains/instances/sync-profile-ini";
import { assertHostPortsAvailable } from "@backend/infra/process/host-port-probe";
import { formatHostPortBusyError } from "@shared/host-port-probe-errors";

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

function harness(initialProfiles: ServerProfile[]) {
  const profiles = initialProfiles;
  const repo = {
    get: vi.fn((id: string) => profiles.find((item) => item.id === id) ?? null),
    list: vi.fn(() => profiles),
    addEvent: vi.fn(),
  } as unknown as ServerRepository;
  const processes = {
    on: vi.fn(),
    isActive: vi.fn((id: string) => id === "peer-running"),
    start: vi.fn(),
    applyRuntimePorts: vi.fn((p: ServerProfile) => p),
    getStatus: vi.fn(() => ({ status: "running" })),
    waitWhileStarting: vi.fn(async () => undefined),
    beginGracefulStop: vi.fn(async () => ({ phase: "killed" as const, handle: null })),
    finishGracefulStop: vi.fn(async () => "stopped" as const),
  } as unknown as ProcessManager;
  const backups = {
    hasServerWork: vi.fn(() => false),
    createPreStopBackup: vi.fn(async () => []),
  } as unknown as BackupService;
  const locks = new InstanceLockManager();
  const service = new InstanceService(repo, processes, backups, locks);
  return { service, repo, processes, backups };
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
  vi.mocked(syncProfileSettingsToIni).mockReset();
  vi.mocked(syncProfileSettingsToIni).mockResolvedValue(undefined);
  vi.mocked(assertHostPortsAvailable).mockReset();
  vi.mocked(assertHostPortsAvailable).mockResolvedValue(undefined);
});

describe("InstanceService host port start gate", () => {
  it("blocks start when custom map mod identity is inconsistent (#194)", async () => {
    const source = profile({
      map: "Svartalfheim_WP",
      mapModId: "962796",
      mods: ["962796"],
      disabledMods: ["962796"],
    });
    const { service, processes } = harness([source]);

    await expect(service.start(source.id)).rejects.toThrow(
      /Map mod Project ID is disabled/,
    );
    expect(processes.start).not.toHaveBeenCalled();
  });

  it("blocks start when the host probe reports busy and does not spawn", async () => {
    const source = profile();
    const { service, processes } = harness([source]);
    vi.mocked(assertHostPortsAvailable).mockRejectedValue(
      new Error(
        formatHostPortBusyError("UDP game port 7777 is already in use.", {
          gamePort: 7787,
          queryPort: 27025,
          rconPort: 27030,
        }),
      ),
    );

    await expect(service.start(source.id)).rejects.toThrow(/HOST_PORT_BUSY:/);
    expect(processes.start).not.toHaveBeenCalled();
    expect(syncProfileSettingsToIni).not.toHaveBeenCalled();
  });

  it("blocks start when the host probe is inconclusive", async () => {
    const source = profile();
    const { service, processes } = harness([source]);
    vi.mocked(assertHostPortsAvailable).mockRejectedValue(
      new Error("HOST_PORT_PROBE_INCONCLUSIVE: Could not confirm whether UDP game port 7777 is free."),
    );

    await expect(service.start(source.id)).rejects.toThrow(
      /HOST_PORT_PROBE_INCONCLUSIVE:/,
    );
    expect(processes.start).not.toHaveBeenCalled();
  });

  it("passes allowInconclusive when skipPortValidation is set", async () => {
    const source = profile();
    const { service, processes } = harness([source]);

    await service.start(source.id, { skipPortValidation: true });

    expect(assertHostPortsAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ id: source.id }),
      [],
      { allowInconclusive: true },
    );
    expect(processes.start).toHaveBeenCalled();
  });

  it("starts with sessionPorts without mutating the saved profile", async () => {
    const source = profile();
    const { service, repo, processes } = harness([source]);
    const sessionPorts = {
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    };

    await service.start(source.id, { sessionPorts });

    expect(assertHostPortsAvailable).toHaveBeenCalledWith(
      expect.objectContaining(sessionPorts),
      [],
      { allowInconclusive: false },
    );
    expect(syncProfileSettingsToIni).toHaveBeenCalledWith(
      expect.objectContaining({
        id: source.id,
        ...sessionPorts,
      }),
    );
    expect(processes.start).toHaveBeenCalledWith(
      expect.objectContaining(sessionPorts),
      expect.objectContaining({ sessionPorts }),
    );
    expect(repo.get(source.id)).toEqual(source);
    expect(repo.addEvent).toHaveBeenCalledWith(
      source.id,
      "server_started",
      "info",
      expect.stringContaining("session ports"),
    );
  });

  it("uses peer runtime ports for active conflict checks", async () => {
    const source = profile();
    const peer = profile({
      id: "peer-running",
      name: "Peer",
      gamePort: 7777,
      queryPort: 27015,
      rconPort: 27020,
      installDir: "C:\\ARK\\Peer",
    });
    const { service, processes } = harness([source, peer]);
    vi.mocked(processes.applyRuntimePorts).mockImplementation((p) =>
      p.id === "peer-running"
        ? {
            ...p,
            gamePort: 7787,
            queryPort: 27025,
            rconPort: 27030,
          }
        : p,
    );

    await expect(
      service.start(source.id, {
        sessionPorts: {
          gamePort: 7787,
          queryPort: 27025,
          rconPort: 27030,
        },
      }),
    ).rejects.toThrow(/Port conflict/);
    expect(assertHostPortsAvailable).not.toHaveBeenCalled();
    expect(processes.start).not.toHaveBeenCalled();
  });

  it("still hard-fails active profile port conflicts even when sessionPorts are set", async () => {
    const source = profile();
    const peer = profile({
      id: "peer-running",
      name: "Peer",
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
      installDir: "C:\\ARK\\Peer",
    });
    const { service, processes } = harness([source, peer]);

    await expect(
      service.start(source.id, {
        sessionPorts: {
          gamePort: 7787,
          queryPort: 27025,
          rconPort: 27030,
        },
      }),
    ).rejects.toThrow(/Port conflict/);
    expect(assertHostPortsAvailable).not.toHaveBeenCalled();
    expect(processes.start).not.toHaveBeenCalled();
  });

  it("rejects invalid sessionPorts before probing", async () => {
    const source = profile();
    const { service, processes } = harness([source]);

    await expect(
      service.start(source.id, {
        sessionPorts: {
          gamePort: 7787,
          queryPort: 7787,
          rconPort: 27030,
        },
      }),
    ).rejects.toThrow(/must be distinct/);
    expect(assertHostPortsAvailable).not.toHaveBeenCalled();
    expect(processes.start).not.toHaveBeenCalled();
  });

  it("does not emit started when spawn fails after a successful probe", async () => {
    const source = profile();
    const { service, repo, processes } = harness([source]);
    vi.mocked(processes.start).mockImplementation(() => {
      throw new Error("spawn failed");
    });

    await expect(service.start(source.id)).rejects.toThrow(/spawn failed/);
    expect(assertHostPortsAvailable).toHaveBeenCalled();
    expect(repo.addEvent).not.toHaveBeenCalledWith(
      source.id,
      "server_started",
      expect.anything(),
      expect.anything(),
    );
  });

  it("stops using runtime ports for RCON SaveWorld", async () => {
    const source = profile();
    const { service, processes } = harness([source]);
    vi.mocked(processes.isActive).mockReturnValue(true);
    vi.mocked(processes.applyRuntimePorts).mockImplementation((p) => ({
      ...p,
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    }));

    await service.stop(source.id, { backup: false });

    expect(processes.beginGracefulStop).toHaveBeenCalledWith(
      expect.objectContaining({ rconPort: 27030, gamePort: 7787 }),
    );
  });
});
