import { describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ServerProfile } from "@shared/types";

vi.mock("@backend/domains/instances/sync-profile-ini", () => ({
  syncProfileSettingsToIni: vi.fn(async () => undefined),
}));

function makeProfile(overrides: Partial<ServerProfile> = {}): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "srv-1",
    name: "Island",
    map: "TheIsland_WP",
    installDir: "C:/ARK/Island",
    sessionName: "Island",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin1234",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRepo(initial: ServerProfile) {
  let profile = initial;
  const repo = {
    get: vi.fn((id: string) => (id === profile.id ? profile : null)),
    list: vi.fn(() => [profile]),
    setEnabled: vi.fn((id: string, enabled: boolean) => {
      if (id !== profile.id) return null;
      profile = { ...profile, enabled };
      return profile;
    }),
    addEvent: vi.fn(),
  } as unknown as ServerRepository;
  return { repo, current: () => profile };
}

function makeProcesses(active = false) {
  return {
    isActive: vi.fn(() => active),
    start: vi.fn(),
  } as unknown as ProcessManager & {
    isActive: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  };
}

function makeService(profile: ServerProfile, active = false) {
  const { repo, current } = makeRepo(profile);
  const processes = makeProcesses(active);
  const service = new InstanceService(
    repo,
    processes,
    {} as BackupService,
    new InstanceLockManager(),
  );
  return { service, repo, current, processes };
}

describe("InstanceService enabled profile state", () => {
  it("disables a stopped profile through the dedicated operation", async () => {
    const { service, repo, current } = makeService(makeProfile());

    const updated = await service.setEnabled("srv-1", false);

    expect(updated.enabled).toBe(false);
    expect(current().enabled).toBe(false);
    expect(vi.mocked(repo.setEnabled)).toHaveBeenCalledWith("srv-1", false);
    expect(vi.mocked(repo.addEvent)).toHaveBeenCalledWith(
      "srv-1",
      "server_disabled",
      "info",
      expect.stringContaining("marked inactive"),
      expect.any(Object),
    );
  });

  it("rejects disabling while the server is active", async () => {
    const { service, repo } = makeService(makeProfile(), true);

    await expect(service.setEnabled("srv-1", false)).rejects.toThrow(
      /finish current jobs before disabling/i,
    );
    expect(vi.mocked(repo.setEnabled)).not.toHaveBeenCalled();
  });

  it("blocks the shared start path for inactive profiles", async () => {
    const { service, processes } = makeService(makeProfile({ enabled: false }));

    await expect(service.start("srv-1")).rejects.toThrow(
      /profile is inactive/i,
    );
    expect(processes.start).not.toHaveBeenCalled();
  });
});
