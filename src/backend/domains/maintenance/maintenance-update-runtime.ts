/**
 * Opt-in auto-update when Steam buildid differs (#489).
 * Broadcast countdown (update presets + last-minute 1 Hz), then
 * UpdateService.enqueueUpdateForMaintenance (wasRunning → stop → safe update → start).
 */

import {
  MAINTENANCE_UPDATE_PRESET_OFFSETS,
} from "@shared/maintenance-policy";
import {
  MAINTENANCE_RESTART_FAIL_LIMIT,
  MAINTENANCE_RCON_SOFT_FAIL_LIMIT,
  MAINTENANCE_RUN_NOW_LEAD_MS,
  maxWarningLeadMs,
  parseMaintenanceOffsetToMs,
  renderLastMinuteUpdate,
  renderWarningTemplate,
  resolveWarningOffsetLabels,
} from "@shared/maintenance-schedule";
import { isServerUpdateAvailable } from "@shared/server-update-status";
import type {
  MaintenanceCountdownPhase,
  MaintenancePolicy,
  MaintenancePolicyStatus,
} from "@shared/types";
import type { InstanceService } from "../instances/instance-service";
import type { UpdateService } from "../updates/update-service";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { MaintenanceRepository } from "../../infra/db/maintenance-repository";
import type { MaintenanceRestartRuntime } from "./maintenance-restart-runtime";

interface ActiveUpdateCountdown {
  serverId: string;
  targetAtMs: number;
  /** `${serverId}:${officialSteamBuild}` — skip re-arm while this build is pending. */
  availabilityKey: string;
  firedOffsets: Set<string>;
  rconFailStreak: number;
  cancelRequested: boolean;
  phase: MaintenanceCountdownPhase;
  timer: NodeJS.Timeout | null;
  timerGeneration: number;
  runPromise: Promise<void> | null;
  source: "schedule" | "run_now";
}

interface LastUpdateMemory {
  atIso: string;
  ok: boolean;
}

export class MaintenanceUpdateRuntime {
  private readonly pausedServerIds = new Set<string>();
  private readonly failStreak = new Map<string, number>();
  private readonly active = new Map<string, ActiveUpdateCountdown>();
  private readonly lastUpdate = new Map<string, LastUpdateMemory>();
  /** Availability keys already armed/enqueued this session. */
  private readonly handledAvailability = new Set<string>();

  constructor(
    private readonly repo: MaintenanceRepository,
    private readonly servers: ServerRepository,
    private readonly processes: ProcessManager,
    private readonly instances: InstanceService,
    private readonly updates: UpdateService,
    private readonly restarts: MaintenanceRestartRuntime,
  ) {}

  isSchedulePaused(serverId: string): boolean {
    return this.pausedServerIds.has(serverId);
  }

  hasActiveCountdown(serverId: string): boolean {
    return this.active.has(serverId);
  }

  clearSchedulePause(serverId: string): void {
    this.pausedServerIds.delete(serverId);
    this.failStreak.delete(serverId);
  }

  /** Overlay update session fields onto restart-enriched status. */
  mergeStatus(status: MaintenancePolicyStatus): MaintenancePolicyStatus {
    const active = this.active.get(status.serverId);
    const last = this.lastUpdate.get(status.serverId);
    const now = Date.now();
    const updatePaused = this.pausedServerIds.has(status.serverId);
    if (active === undefined) {
      return {
        ...status,
        schedulePaused: status.schedulePaused || updatePaused,
        lastUpdateAt: last?.atIso ?? null,
        lastUpdateOk: last?.ok ?? null,
      };
    }
    return {
      ...status,
      schedulePaused: status.schedulePaused || updatePaused,
      countdownRemainingMs:
        active.phase === "warning" || active.phase === "last_minute"
          ? Math.max(0, active.targetAtMs - now)
          : 0,
      countdownPhase: active.phase,
      countdownKind: "update",
      lastUpdateAt: last?.atIso ?? null,
      lastUpdateOk: last?.ok ?? null,
      cancelable:
        (active.phase === "warning" || active.phase === "last_minute")
        && !active.cancelRequested,
    };
  }

