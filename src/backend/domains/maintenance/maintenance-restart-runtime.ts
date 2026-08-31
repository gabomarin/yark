/**
 * Per-server scheduled restart countdown + InstanceService.restart (#487)
 * and optional post-restart wild wipe (#488).
 */

import {
  MAINTENANCE_RESTART_PRESET_OFFSETS,
} from "@shared/maintenance-policy";
import {
  MAINTENANCE_RESTART_FAIL_LIMIT,
  MAINTENANCE_RCON_SOFT_FAIL_LIMIT,
  MAINTENANCE_RUN_NOW_LEAD_MS,
  MAINTENANCE_WIPE_POST_READY_MS,
  MAINTENANCE_WIPE_READY_TIMEOUT_MS,
  maxWarningLeadMs,
  nextLocalRestartAt,
  parseMaintenanceOffsetToMs,
  renderLastMinuteRestart,
  renderWarningTemplate,
  resolveWarningOffsetLabels,
  shouldUseLastMinuteChat,
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
  /**
   * ISO of the scheduled local target from `nextLocalRestartAt` (schedule only).
   * Used so Cancel / skip mark the same occurrence `considerSchedule` checks.
   */
  scheduleTargetKey: string | null;
  /** Offset labels already Broadcast for this window. */
  firedOffsets: Set<string>;
  /** Consecutive Broadcast failures in this window (soft-fail → hard-fail). */
  rconFailStreak: number;
  cancelRequested: boolean;
  phase: MaintenanceCountdownPhase;
  timer: NodeJS.Timeout | null;
  /**
   * Bumped whenever the timer is cleared so a queued setTimeout callback that
   * races with cancel / reschedule is ignored even if `active` still matches.
   */
  timerGeneration: number;
  runPromise: Promise<void> | null;
  source: "schedule" | "run_now";
}

interface LastRestartMemory {
  atIso: string;
  ok: boolean;
}

interface LastWipeMemory {
  atIso: string;
  ok: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}

export class MaintenanceRestartRuntime {
  private readonly pausedServerIds = new Set<string>();
  private readonly failStreak = new Map<string, number>();
  private readonly active = new Map<string, ActiveCountdown>();
  private readonly lastRestart = new Map<string, LastRestartMemory>();
  private readonly lastWipe = new Map<string, LastWipeMemory>();
  /** Scheduled target keys already completed/skipped this process. */
  private readonly completedTargets = new Set<string>();

  private peerBusy: ((serverId: string) => boolean) | null = null;

  constructor(
    private readonly repo: MaintenanceRepository,
    private readonly servers: ServerRepository,
    private readonly processes: ProcessManager,
    private readonly instances: InstanceService,
  ) {}

  /** Avoid overlapping restart + auto-update windows on the same server. */
  setPeerBusyCheck(check: (serverId: string) => boolean): void {
    this.peerBusy = check;
  }

  private isPeerBusy(serverId: string): boolean {
    return this.peerBusy?.(serverId) === true;
  }

  isSchedulePaused(serverId: string): boolean {
    return this.pausedServerIds.has(serverId);
  }

  /** True while a restart warning / restart / wipe window is active. */
  hasActiveCountdown(serverId: string): boolean {
    return this.active.has(serverId);
  }

  clearSchedulePause(serverId: string): void {
    this.pausedServerIds.delete(serverId);
    this.failStreak.delete(serverId);
  }

