import { describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile } from "@shared/types";

const profile: ServerProfile = {
  id: "srv-1",
  name: "Island",
  map: "TheIsland_WP",
  installDir: "C:\\ARK\\Island",
  enabled: true,
  sessionName: "Island",
  gamePort: 7777,
  queryPort: 27015,
  rconPort: 27020,
  serverPassword: null,
  adminPassword: "admin",
  clusterId: null,
  clusterDir: null,
  extraArgs: [],
  mods: [],
  createdAt: "2026-08-03T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
};

describe("InstanceService.retryRconConnection", () => {
  it("replaces the failed session and reconnects with the active runtime port", async () => {
    const runtimeProfile = { ...profile, rconPort: 37020 };
    const repo = {
      get: vi.fn(() => profile),
    } as unknown as ServerRepository;
    const processes = {
      on: vi.fn(),
      isActive: vi.fn(() => true),
      applyRuntimePorts: vi.fn(() => runtimeProfile),
    } as unknown as ProcessManager;
    const service = new InstanceService(
      repo,
      processes,
      {} as BackupService,
      new InstanceLockManager(),
    );
    const sessions = {
      disconnect: vi.fn(),
      connect: vi.fn(async () => undefined),
    };
    (
      service as unknown as {
        rconSessions: typeof sessions;
      }
    ).rconSessions = sessions;

    await service.retryRconConnection(profile.id);

    expect(sessions.disconnect).toHaveBeenCalledWith(profile.id);
    expect(sessions.connect).toHaveBeenCalledWith(
      profile.id,
      "127.0.0.1",
      runtimeProfile.rconPort,
      profile.adminPassword,
    );
  });
});
