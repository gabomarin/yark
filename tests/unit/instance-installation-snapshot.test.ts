import { describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import {
  inspectServerInstallation,
  readOfficialArkBuildCached,
  readOfficialArkVersionCached,
} from "@backend/domains/instances/server-installation";

vi.mock("@backend/domains/instances/server-installation", () => ({
  inspectServerInstallation: vi.fn(),
  readOfficialArkVersionCached: vi.fn(),
  readOfficialArkBuildCached: vi.fn(),
}));

describe("InstanceService.installationInfo", () => {
  it("returns official metadata even when there are no servers", async () => {
    vi.mocked(readOfficialArkVersionCached).mockResolvedValue("358.12");
    vi.mocked(readOfficialArkBuildCached).mockResolvedValue("build 24346423");

    const repo = {
      list: vi.fn(() => []),
    } as unknown as ServerRepository;

    const processes = {} as ProcessManager;
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
      officialSteamBuild: "build 24346423",
      servers: [],
    });
    expect(readOfficialArkVersionCached).toHaveBeenCalledWith(false);
    expect(readOfficialArkBuildCached).toHaveBeenCalledWith(false);
    expect(inspectServerInstallation).not.toHaveBeenCalled();
  });
});
