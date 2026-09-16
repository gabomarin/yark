import { EventEmitter } from "node:events";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "@backend/infra/db/database";
import { CrashRecoveryRepository } from "@backend/infra/db/crash-recovery-repository";
import { CrashRecoveryService } from "@backend/domains/crash-recovery/crash-recovery-service";
import { InstanceLockManager } from "@backend/orchestration/instance-lock-manager";
import type { ServerProfile, ServerRuntimeInfo } from "@shared/types";

class FakeProcesses extends EventEmitter {
  startedAt: string | null = new Date().toISOString();
  active = false;
  live = false;

  getStatus(serverId: string) {
    return {
      serverId,
      status: (this.live ? "running" : "error") as ServerRuntimeInfo["status"],
      processLive: this.live,
      pid: this.live ? 4242 : null,
      startedAt: this.startedAt,
      lastError: null,
    };
  }

  isActive(): boolean {
    return this.active;
  }
}

interface RecordedEvent {
  type: string;
  message: string;
}

function makeHarness() {
  const db: DatabaseSync = openDatabase(":memory:");
  const repo = new CrashRecoveryRepository(db);
  const processes = new FakeProcesses();
  const locks = new InstanceLockManager();
  const events: RecordedEvent[] = [];
  const server = { id: "s1", name: "Alpha", enabled: true } as unknown as ServerProfile;
  const servers = {
    get: (id: string) => (id === "s1" ? server : null),
    list: () => [server],
    addEvent: (
      _serverId: string,
      type: string,
      _severity: string,
      message: string,
    ) => {
      events.push({ type, message });
      return events.length;
    },
  };
  const start = vi.fn(async () => {
    // A real start replaces the managed entry with a fresh process.
    processes.live = true;
    processes.active = true;
    processes.startedAt = new Date().toISOString();
  });
  const instances = {
    start,
    isStopInProgress: () => false,
  };
  const service = new CrashRecoveryService(
    repo,
    servers as never,
    processes as never,
    instances as never,
    locks,
  );
  service.start();
  return { db, repo, processes, locks, events, start, service };
}

function enable(repo: CrashRecoveryRepository, maxAttempts = 3) {
  repo.setPolicy("s1", {
    enabled: true,
    maxAttempts,
    backoffSeconds: 30,
    stabilitySeconds: 600,
    paused: false,
  });
}

function crash(processes: FakeProcesses, lastError = "boom") {
  // The exit event fires after the process is already gone.
  processes.live = false;
  processes.active = false;
  processes.emit("unexpected-exit", {
    serverId: "s1",
    exitCode: 1,
    phase: "running",
    lastError,
    diagnosis: null,
  });
}