  async runScheduledCycle(): Promise<void> {
    const policies = this.repo.listPolicies();
    let installSnapshot: Awaited<
      ReturnType<InstanceService["installationInfo"]>
    > | null = null;

    for (const policy of policies) {
      try {
        if (!policy.updateEnabled) continue;
        if (this.pausedServerIds.has(policy.serverId)) continue;
        if (this.active.has(policy.serverId)) continue;
        if (this.restarts.hasActiveCountdown(policy.serverId)) continue;
        if (this.updates.hasOccupyingFilesJob(policy.serverId)) continue;

        const server = this.servers.get(policy.serverId);
        if (server === null || !server.enabled) continue;

        if (installSnapshot === null) {
          installSnapshot = await this.instances.installationInfo(false);
        }
        const installation = installSnapshot.servers.find(
          (row) => row.serverId === policy.serverId,
        );
        if (
          !isServerUpdateAvailable(
            installation,
            installSnapshot.officialSteamBuild,
          )
        ) {
          continue;
        }
        const official = installSnapshot.officialSteamBuild ?? "unknown";
        const availabilityKey = `${policy.serverId}:${official}`;
        if (this.handledAvailability.has(availabilityKey)) continue;

        if (!this.processes.isActive(policy.serverId)) {
          // Stopped + outdated: queue safe update without Broadcast.
          this.handledAvailability.add(availabilityKey);
          try {
            await this.updates.enqueueUpdate(policy.serverId);
            this.lastUpdate.set(policy.serverId, {
              atIso: new Date().toISOString(),
              ok: true,
            });
            this.failStreak.delete(policy.serverId);
          } catch (error) {
            this.handledAvailability.delete(availabilityKey);
            this.recordFail(
              policy.serverId,
              error instanceof Error ? error.message : String(error),
            );
          }
          continue;
        }

        if (this.isIntentionalStop(policy.serverId)) continue;

        const offsets = resolveWarningOffsetLabels(
          policy.updateWarnings,
          MAINTENANCE_UPDATE_PRESET_OFFSETS,
        );
        const lead = maxWarningLeadMs(offsets);
        const targetAtMs = Date.now() + lead;
        this.handledAvailability.add(availabilityKey);
        this.startCountdown(policy, targetAtMs, "schedule", availabilityKey);
      } catch (error) {
        console.error(
          `Maintenance update tick failed for ${policy.serverId}`,
          error,
        );
      }
    }
  }

  async runUpdateNow(serverId: string): Promise<MaintenancePolicyStatus> {
    const policy = this.repo.getPolicy(serverId);
    const server = this.servers.get(serverId);
    if (server === null) throw new Error("Server does not exist");
    if (!server.enabled) throw new Error("Server is disabled");
    if (!policy.updateEnabled) {
      throw new Error("Auto-update is off for this server");
    }
    if (this.pausedServerIds.has(serverId)) {
      throw new Error("Maintenance schedules are paused for this server");
    }
    if (this.active.has(serverId) || this.restarts.hasActiveCountdown(serverId)) {
      if (this.active.has(serverId)) {
        return this.mergeStatus(this.restarts.enrichStatus(policy));
      }
      throw new Error(
        "A restart countdown is already active — Cancel it first, or wait",
      );
    }
    if (this.updates.hasOccupyingFilesJob(serverId)) {
      throw new Error("A files job is already queued for this server");
    }
    if (!this.processes.isActive(serverId)) {
      throw new Error("Server is not running — use Downloads Update while stopped");
    }
    const snapshot = await this.instances.installationInfo(false);
    const installation = snapshot.servers.find((row) => row.serverId === serverId);
    if (!isServerUpdateAvailable(installation, snapshot.officialSteamBuild)) {
      throw new Error("No Steam update is available for this server");
    }
    const official = snapshot.officialSteamBuild ?? "unknown";
    const availabilityKey = `${serverId}:${official}`;
    this.handledAvailability.add(availabilityKey);
    this.startCountdown(
      policy,
      Date.now() + MAINTENANCE_RUN_NOW_LEAD_MS,
      "run_now",
      availabilityKey,
    );
    return this.mergeStatus(this.restarts.enrichStatus(policy));
  }

  cancelUpcoming(serverId: string): void {
    const active = this.active.get(serverId);
    if (active === undefined) return;
    active.cancelRequested = true;
    this.clearTimer(active);
    this.handledAvailability.delete(active.availabilityKey);
    this.active.delete(serverId);
  }

  private startCountdown(
    policy: MaintenancePolicy,
    targetAtMs: number,
    source: "schedule" | "run_now",
    availabilityKey: string,
  ): void {
    const state: ActiveUpdateCountdown = {
      serverId: policy.serverId,
      targetAtMs,
      availabilityKey,
      firedOffsets: new Set(),
      rconFailStreak: 0,
      cancelRequested: false,
      phase: targetAtMs - Date.now() <= 60_000 ? "last_minute" : "warning",
      timer: null,
      timerGeneration: 0,
      runPromise: null,
      source,
    };
    this.active.set(policy.serverId, state);
    void this.tickCountdown(policy.serverId, targetAtMs);
  }

