/**
 * Per-server scheduled restart countdown + InstanceService.restart (#487).
 */

import {
  MAINTENANCE_RESTART_PRESET_OFFSETS,
} from "@shared/maintenance-policy";
import {
  MAINTENANCE_RESTART_FAIL_LIMIT,
  MAINTENANCE_RUN_NOW_LEAD_MS,
  maxWarningLeadMs,
  nextLocalRestartAt,
  parseMaintenanceOffsetToMs,
  renderLastMinuteRestart,
  renderWarningTemplate,
  resolveWarningOffsetLabels,
} from "@shared/maintenance-schedule";
import type {
  MaintenanceCountdownPhase,
  MaintenancePolicy,
  MaintenancePolicyStatus,
} from "@shared/types";
import type { InstanceService } from "../instances/instance-service";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { MaintenanceRepository } from "../../infra/db/maintenance-repository";

interface ActiveCountdown {
  serverId: string;
  targetAtMs: number;
  /** Offset labels already Broadcast for this window. */
  firedOffsets: Set<string>;
  cancelRequested: boolean;
  phase: MaintenanceCountdownPhase;
  timer: NodeJS.Timeout | null;
  runPromise: Promise<void> | null;
  source: "schedule" | "run_now";
}

interface LastRestartMemory {
  atIso: string;
  ok: boolean;
}

export class MaintenanceRestartRuntime {
  private readonly pausedServerIds = new Set<string>();
  private readonly failStreak = new Map<string, number>();
  private readonly active = new Map<string, ActiveCountdown>();
  private readonly lastRestart = new Map<string, LastRestartMemory>();
  /** Scheduled target keys already completed this process (`ISO` of target). */
  private readonly completedTargets = new Set<string>();

  constructor(
    private readonly repo: MaintenanceRepository,
    private readonly servers: ServerRepository,
    private readonly processes: ProcessManager,
    private readonly instances: InstanceService,
  ) {}

  isSchedulePaused(serverId: string): boolean {
    return this.pausedServerIds.has(serverId);
  }

  clearSchedulePause(serverId: string): void {
    this.pausedServerIds.delete(serverId);
    this.failStreak.delete(serverId);
  }

  enrichStatus(policy: MaintenancePolicy): MaintenancePolicyStatus {
    const active = this.active.get(policy.serverId);
    const last = this.lastRestart.get(policy.serverId);
    const now = Date.now();
    let nextRestartAt: string | null = null;
    if (policy.restartEnabled && active === undefined) {
      const next = nextLocalRestartAt(
        policy.restartCadence,
        policy.restartDayOfWeek,
        policy.restartTimeLocal,
        now,
      );
      if (next !== null) nextRestartAt = next.toISOString();
    } else if (active !== undefined) {
      nextRestartAt = new Date(active.targetAtMs).toISOString();
    }

    return {
      ...policy,
      schedulePaused: this.pausedServerIds.has(policy.serverId),
      nextRestartAt,
      countdownRemainingMs:
        active !== undefined ? Math.max(0, active.targetAtMs - now) : null,
      countdownPhase: active?.phase ?? "idle",
      lastRestartAt: last?.atIso ?? null,
      lastRestartOk: last?.ok ?? null,
      cancelable:
        active !== undefined
        && (active.phase === "warning" || active.phase === "last_minute")
        && !active.cancelRequested,
    };
  }

  async runScheduledCycle(): Promise<void> {
    const policies = this.repo.listPolicies();
    for (const policy of policies) {
      try {
        await this.considerSchedule(policy);
      } catch (error) {
        console.error(
          `Maintenance schedule tick failed for ${policy.serverId}`,
          error,
        );
      }
    }
  }

  async runRestartNow(serverId: string): Promise<MaintenancePolicyStatus> {
    const policy = this.repo.getPolicy(serverId);
    const server = this.servers.get(serverId);
    if (server === null) throw new Error("Server does not exist");
    if (!server.enabled) throw new Error("Server is disabled");
    if (!this.processes.isActive(serverId)) {
      throw new Error("Server is not running");
    }
    if (this.pausedServerIds.has(serverId)) {
      throw new Error("Maintenance schedules are paused for this server");
    }
    if (this.active.has(serverId)) {
      throw new Error("A maintenance countdown is already active");
    }
    const targetAtMs = Date.now() + MAINTENANCE_RUN_NOW_LEAD_MS;
    this.startCountdown(policy, targetAtMs, "run_now");
    return this.enrichStatus(policy);
  }

  cancelUpcoming(serverId: string): MaintenancePolicyStatus {
    const active = this.active.get(serverId);
    if (active !== undefined) {
      active.cancelRequested = true;
      this.clearTimer(active);
      this.active.delete(serverId);
    }
    return this.enrichStatus(this.repo.getPolicy(serverId));
  }

  private async considerSchedule(policy: MaintenancePolicy): Promise<void> {
    if (!policy.restartEnabled) return;
    if (this.pausedServerIds.has(policy.serverId)) return;
    if (this.active.has(policy.serverId)) return;

    const server = this.servers.get(policy.serverId);
    if (server === null || !server.enabled) return;
    if (!this.processes.isActive(policy.serverId)) return;

    const now = Date.now();
    const next = nextLocalRestartAt(
      policy.restartCadence,
      policy.restartDayOfWeek,
      policy.restartTimeLocal,
      now,
    );
    if (next === null) return;
    const targetKey = next.toISOString();
    if (this.completedTargets.has(targetKey)) return;

    const offsets = resolveWarningOffsetLabels(
      policy.restartWarnings,
      MAINTENANCE_RESTART_PRESET_OFFSETS,
    );
    const lead = maxWarningLeadMs(offsets);
    const remaining = next.getTime() - now;
    if (remaining > lead) return;

    // Too late for a useful warning window — skip this occurrence.
    if (remaining < -30_000) {
      this.completedTargets.add(targetKey);
      return;
    }

    this.startCountdown(policy, Math.max(now + 1_000, next.getTime()), "schedule");
  }

