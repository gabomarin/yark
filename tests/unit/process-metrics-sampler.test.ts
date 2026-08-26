import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerRuntimeInfo } from "../../src/shared/types";
import { ProcessMetricsSampler } from "../../src/backend/domains/instances/process-metrics-sampler";

class FakeProcessManager extends EventEmitter {
  private statuses = new Map<string, ServerRuntimeInfo>();

  listManagedServerIds(): string[] {
    return [...this.statuses.keys()];
  }

  listStatuses(ids: string[]): ServerRuntimeInfo[] {
    return ids.map(
      (id) =>
        this.statuses.get(id) ?? {
          serverId: id,
          status: "stopped",
          processLive: false,
          pid: null,
          startedAt: null,
          lastError: null,
        },
    );
  }

  setLive(serverId: string, pid: number): void {
    this.statuses.set(serverId, {
      serverId,
      status: "running",
      processLive: true,
      pid,
      startedAt: null,
      lastError: null,
    });
  }

  setStopped(serverId: string): void {
    const info: ServerRuntimeInfo = {
      serverId,
      status: "stopped",
      processLive: false,
      pid: null,
      startedAt: null,
      lastError: null,
    };
    this.statuses.set(serverId, info);
    this.emit("status", info);
  }
}

describe("ProcessMetricsSampler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits working set on first tick and CPU after the second (#302)", async () => {
    const processes = new FakeProcessManager();
    processes.setLive("srv-1", 4242);
    const sampleResources = vi
      .fn()
      .mockResolvedValueOnce(
        new Map([[4242, { pid: 4242, workingSetBytes: 2_147_483_648, cpuSeconds: 10 }]]),
      )
      .mockResolvedValueOnce(
        new Map([[4242, { pid: 4242, workingSetBytes: 2_147_483_648, cpuSeconds: 12 }]]),
      );

    const sampler = new ProcessMetricsSampler(
      processes as never,
      60_000,
      sampleResources,
    );
    const updates: unknown[] = [];
    sampler.on("metrics-updated", (payload) => updates.push(payload));

    vi.useFakeTimers({ now: 1_000 });
    sampler.start();
    sampler.setSamplingEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      serverId: "srv-1",
      pid: 4242,
      workingSetBytes: 2_147_483_648,
      cpuPercent: null,
      error: null,
    });

    vi.setSystemTime(5_000);
    processes.emit("status", processes.listStatuses(["srv-1"])[0]);
    await vi.advanceTimersByTimeAsync(0);

    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({
      serverId: "srv-1",
      workingSetBytes: 2_147_483_648,
      cpuPercent: 50,
      error: null,
    });

    sampler.stop();
  });

  it("clears metrics when the process leaves (#302)", async () => {
    const processes = new FakeProcessManager();
    processes.setLive("srv-1", 99);
    const sampleResources = vi.fn().mockResolvedValue(
      new Map([[99, { pid: 99, workingSetBytes: 1000, cpuSeconds: 1 }]]),
    );
    const sampler = new ProcessMetricsSampler(
      processes as never,
      60_000,
      sampleResources,
    );
    const updates: Array<{ pid: number; workingSetBytes: number | null }> = [];
    sampler.on(
      "metrics-updated",
      (payload: { pid: number; workingSetBytes: number | null }) => {
        updates.push(payload);
      },
    );

    sampler.start();
    sampler.setSamplingEnabled(true);
    await vi.waitFor(() => {
      expect(updates.some((u) => u.pid === 99)).toBe(true);
    });

    processes.setStopped("srv-1");
    await vi.waitFor(() => {
      expect(updates.at(-1)).toMatchObject({
        pid: 0,
        workingSetBytes: null,
        cpuPercent: null,
      });
    });

    const clearsBefore = updates.filter((u) => u.pid === 0).length;
    processes.setStopped("srv-1");
    await Promise.resolve();
    expect(updates.filter((u) => u.pid === 0)).toHaveLength(clearsBefore);
    // No permanent "cleared" fingerprint left behind.
    expect(
      (sampler as unknown as { lastPush: Map<string, string> }).lastPush.has(
        "srv-1",
      ),
    ).toBe(false);

    sampler.stop();
  });

  it("skips PowerShell ticks until sampling is enabled (#302)", async () => {
    const processes = new FakeProcessManager();
    processes.setLive("srv-1", 7);
    const sampleResources = vi.fn().mockResolvedValue(
      new Map([[7, { pid: 7, workingSetBytes: 100, cpuSeconds: 1 }]]),
    );
    const sampler = new ProcessMetricsSampler(
      processes as never,
      60_000,
      sampleResources,
    );
    const updates: unknown[] = [];
    sampler.on("metrics-updated", (payload) => updates.push(payload));

    sampler.start();
    await Promise.resolve();
    expect(sampleResources).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);

    sampler.setSamplingEnabled(true);
    await vi.waitFor(() => {
      expect(sampleResources).toHaveBeenCalled();
      expect(updates.length).toBeGreaterThan(0);
    });

    sampler.setSamplingEnabled(false);
    sampleResources.mockClear();
    processes.emit("status", processes.listStatuses(["srv-1"])[0]);
    await Promise.resolve();
    expect(sampleResources).not.toHaveBeenCalled();

    sampler.stop();
  });

  it("clears pushed samples when sampling turns off so UI does not keep stale RAM/CPU (#302)", async () => {
    const processes = new FakeProcessManager();
    processes.setLive("srv-1", 42);
    const sampleResources = vi.fn().mockResolvedValue(
      new Map([[42, { pid: 42, workingSetBytes: 2048, cpuSeconds: 1 }]]),
    );
    const sampler = new ProcessMetricsSampler(
      processes as never,
      60_000,
      sampleResources,
    );
    const updates: Array<{ pid: number; workingSetBytes: number | null }> = [];
    sampler.on(
      "metrics-updated",
      (payload: { pid: number; workingSetBytes: number | null }) => {
        updates.push(payload);
      },
    );

    sampler.start();
    sampler.setSamplingEnabled(true);
    await vi.waitFor(() => {
      expect(updates.some((u) => u.pid === 42)).toBe(true);
    });

    sampler.setSamplingEnabled(false);
    expect(updates.at(-1)).toMatchObject({
      pid: 0,
      workingSetBytes: null,
      cpuPercent: null,
    });
    expect(
      (sampler as unknown as { lastPush: Map<string, string> }).lastPush.size,
    ).toBe(0);

    sampler.stop();
  });

  it("clears CPU baselines when sampling turns off so idle gaps do not inflate % (#302)", async () => {
    const processes = new FakeProcessManager();
    processes.setLive("srv-1", 4242);
    const sampleResources = vi
      .fn()
      .mockResolvedValueOnce(
        new Map([[4242, { pid: 4242, workingSetBytes: 1_000, cpuSeconds: 10 }]]),
      )
      .mockResolvedValueOnce(
        new Map([[4242, { pid: 4242, workingSetBytes: 1_000, cpuSeconds: 12 }]]),
      )
      .mockResolvedValueOnce(
        new Map([[4242, { pid: 4242, workingSetBytes: 1_000, cpuSeconds: 12.1 }]]),
      );

    const sampler = new ProcessMetricsSampler(
      processes as never,
      60_000,
      sampleResources,
    );
    const updates: Array<{ cpuPercent: number | null }> = [];
    sampler.on(
      "metrics-updated",
      (payload: { cpuPercent: number | null }) => {
        updates.push(payload);
      },
    );

    vi.useFakeTimers({ now: 1_000 });
    sampler.start();
    sampler.setSamplingEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(updates.at(-1)?.cpuPercent).toBeNull();

    vi.setSystemTime(5_000);
    processes.emit("status", processes.listStatuses(["srv-1"])[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(updates.at(-1)?.cpuPercent).toBe(50);

    sampler.setSamplingEnabled(false);
    // Long gap while the operator is on Settings / elsewhere.
    vi.setSystemTime(120_000);
    sampler.setSamplingEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    // Fresh baseline after re-enable — must not average 2 CPU-s over 115s.
    expect(updates.at(-1)?.cpuPercent).toBeNull();

    sampler.stop();
  });
});