  enrichStatus(policy: MaintenancePolicy): MaintenancePolicyStatus {
    const active = this.active.get(policy.serverId);
    const last = this.lastRestart.get(policy.serverId);
    const wipe = this.lastWipe.get(policy.serverId);
    const now = Date.now();
    let nextRestartAt: string | null = null;
    if (policy.restartEnabled && active === undefined) {
      const next = nextLocalRestartAt(
        policy.restartDaysOfWeek,
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
        active !== undefined
        && (active.phase === "warning" || active.phase === "last_minute")
          ? Math.max(0, active.targetAtMs - now)
          : active !== undefined
            ? 0
            : null,
      countdownPhase: active?.phase ?? "idle",
      countdownKind: active !== undefined ? "restart" : null,
      lastRestartAt: last?.atIso ?? null,
      lastRestartOk: last?.ok ?? null,
      lastUpdateAt: null,
      lastUpdateOk: null,
      steamUpdateAvailable: false,
      lastWipeAt: wipe?.atIso ?? null,
      lastWipeOk: wipe?.ok ?? null,
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
      // Scheduler already armed this window — return live status (UI may have
      // been idle until the next poll).
      return this.enrichStatus(policy);
    }
    if (this.isPeerBusy(serverId)) {
      throw new Error(
        "An auto-update countdown is already active — Cancel it first, or wait",
      );
    }
    const targetAtMs = Date.now() + MAINTENANCE_RUN_NOW_LEAD_MS;
    this.startCountdown(policy, targetAtMs, "run_now", null);
    return this.enrichStatus(policy);
  }

  cancelUpcoming(serverId: string): MaintenancePolicyStatus {
    const active = this.active.get(serverId);
    if (active !== undefined) {
      active.cancelRequested = true;
      this.clearTimer(active);
      this.markOccurrenceDone(active);
      this.active.delete(serverId);
    }
    return this.enrichStatus(this.repo.getPolicy(serverId));
  }

  private markOccurrenceDone(state: ActiveCountdown): void {
    if (state.scheduleTargetKey !== null) {
      this.completedTargets.add(state.scheduleTargetKey);
    }
  }

  private isCurrentTick(
    serverId: string,
    expectedTargetAtMs: number,
  ): ActiveCountdown | null {
    const state = this.active.get(serverId);
    if (state === undefined) return null;
    if (state.cancelRequested) return null;
    if (state.targetAtMs !== expectedTargetAtMs) return null;
    return state;
  }

  private async considerSchedule(policy: MaintenancePolicy): Promise<void> {
    if (!policy.restartEnabled) return;
    if (this.pausedServerIds.has(policy.serverId)) return;
    if (this.active.has(policy.serverId)) return;
    if (this.isPeerBusy(policy.serverId)) return;

    const server = this.servers.get(policy.serverId);
    if (server === null || !server.enabled) return;
    if (!this.processes.isActive(policy.serverId)) return;
    if (this.isIntentionalStop(policy.serverId)) return;

    const now = Date.now();
    const next = nextLocalRestartAt(
      policy.restartDaysOfWeek,
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

    this.startCountdown(
      policy,
      Math.max(now + 1_000, next.getTime()),
      "schedule",
      targetKey,
    );
  }

  private startCountdown(
    policy: MaintenancePolicy,
    targetAtMs: number,
    source: "schedule" | "run_now",
    scheduleTargetKey: string | null,
  ): void {
    const remaining = targetAtMs - Date.now();
    const state: ActiveCountdown = {
      serverId: policy.serverId,
      targetAtMs,
      scheduleTargetKey,
      firedOffsets: new Set(),
      rconFailStreak: 0,
      cancelRequested: false,
      phase: shouldUseLastMinuteChat(
        remaining,
        policy.restartWarnings,
        source,
      )
        ? "last_minute"
        : "warning",
      timer: null,
      timerGeneration: 0,
      runPromise: null,
      source,
    };
    this.active.set(policy.serverId, state);
    void this.tickCountdown(policy.serverId, targetAtMs);
  }

  private clearTimer(state: ActiveCountdown): void {
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    state.timerGeneration += 1;
  }

  private scheduleNextTick(
    serverId: string,
    expectedTargetAtMs: number,
    delayMs: number,
  ): void {
    const state = this.isCurrentTick(serverId, expectedTargetAtMs);
    if (state === null) return;
    this.clearTimer(state);
    const generation = state.timerGeneration;
    state.timer = setTimeout(() => {
      // Re-check immediately: clearTimeout does not dequeue an already-queued
      // macrotask, and cancel/reschedule may have raced past clearTimer.
      const current = this.isCurrentTick(serverId, expectedTargetAtMs);
      if (current === null || current.timerGeneration !== generation) return;
      void this.tickCountdown(serverId, expectedTargetAtMs);
    }, delayMs);
    state.timer.unref();
  }

  /**
   * Operator/YARK shutdown in progress or just finished — not an unexpected death.
   * `isActive` stays true while status is `stopping`, so this must be checked
   * before Broadcast / restart work, not only after `!isActive`.
   */
  private isIntentionalStop(serverId: string): boolean {
    if (this.instances.isStopInProgress(serverId)) return true;
    const status = this.processes.getStatus(serverId).status;
    return status === "stopping" || status === "stopped";
  }

  private abortWindowQuiet(state: ActiveCountdown): void {
    this.clearTimer(state);
    this.markOccurrenceDone(state);
    this.active.delete(state.serverId);
  }

  private abortWindowHard(state: ActiveCountdown, message: string): void {
    this.clearTimer(state);
    this.markOccurrenceDone(state);
    this.active.delete(state.serverId);
    this.recordFail(state.serverId, message);
  }

  /** Soft-fail Broadcast; hard-fail after consecutive tick failures. */
  private noteRconOutcome(
    state: ActiveCountdown,
    ok: boolean,
    errorMessage: string,
  ): "continue" | "abort" {
    if (ok) {
      state.rconFailStreak = 0;
      return "continue";
    }
    state.rconFailStreak += 1;
    if (state.rconFailStreak >= MAINTENANCE_RCON_SOFT_FAIL_LIMIT) {
      this.abortWindowHard(
        state,
        `RCON ServerChat failed ${state.rconFailStreak} times: ${errorMessage}`,
      );
      return "abort";
    }
    return "continue";
  }

  private async tickCountdown(
    serverId: string,
    expectedTargetAtMs: number,
  ): Promise<void> {
    const state = this.isCurrentTick(serverId, expectedTargetAtMs);
    if (state === null) {
      const orphan = this.active.get(serverId);
      if (orphan?.cancelRequested === true) this.active.delete(serverId);
      return;
    }

    // Catch UI/stop-all while process is still live (status `stopping`).
    if (this.isIntentionalStop(serverId)) {
      this.abortWindowQuiet(state);
      return;
    }

    if (!this.processes.isActive(serverId)) {
      // Unexpected exit (typically status `error`) — count toward fail-streak.
      this.abortWindowHard(
        state,
        "Server stopped during maintenance countdown",
      );
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

    if (
      shouldUseLastMinuteChat(
        remainingMs,
        policy.restartWarnings,
        state.source,
      )
    ) {
      state.phase = "last_minute";
      const sec = remainingMs / 1_000;
      let broadcastOk = true;
      let broadcastError = "";
      try {
        await this.instances.execRcon(
          serverId,
          `ServerChat ${renderLastMinuteRestart(sec)}`,
          { recordEvent: false },
        );
      } catch (error) {
        broadcastOk = false;
        broadcastError = error instanceof Error ? error.message : String(error);
      }
      const still = this.isCurrentTick(serverId, expectedTargetAtMs);
      if (still === null) return;
      if (this.noteRconOutcome(still, broadcastOk, broadcastError) === "abort") {
        return;
      }
      this.scheduleNextTick(serverId, expectedTargetAtMs, 1_000);
      return;
    }

    if (remainingMs <= 60_000) {
      state.phase = "warning";
      this.scheduleNextTick(
        serverId,
        expectedTargetAtMs,
        Math.max(250, remainingMs),
      );
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
      if (remainingMs > offsetMs) continue;

      let broadcastOk = true;
      let broadcastError = "";
      try {
        await this.instances.execRcon(
          serverId,
          `ServerChat ${renderWarningTemplate(policy.restartWarnings.template, remainingMs)}`,
          { recordEvent: false },
        );
      } catch (error) {
        broadcastOk = false;
        broadcastError = error instanceof Error ? error.message : String(error);
      }
      const still = this.isCurrentTick(serverId, expectedTargetAtMs);
      if (still === null) return;
      if (this.noteRconOutcome(still, broadcastOk, broadcastError) === "abort") {
        return;
      }
      if (broadcastOk) still.firedOffsets.add(label);
    }

    // Wake near next offset or last-minute boundary.
    let wakeIn = Math.min(remainingMs - 60_000, 15_000);
    for (const label of offsets) {
      const offsetMs = parseMaintenanceOffsetToMs(label);
      if (offsetMs === null || state.firedOffsets.has(label)) continue;
      const untilFire = remainingMs - offsetMs;
      if (untilFire > 0 && untilFire < wakeIn) wakeIn = untilFire;
    }
    if (this.isCurrentTick(serverId, expectedTargetAtMs) === null) return;
    this.scheduleNextTick(serverId, expectedTargetAtMs, Math.max(250, wakeIn));
  }

  private async executeRestart(
    policy: MaintenancePolicy,
    state: ActiveCountdown,
  ): Promise<void> {
    if (state.runPromise !== null) return;
    const serverId = policy.serverId;
    const expectedTargetAtMs = state.targetAtMs;
    state.runPromise = (async () => {
      try {
        if (this.isCurrentTick(serverId, expectedTargetAtMs) === null) return;
        if (this.isIntentionalStop(serverId)) {
          this.abortWindowQuiet(state);
          return;
        }
        await this.instances.restart(serverId);
        const atIso = new Date().toISOString();
        this.lastRestart.set(serverId, { atIso, ok: true });
        this.failStreak.delete(serverId);
        this.markOccurrenceDone(state);

        if (policy.wipeEnabled) {
          const still = this.isCurrentTick(serverId, expectedTargetAtMs);
          if (still === null) return;
          still.phase = "wiping";
          try {
            await this.runPostRestartWipe(serverId, policy);
            this.lastWipe.set(serverId, {
              atIso: new Date().toISOString(),
              ok: true,
            });
          } catch (wipeError) {
            const message =
              wipeError instanceof Error ? wipeError.message : String(wipeError);
            this.lastWipe.set(serverId, {
              atIso: new Date().toISOString(),
              ok: false,
            });
            // Restart already succeeded — do not inflate restart fail-streak.
            this.servers.addEvent(
              serverId,
              "error",
              "error",
              "Maintenance wild wipe failed",
              {
                what: "Post-restart DestroyWildDinos did not complete.",
                cause: message,
                suggestion:
                  "Confirm RCON works, then wipe manually from the RCON panel or wait for the next restart window.",
              },
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.lastRestart.set(serverId, {
          atIso: new Date().toISOString(),
          ok: false,
        });
        this.markOccurrenceDone(state);
        this.recordFail(serverId, message);
      } finally {
        this.clearTimer(state);
        const current = this.active.get(serverId);
        if (current !== undefined && current.targetAtMs === expectedTargetAtMs) {
          this.active.delete(serverId);
        }
      }
    })();
    await state.runPromise;
  }

  /**
   * After a successful maintenance restart: wait for ready, settle, optional
   * SaveWorld, then DestroyWildDinos (#488). Launch ForceRespawnDinos is unchanged.
   */
  private async runPostRestartWipe(
    serverId: string,
    policy: MaintenancePolicy,
  ): Promise<void> {
    await this.waitUntilRunningForWipe(serverId);
    if (this.isIntentionalStop(serverId)) {
      throw new Error("Stop in progress during post-restart wipe");
    }
    await this.ensureRconForWipe(serverId);
    await delay(MAINTENANCE_WIPE_POST_READY_MS);
    if (this.isIntentionalStop(serverId)) {
      throw new Error("Stop in progress during post-restart wipe");
    }
    if (!this.processes.isActive(serverId)) {
      throw new Error("Server stopped before wild wipe");
    }
    if (policy.wipeSaveWorldFirst) {
      await this.instances.execRcon(serverId, "SaveWorld", {
        recordEvent: false,
      });
    }
    await this.instances.execRcon(serverId, "DestroyWildDinos", {
      recordEvent: false,
    });
  }

  private async waitUntilRunningForWipe(serverId: string): Promise<void> {
    const deadline = Date.now() + MAINTENANCE_WIPE_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.isIntentionalStop(serverId)) {
        throw new Error("Stop in progress while waiting for post-restart ready");
      }
      const status = this.processes.getStatus(serverId).status;
      if (status === "running") return;
      if (status === "error" || status === "stopped") {
        throw new Error(
          `Server left starting (${status}) before post-restart wipe`,
        );
      }
      await delay(500);
    }
    throw new Error("Timed out waiting for server ready after restart (wipe)");
  }

  private async ensureRconForWipe(serverId: string): Promise<void> {
    const deadline = Date.now() + 60_000;
    let lastError = "RCON not ready";
    while (Date.now() < deadline) {
      if (this.isIntentionalStop(serverId)) {
        throw new Error("Stop in progress while waiting for RCON (wipe)");
      }
      try {
        await this.instances.retryRconConnection(serverId);
        await this.instances.execRcon(serverId, "ListPlayers", {
          recordEvent: false,
        });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        await delay(1_000);
      }
    }
    throw new Error(`RCON not ready for wipe: ${lastError}`);
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