  private startCountdown(
    policy: MaintenancePolicy,
    targetAtMs: number,
    source: "schedule" | "run_now",
  ): void {
    const state: ActiveCountdown = {
      serverId: policy.serverId,
      targetAtMs,
      firedOffsets: new Set(),
      cancelRequested: false,
      phase: targetAtMs - Date.now() <= 60_000 ? "last_minute" : "warning",
      timer: null,
      runPromise: null,
      source,
    };
    this.active.set(policy.serverId, state);
    void this.tickCountdown(policy.serverId);
  }

  private clearTimer(state: ActiveCountdown): void {
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  private scheduleNextTick(serverId: string, delayMs: number): void {
    const state = this.active.get(serverId);
    if (state === undefined) return;
    this.clearTimer(state);
    state.timer = setTimeout(() => {
      void this.tickCountdown(serverId);
    }, delayMs);
    state.timer.unref();
  }

  private async tickCountdown(serverId: string): Promise<void> {
    const state = this.active.get(serverId);
    if (state === undefined) return;
    if (state.cancelRequested) {
      this.active.delete(serverId);
      return;
    }
    if (!this.processes.isActive(serverId)) {
      this.active.delete(serverId);
      this.recordFail(serverId, "Server stopped during maintenance countdown");
      return;
    }

    const policy = this.repo.getPolicy(serverId);
    const now = Date.now();
    const remainingMs = state.targetAtMs - now;

    if (remainingMs <= 0) {
      state.phase = "restarting";
      await this.executeRestart(policy, state);
      return;
    }

    if (remainingMs <= 60_000) {
      state.phase = "last_minute";
      const sec = remainingMs / 1_000;
      try {
        await this.instances.execRcon(
          serverId,
          `Broadcast ${renderLastMinuteRestart(sec)}`,
          { recordEvent: false },
        );
      } catch (error) {
        this.active.delete(serverId);
        this.recordFail(
          serverId,
          error instanceof Error ? error.message : String(error),
        );
        return;
      }
      this.scheduleNextTick(serverId, 1_000);
      return;
    }

    state.phase = "warning";
    const offsets = resolveWarningOffsetLabels(
      policy.restartWarnings,
      MAINTENANCE_RESTART_PRESET_OFFSETS,
    );
    for (const label of offsets) {
      const offsetMs = parseMaintenanceOffsetToMs(label);
      if (offsetMs === null) continue;
      if (state.firedOffsets.has(label)) continue;
      // Fire when we first cross this offset (remaining <= offset, once).
      if (remainingMs <= offsetMs) {
        state.firedOffsets.add(label);
        try {
          await this.instances.execRcon(
            serverId,
            `Broadcast ${renderWarningTemplate(policy.restartWarnings.template, remainingMs)}`,
            { recordEvent: false },
          );
        } catch (error) {
          this.active.delete(serverId);
          this.recordFail(
            serverId,
            error instanceof Error ? error.message : String(error),
          );
          return;
        }
      }
    }

    // Wake near next offset or last-minute boundary.
    let wakeIn = Math.min(remainingMs - 60_000, 15_000);
    for (const label of offsets) {
      const offsetMs = parseMaintenanceOffsetToMs(label);
      if (offsetMs === null || state.firedOffsets.has(label)) continue;
      const untilFire = remainingMs - offsetMs;
      if (untilFire > 0 && untilFire < wakeIn) wakeIn = untilFire;
    }
    this.scheduleNextTick(serverId, Math.max(250, wakeIn));
  }

  private async executeRestart(
    policy: MaintenancePolicy,
    state: ActiveCountdown,
  ): Promise<void> {
    if (state.runPromise !== null) return;
    const serverId = policy.serverId;
    const targetKey = new Date(state.targetAtMs).toISOString();
    state.runPromise = (async () => {
      try {
        if (state.cancelRequested) return;
        await this.instances.restart(serverId);
        const atIso = new Date().toISOString();
        this.lastRestart.set(serverId, { atIso, ok: true });
        this.failStreak.delete(serverId);
        if (state.source === "schedule") {
          this.completedTargets.add(targetKey);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.lastRestart.set(serverId, {
          atIso: new Date().toISOString(),
          ok: false,
        });
        this.recordFail(serverId, message);
      } finally {
        this.clearTimer(state);
        this.active.delete(serverId);
      }
    })();
    await state.runPromise;
  }

  private recordFail(serverId: string, message: string): void {
    const streak = (this.failStreak.get(serverId) ?? 0) + 1;
    this.failStreak.set(serverId, streak);
    this.servers.addEvent(serverId, "error", "error", "Maintenance restart failed", {
      what: "A maintenance restart did not complete.",
      cause: message,
      suggestion:
        streak >= MAINTENANCE_RESTART_FAIL_LIMIT
          ? "Automatic maintenance is paused for this YARK session — resume when ready."
          : "Check RCON, locks, and server health, then retry or wait for the next window.",
    });
    if (streak >= MAINTENANCE_RESTART_FAIL_LIMIT) {
      this.pausedServerIds.add(serverId);
    }
  }
}