  private clearTimer(state: ActiveUpdateCountdown): void {
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    state.timerGeneration += 1;
  }

  private isCurrentTick(
    serverId: string,
    expectedTargetAtMs: number,
  ): ActiveUpdateCountdown | null {
    const state = this.active.get(serverId);
    if (state === undefined) return null;
    if (state.cancelRequested) return null;
    if (state.targetAtMs !== expectedTargetAtMs) return null;
    return state;
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
      const current = this.isCurrentTick(serverId, expectedTargetAtMs);
      if (current === null || current.timerGeneration !== generation) return;
      void this.tickCountdown(serverId, expectedTargetAtMs);
    }, delayMs);
    state.timer.unref();
  }

  private isIntentionalStop(serverId: string): boolean {
    if (this.instances.isStopInProgress(serverId)) return true;
    const status = this.processes.getStatus(serverId).status;
    return status === "stopping" || status === "stopped";
  }

  private abortQuiet(state: ActiveUpdateCountdown): void {
    this.clearTimer(state);
    this.handledAvailability.delete(state.availabilityKey);
    this.active.delete(state.serverId);
  }

  private abortHard(state: ActiveUpdateCountdown, message: string): void {
    this.clearTimer(state);
    this.active.delete(state.serverId);
    this.recordFail(state.serverId, message);
  }

  private noteRconOutcome(
    state: ActiveUpdateCountdown,
    ok: boolean,
    errorMessage: string,
  ): "continue" | "abort" {
    if (ok) {
      state.rconFailStreak = 0;
      return "continue";
    }
    state.rconFailStreak += 1;
    if (state.rconFailStreak >= MAINTENANCE_RCON_SOFT_FAIL_LIMIT) {
      this.handledAvailability.delete(state.availabilityKey);
      this.abortHard(
        state,
        `RCON Broadcast failed ${state.rconFailStreak} times: ${errorMessage}`,
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

    if (this.isIntentionalStop(serverId)) {
      this.abortQuiet(state);
      return;
    }
    if (!this.processes.isActive(serverId)) {
      this.handledAvailability.delete(state.availabilityKey);
      this.abortHard(state, "Server stopped during update countdown");
      return;
    }

    const policy = this.repo.getPolicy(serverId);
    const now = Date.now();
    const remainingMs = state.targetAtMs - now;

    if (remainingMs <= 0) {
      state.phase = "updating";
      await this.executeUpdate(policy, state);
      return;
    }

    if (remainingMs <= 60_000) {
      state.phase = "last_minute";
      let broadcastOk = true;
      let broadcastError = "";
      try {
        await this.instances.execRcon(
          serverId,
          `Broadcast ${renderLastMinuteUpdate(remainingMs / 1_000)}`,
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

    state.phase = "warning";
    const offsets = resolveWarningOffsetLabels(
      policy.updateWarnings,
      MAINTENANCE_UPDATE_PRESET_OFFSETS,
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
          `Broadcast ${renderWarningTemplate(policy.updateWarnings.template, remainingMs)}`,
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

  private async executeUpdate(
    policy: MaintenancePolicy,
    state: ActiveUpdateCountdown,
  ): Promise<void> {
    if (state.runPromise !== null) return;
    const serverId = policy.serverId;
    const expectedTargetAtMs = state.targetAtMs;
    state.runPromise = (async () => {
      try {
        if (this.isCurrentTick(serverId, expectedTargetAtMs) === null) return;
        if (this.isIntentionalStop(serverId)) {
          this.abortQuiet(state);
          return;
        }
        await this.updates.enqueueUpdateForMaintenance(serverId);
        this.lastUpdate.set(serverId, {
          atIso: new Date().toISOString(),
          ok: true,
        });
        this.failStreak.delete(serverId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.lastUpdate.set(serverId, {
          atIso: new Date().toISOString(),
          ok: false,
        });
        this.handledAvailability.delete(state.availabilityKey);
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

  private recordFail(serverId: string, message: string): void {
    const streak = (this.failStreak.get(serverId) ?? 0) + 1;
    this.failStreak.set(serverId, streak);
    this.servers.addEvent(serverId, "error", "error", "Maintenance auto-update failed", {
      what: "A maintenance auto-update did not complete.",
      cause: message,
      suggestion:
        streak >= MAINTENANCE_RESTART_FAIL_LIMIT
          ? "Automatic maintenance is paused for this YARK session — resume when ready."
          : "Check Downloads / SteamCMD, then retry or wait for the next detection.",
    });
    if (streak >= MAINTENANCE_RESTART_FAIL_LIMIT) {
      this.pausedServerIds.add(serverId);
    }
  }
}