describe("CrashRecoveryService", () => {
  let h: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    h = makeHarness();
  });

  afterEach(() => {
    h.service.dispose();
    h.db.close();
    vi.useRealTimers();
  });

  it("does nothing when the policy is off", async () => {
    crash(h.processes);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.events).toHaveLength(0);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("schedules a bounded attempt and restarts after backoff", async () => {
    enable(h.repo);
    crash(h.processes);
    expect(h.events.map((e) => e.type)).toEqual(["auto_restart_scheduled"]);
    expect(h.events[0]?.message).toContain("attempt 1 of 3");
    expect(h.repo.getPolicy("s1").attempts).toBe(1);

    expect(h.start).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.start).toHaveBeenCalledWith("s1");
  });

  it("exhausts the budget after repeated crashes", async () => {
    enable(h.repo);
    for (let i = 1; i <= 3; i += 1) {
      crash(h.processes, `crash ${i}`);
      await vi.advanceTimersByTimeAsync(30_000 * i);
    }
    expect(h.start).toHaveBeenCalledTimes(3);

    crash(h.processes, "crash 4");
    expect(h.events.at(-1)?.type).toBe("auto_restart_exhausted");
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.start).toHaveBeenCalledTimes(3);
  });

  it("resets the budget when the crashed run was stable", () => {
    enable(h.repo);
    h.repo.recordAttempt("s1", 3, "old");
    h.processes.startedAt = new Date(Date.now() - 700_000).toISOString();

    crash(h.processes);
    expect(h.events.at(-1)?.type).toBe("auto_restart_scheduled");
    expect(h.events.at(-1)?.message).toContain("attempt 1 of 3");
    expect(h.repo.getPolicy("s1").attempts).toBe(1);
  });

  it("skips a retry when maintenance becomes active inside the backoff window", async () => {
    enable(h.repo);
    let maintenance = false;
    h.service.setMaintenanceActiveCheck(() => maintenance);
    crash(h.processes);
    expect(h.events.at(-1)?.type).toBe("auto_restart_scheduled");

    maintenance = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("skips while a lifecycle lock is held", async () => {
    enable(h.repo);
    await h.locks.withLock("s1", "restart", async () => {
      crash(h.processes);
    });
    expect(h.events).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("does not restart when the operator already started the server", async () => {
    enable(h.repo);
    crash(h.processes);
    h.processes.active = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("ignores operator-closed exits (#524)", () => {
    enable(h.repo);
    h.processes.emit("operator-closed", {
      serverId: "s1",
      exitCode: 0xc000013a,
      phase: "running",
    });
    expect(h.events).toHaveLength(0);
  });

  it("stops a pending retry when the operator pauses", async () => {
    enable(h.repo);
    crash(h.processes);
    h.service.setPolicy("s1", {
      enabled: true,
      maxAttempts: 3,
      backoffSeconds: 30,
      stabilitySeconds: 600,
      paused: true,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("exposes the pending retry via annotateStatus and clears it on fire", async () => {
    enable(h.repo);
    const base: ServerRuntimeInfo = {
      serverId: "s1",
      status: "error",
      processLive: false,
      pid: null,
      startedAt: null,
      lastError: "boom",
    };
    expect(h.service.annotateStatus(base).crashRecovery ?? null).toBeNull();

    crash(h.processes);
    expect(h.service.annotateStatus(base).crashRecovery).toMatchObject({
      attempt: 1,
      maxAttempts: 3,
      reason: "boom",
    });
    expect(h.service.annotateStatus(base).crashRecovery?.restartAt).toMatch(/T/);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.service.annotateStatus(base).crashRecovery ?? null).toBeNull();
  });

  it("clears the pending retry notice when paused", () => {
    enable(h.repo);
    const base: ServerRuntimeInfo = {
      serverId: "s1",
      status: "error",
      processLive: false,
      pid: null,
      startedAt: null,
      lastError: "boom",
    };
    crash(h.processes);
    expect(h.service.annotateStatus(base).crashRecovery ?? null).not.toBeNull();

    h.service.setPolicy("s1", {
      enabled: true,
      maxAttempts: 3,
      backoffSeconds: 30,
      stabilitySeconds: 600,
      paused: true,
    });
    expect(h.service.annotateStatus(base).crashRecovery ?? null).toBeNull();
  });

  it("clears the pending retry notice when the policy is turned off", async () => {
    enable(h.repo);
    const base: ServerRuntimeInfo = {
      serverId: "s1",
      status: "error",
      processLive: false,
      pid: null,
      startedAt: null,
      lastError: "boom",
    };
    crash(h.processes);
    expect(h.service.annotateStatus(base).crashRecovery ?? null).not.toBeNull();

    h.service.setPolicy("s1", {
      enabled: false,
      maxAttempts: 3,
      backoffSeconds: 30,
      stabilitySeconds: 600,
      paused: false,
    });
    expect(h.service.annotateStatus(base).crashRecovery ?? null).toBeNull();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("shows a fresh count once the live run passes the stability window", () => {
    enable(h.repo);
    h.repo.recordAttempt("s1", 2, "boom");
    h.processes.live = true;
    h.processes.startedAt = new Date(Date.now() - 18 * 60_000).toISOString();

    const policy = h.service.getPolicy("s1");
    expect(policy.attempts).toBe(0);
    expect(policy.exhausted).toBe(false);
  });

  it("keeps the count while the live run is still short", () => {
    enable(h.repo);
    h.repo.recordAttempt("s1", 2, "boom");
    h.processes.live = true;
    h.processes.startedAt = new Date(Date.now() - 60_000).toISOString();

    expect(h.service.getPolicy("s1").attempts).toBe(2);
  });

  it("waits longer before each retry", async () => {
    enable(h.repo);
    crash(h.processes, "c1");
    expect(h.events.at(-1)?.message).toContain("in 30s");

    await vi.advanceTimersByTimeAsync(30_000);
    crash(h.processes, "c2");
    expect(h.events.at(-1)?.message).toContain("in 60s");

    await vi.advanceTimersByTimeAsync(60_000);
    crash(h.processes, "c3");
    expect(h.events.at(-1)?.message).toContain("in 90s");
  });

  it("does not reset the budget from a dead process during backoff", async () => {
    enable(h.repo);
    h.processes.live = true;
    h.processes.startedAt = new Date(Date.now() - 18 * 60_000).toISOString();

    crash(h.processes); // long run -> stabilized -> attempt 1
    expect(h.repo.getPolicy("s1").attempts).toBe(1);

    // Panel poll while the crashed entry (dead process) is still retained.
    h.service.getPolicy("s1");
    expect(h.repo.getPolicy("s1").attempts).toBe(1);

    await vi.advanceTimersByTimeAsync(30_000);
    crash(h.processes, "c2");
    expect(h.events.at(-1)?.message).toContain("attempt 2 of 3");
    expect(h.events.at(-1)?.message).toContain("in 60s");
  });
});
