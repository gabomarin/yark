import { EventEmitter } from "node:events";
import type { ProcessMetricsUpdatedPush } from "@shared/ipc";
import type { ServerRuntimeInfo } from "@shared/types";
import type { ProcessManager } from "../../infra/process/process-manager";
import {
  cpuPercentFromDeltas,
  queryWindowsProcessResources,
} from "../../infra/process/windows-process-sample";

const DEFAULT_POLL_MS = 4_000;

export type ProcessMetricsSample = ProcessMetricsUpdatedPush;

interface PriorCpu {
  pid: number;
  cpuSeconds: number;
  atMs: number;
}

/**
 * Periodically samples working set + CPU for live tracked dedicated PIDs (#302).
 * Skips work when every server is stopped. Emits only when fingerprints change.
 */
export class ProcessMetricsSampler extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private pendingRetick = false;
  /** When false, skip sample ticks (Overview / Status panel not visible). */
  private samplingEnabled = false;
  private readonly priorCpu = new Map<string, PriorCpu>();
  private readonly lastPush = new Map<string, string>();

  constructor(
    private readonly processes: ProcessManager,
    private readonly pollMs = DEFAULT_POLL_MS,
    private readonly sampleResources: typeof queryWindowsProcessResources = queryWindowsProcessResources,
  ) {
    super();
  }

  /**
   * Gate PowerShell sampling to surfaces that show metrics (#302):
   * Overview, or workspace Status panel (wide always / compact drawer open).
   * Disabling clears CPU baselines so the next enable starts fresh (null CPU
   * until a second tick) instead of averaging over the idle gap.
   */
  setSamplingEnabled(enabled: boolean): void {
    if (this.samplingEnabled === enabled) return;
    this.samplingEnabled = enabled;
    if (!enabled) {
      this.priorCpu.clear();
      return;
    }
    void this.tick();
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollMs);
    this.timer.unref();
    this.processes.on("status", this.onProcessStatus);
    if (this.samplingEnabled) {
      void this.tick();
    }
  }

  stop(): void {
    this.processes.off("status", this.onProcessStatus);
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.priorCpu.clear();
    this.lastPush.clear();
  }

  private readonly onProcessStatus = (info: ServerRuntimeInfo): void => {
    if (!info.processLive || info.pid == null) {
      this.clearServer(info.serverId);
      return;
    }
    if (this.samplingEnabled) {
      void this.tick();
    }
  };

  private clearServer(serverId: string): void {
    this.priorCpu.delete(serverId);
    const previous = this.lastPush.get(serverId);
    // Never sampled, or already cleared and dropped — nothing to push / retain.
    if (previous === undefined) {
      return;
    }
    // Drop the fingerprint instead of storing a permanent "cleared" marker so
    // create/stop churn cannot grow lastPush unboundedly (#302).
    this.lastPush.delete(serverId);
    const payload: ProcessMetricsSample = {
      serverId,
      pid: 0,
      workingSetBytes: null,
      cpuPercent: null,
      sampledAt: new Date().toISOString(),
      error: null,
    };
    this.emit("metrics-updated", payload);
  }

  private async tick(): Promise<void> {
    if (this.ticking) {
      this.pendingRetick = true;
      return;
    }
    this.ticking = true;
    try {
      do {
        this.pendingRetick = false;
        await this.tickOnce();
      } while (this.pendingRetick);
    } finally {
      this.ticking = false;
    }
  }

  private async tickOnce(): Promise<void> {
    if (!this.samplingEnabled) {
      return;
    }
    const live: Array<{ serverId: string; pid: number }> = [];
    for (const info of this.processes.listStatuses(
      this.processes.listManagedServerIds(),
    )) {
      if (info.processLive && info.pid != null && info.pid > 0) {
        live.push({ serverId: info.serverId, pid: info.pid });
      }
    }

    const liveIds = new Set(live.map((row) => row.serverId));
    for (const serverId of [...this.priorCpu.keys()]) {
      if (!liveIds.has(serverId)) {
        this.clearServer(serverId);
      }
    }

    if (live.length === 0) {
      return;
    }

    const nowMs = Date.now();
    const sampledAt = new Date(nowMs).toISOString();
    const byPid = await this.sampleResources(live.map((row) => row.pid));
    // Sampling may have been turned off while PowerShell ran — drop the batch.
    if (!this.samplingEnabled) {
      return;
    }

    for (const row of live) {
      const resource = byPid.get(row.pid);
      if (resource === undefined) {
        this.priorCpu.delete(row.serverId);
        this.emitIfChanged({
          serverId: row.serverId,
          pid: row.pid,
          workingSetBytes: null,
          cpuPercent: null,
          sampledAt,
          error: "sample_miss",
        });
        continue;
      }

      const prior = this.priorCpu.get(row.serverId);
      let cpuPercent: number | null = null;
      if (prior !== undefined && prior.pid === row.pid) {
        cpuPercent = cpuPercentFromDeltas({
          prevCpuSeconds: prior.cpuSeconds,
          nextCpuSeconds: resource.cpuSeconds,
          prevAtMs: prior.atMs,
          nextAtMs: nowMs,
        });
      }

      this.priorCpu.set(row.serverId, {
        pid: row.pid,
        cpuSeconds: resource.cpuSeconds,
        atMs: nowMs,
      });

      this.emitIfChanged({
        serverId: row.serverId,
        pid: row.pid,
        workingSetBytes: resource.workingSetBytes,
        cpuPercent,
        sampledAt,
        error: null,
      });
    }
  }

  private emitIfChanged(sample: ProcessMetricsSample): void {
    const ramMb =
      sample.workingSetBytes == null
        ? "n"
        : Math.round(sample.workingSetBytes / (1024 * 1024));
    const fingerprint = [
      sample.pid,
      ramMb,
      sample.cpuPercent ?? "n",
      sample.error ?? "",
    ].join("|");
    if (this.lastPush.get(sample.serverId) === fingerprint) {
      return;
    }
    this.lastPush.set(sample.serverId, fingerprint);
    this.emit("metrics-updated", sample);
  }
}
