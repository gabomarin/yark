import { describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import {
  inspectServerInstallationAsync,
  readOfficialArkBuildCached,
  readOfficialArkVersionCached,
} from "@backend/domains/instances/server-installation";

vi.mock("@backend/domains/instances/server-installation", () => ({
  inspectServerInstallation: vi.fn(),
  inspectServerInstallationAsync: vi.fn(),
  readOfficialArkVersionCached: vi.fn(),
  readOfficialArkBuildCached: vi.fn(),
}));

describe("InstanceService.installationInfo", () => {
  it("returns official metadata even when there are no servers", async () => {
    vi.mocked(readOfficialArkVersionCached).mockResolvedValue({
      version: "358.12",
      networkStatus: "online",
    });
    vi.mocked(readOfficialArkBuildCached).mockResolvedValue("build 24346423");

    const repo = {
      list: vi.fn(() => []),
    } as unknown as ServerRepository;

    const processes = { on: vi.fn() } as unknown as ProcessManager;
    const backups = {} as import("@backend/domains/backups/backup-service").BackupService;
    const service = new InstanceService(
      repo,
      processes,
      backups,
      new InstanceLockManager(),
    );

    const snapshot = await service.installationInfo(false);

    expect(snapshot).toEqual({
      officialVersion: "358.12",
      officialNetworkStatus: "online",
      officialSteamBuild: "build 24346423",
      servers: [],
    });
    expect(readOfficialArkVersionCached).toHaveBeenCalledWith(false);
    expect(readOfficialArkBuildCached).toHaveBeenCalledWith(false);
    expect(inspectServerInstallationAsync).not.toHaveBeenCalled();
  });

  it("skips local inspect when official metadata is unchanged", async () => {
    vi.mocked(readOfficialArkVersionCached).mockResolvedValue({
      version: "358.12",
      networkStatus: "online",
    });
    vi.mocked(readOfficialArkBuildCached).mockResolvedValue("build 24346423");
    vi.mocked(inspectServerInstallationAsync).mockResolvedValue({
      serverId: "srv-1",
      installed: true,
      health: "ready",
      reasonCodes: ["ready"],
      guidance: "Installation looks ready to start.",
      build: "358.12",
      steamBuild: "build 1",
      arkVersion: null,
      version: "358.12",
      binaryPath: "C:\\srv\\ArkAscendedServer.exe",
      checkedAt: "2026-01-01T00:00:00.000Z",
    });

    const repo = {
      list: vi.fn(() => [
        { id: "srv-1", installDir: "C:\\srv" },
      ]),
    } as unknown as ServerRepository;

    const service = new InstanceService(
      repo,
      { on: vi.fn() } as unknown as ProcessManager,
      {} as import("@backend/domains/backups/backup-service").BackupService,
      new InstanceLockManager(),
    );

    await service.installationInfo(false, "when-official-changed");
    expect(inspectServerInstallationAsync).toHaveBeenCalledTimes(1);

    vi.mocked(inspectServerInstallationAsync).mockClear();
    const second = await service.installationInfo(false, "when-official-changed");
    expect(inspectServerInstallationAsync).not.toHaveBeenCalled();
    expect(second.servers).toHaveLength(1);

    vi.mocked(readOfficialArkVersionCached).mockResolvedValue({
      version: "359.00",
      networkStatus: "online",
    });
    await service.installationInfo(false, "when-official-changed");
    expect(inspectServerInstallationAsync).toHaveBeenCalledTimes(1);
  });
});
