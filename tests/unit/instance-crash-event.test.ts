import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { InstanceService } from "@backend/domains/instances/instance-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { BackupService } from "@backend/domains/backups/backup-service";
import type { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";
import { diagnoseAsaStartupFailure } from "@shared/asa-startup-failure";

const profile: ServerProfile = {
  id: "srv-crash",
  name: "Crash Island",
  map: "TheIsland_WP",
  installDir: "C:\\ARK\\Island",
  enabled: true,
  autoStart: false,
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
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

describe("InstanceService unexpected-exit events", () => {
  it("records server_crashed with a persisted log excerpt on unexpected-exit", () => {
    const repo = {
      get: vi.fn(() => profile),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const processes = new EventEmitter() as unknown as ProcessManager;
    new InstanceService(
      repo,
      processes,
      {} as BackupService,
      new InstanceLockManager(),
    );

    const diagnosis = diagnoseAsaStartupFailure(
      "Fatal error!\nAssertion failed: nullptr+8",
    );
    (processes as unknown as EventEmitter).emit("unexpected-exit", {
      serverId: profile.id,
      exitCode: 0,
      phase: "starting",
      lastError: diagnosis?.summary ?? "exited",
      diagnosis,
    });

    expect(repo.addEvent).toHaveBeenCalledWith(
      profile.id,
      "server_crashed",
      "error",
      expect.stringContaining("Assertion failed"),
      expect.objectContaining({
        excerpt: expect.stringContaining("Assertion failed: nullptr+8"),
        context: expect.objectContaining({
          phase: "starting",
          exitCode: 0,
        }),
      }),
    );
  });

  it("does not record server_crashed on a live error status (spawn/readiness/kill failure)", () => {
    const repo = {
      get: vi.fn(() => profile),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const processes = new EventEmitter() as unknown as ProcessManager;
    new InstanceService(
      repo,
      processes,
      {} as BackupService,
      new InstanceLockManager(),
    );

    const status: ServerRuntimeInfo = {
      serverId: profile.id,
      status: "error",
      processLive: true,
      pid: 4242,
      startedAt: "2026-08-13T00:00:00.000Z",
      lastError: "Timeout waiting for server readiness (RCON did not respond in time)",
    };
    (processes as unknown as EventEmitter).emit("status", status);

    expect(repo.addEvent).not.toHaveBeenCalled();
  });
});
