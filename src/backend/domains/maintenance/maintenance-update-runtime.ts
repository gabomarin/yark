/**
 * Opt-in auto-update when Steam buildid differs (#489).
 * Broadcast countdown (update presets + last-minute 1 Hz), then stop at T0 and
 * UpdateService.enqueueUpdateForMaintenance (wasRunning → queue → SteamCMD → start).
 */

import {
  MAINTENANCE_UPDATE_PRESET_OFFSETS,
} from "@shared/maintenance-policy";
import {
  MAINTENANCE_FAIL_LIMIT,
  MAINTENANCE_RCON_SOFT_FAIL_LIMIT,
  MAINTENANCE_RUN_NOW_LEAD_MS,
  maxWarningLeadMs,
  parseMaintenanceOffsetToMs,
  renderLastMinuteUpdate,
  renderWarningTemplate,
  resolveWarningOffsetLabels,
  shouldUseLastMinuteChat,
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

function isUpdateCountdownBroadcastPhase(
  phase: MaintenanceCountdownPhase,
): boolean {
  return phase === "warning" || phase === "last_minute";
}

/** After a failed arm/run, wait before re-trying the same Steam build. */
const MAINTENANCE_UPDATE_RETRY_COOLDOWN_MS = 5 * 60 * 1_000;

/** Reuse installationInfo across UI polls within this window (#315 review F). */
const STEAM_AVAILABILITY_CACHE_MS = 30_000;

interface LastUpdateMemory {
  atIso: string;
  ok: boolean;
}

interface SteamAvailabilityCache {
  atMs: number;
  officialSteamBuild: string | null;
  byServerId: Map<string, boolean>;
}

export class MaintenanceUpdateRuntime {
  /**
   * Session-only pause / fail streak / last outcome / handled Steam builds.
   * Cleared when YARK quits — see docs/maintenance.md § Session runtime state.
   */
  private readonly pausedServerIds = new Set<string>();
  private readonly failStreak = new Map<string, number>();
  private readonly active = new Map<string, ActiveUpdateCountdown>();
  private readonly lastUpdate = new Map<string, LastUpdateMemory>();
  /** Availability keys already armed/enqueued this session. */
  private readonly handledAvailability = new Set<string>();
  /** Earliest retry time per availability key after a failed update. */
  private readonly availabilityRetryAfterMs = new Map<string, number>();
  private steamAvailabilityCache: SteamAvailabilityCache | null = null;

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
  mergeStatus(
    status: MaintenancePolicyStatus,
    steamUpdateAvailable: boolean,
  ): MaintenancePolicyStatus {
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
        steamUpdateAvailable,
      };
    }
    return {
      ...status,
      schedulePaused: status.schedulePaused || updatePaused,
      countdownRemainingMs:
        isUpdateCountdownBroadcastPhase(active.phase)
          ? Math.max(0, active.targetAtMs - now)
          : 0,
      countdownPhase: active.phase,
      countdownKind: "update",
      lastUpdateAt: last?.atIso ?? null,
      lastUpdateOk: last?.ok ?? null,
      steamUpdateAvailable,
      cancelable:
        isUpdateCountdownBroadcastPhase(active.phase)
        && !active.cancelRequested,
    };
  }

  /** Same Steam-newer check as auto-update arming / Run update now. */
  async isSteamUpdateAvailable(serverId: string): Promise<boolean> {
    const cached = this.steamAvailabilityCache;
    const now = Date.now();
    if (
      cached !== null
      && now - cached.atMs < STEAM_AVAILABILITY_CACHE_MS
    ) {
      const hit = cached.byServerId.get(serverId);
      if (hit !== undefined) return hit;
    }

    const snapshot = await this.instances.installationInfo(false);
    const byServerId = new Map<string, boolean>();
    for (const row of snapshot.servers) {
      byServerId.set(
        row.serverId,
        isServerUpdateAvailable(row, snapshot.officialSteamBuild),
      );
    }
    this.steamAvailabilityCache = {
      atMs: now,
      officialSteamBuild: snapshot.officialSteamBuild,
      byServerId,
    };
    return byServerId.get(serverId) ?? false;
  }

  private invalidateSteamAvailabilityCache(): void {
    this.steamAvailabilityCache = null;
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
          this.invalidateSteamAvailabilityCache();
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
        if (!this.canArmAvailability(availabilityKey)) continue;

        if (!this.processes.isActive(policy.serverId)) {
          // Stopped + outdated: enqueue and wait off the cycle loop so other
          // policies can arm countdowns without blocking on SteamCMD.
          this.markAvailabilityHandled(availabilityKey);
          void this.runStoppedServerUpdate(policy.serverId, availabilityKey);
          continue;
        }

        if (this.isIntentionalStop(policy.serverId)) continue;

        const offsets = resolveWarningOffsetLabels(
          policy.updateWarnings,
          MAINTENANCE_UPDATE_PRESET_OFFSETS,
        );
        const lead = maxWarningLeadMs(offsets);
        const targetAtMs = Date.now() + lead;
        this.markAvailabilityHandled(availabilityKey);
        this.startCountdown(policy, targetAtMs, "schedule", availabilityKey);
      } catch (error) {
        console.error(
          `Maintenance update tick failed for ${policy.serverId}`,
          error,
        );
      }
    }
  }

  /** Wait for safe update completion without blocking `runScheduledCycle`. */
  private async runStoppedServerUpdate(
    serverId: string,
    availabilityKey: string,
  ): Promise<void> {
    try {
      await this.updates.updateServer(serverId);
      this.lastUpdate.set(serverId, {
        atIso: new Date().toISOString(),
        ok: true,
      });
      this.failStreak.delete(serverId);
      this.invalidateSteamAvailabilityCache();
    } catch (error) {
      this.scheduleAvailabilityRetry(availabilityKey);
      this.recordFail(
        serverId,
        error instanceof Error ? error.message : String(error),
        error,
      );
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
        return this.mergeStatus(this.restarts.enrichStatus(policy), true);
      }
      throw new Error(
        "A restart countdown is already active — Cancel it first, or wait",
      );
    }
    if (this.updates.hasOccupyingFilesJob(serverId)) {
      throw new Error("A files job is already queued for this server");
    }
    if (this.instances.isStopInProgress(serverId)) {
      throw new Error("Server stop is in progress — try again when idle");
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
    this.markAvailabilityHandled(availabilityKey);
    this.startCountdown(
      policy,
      Date.now() + MAINTENANCE_RUN_NOW_LEAD_MS,
      "run_now",
      availabilityKey,
    );
    return this.mergeStatus(this.restarts.enrichStatus(policy), true);
  }

  cancelUpcoming(serverId: string): void {
    const active = this.active.get(serverId);
    if (active === undefined) return;
    active.cancelRequested = true;
    this.clearTimer(active);
    this.releaseAvailability(active.availabilityKey);
    this.active.delete(serverId);
  }

  private startCountdown(
    policy: MaintenancePolicy,
    targetAtMs: number,
    source: "schedule" | "run_now",
    availabilityKey: string,
  ): void {
    const remaining = targetAtMs - Date.now();
    const state: ActiveUpdateCountdown = {
      serverId: policy.serverId,
      targetAtMs,
      availabilityKey,
      firedOffsets: new Set(),
      rconFailStreak: 0,
      cancelRequested: false,
      phase: shouldUseLastMinuteChat(
        remaining,
        policy.updateWarnings,
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
    // Same as restart runtime: unref is safe while Electron main stays alive.
    state.timer.unref();
  }

  private isIntentionalStop(serverId: string): boolean {
    if (this.instances.isStopInProgress(serverId)) return true;
    const status = this.processes.getStatus(serverId).status;
    return status === "stopping" || status === "stopped";
  }

  private abortQuiet(state: ActiveUpdateCountdown): void {
    this.clearTimer(state);
    this.releaseAvailability(state.availabilityKey);
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
      this.releaseAvailability(state.availabilityKey);
      this.abortHard(
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

    if (this.isIntentionalStop(serverId)) {
      this.abortQuiet(state);
      return;
    }
    if (!this.processes.isActive(serverId)) {
      this.releaseAvailability(state.availabilityKey);
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

    if (
      shouldUseLastMinuteChat(
        remainingMs,
        policy.updateWarnings,
        state.source,
      )
    ) {
      state.phase = "last_minute";
      let broadcastOk = true;
      let broadcastError = "";
      try {
        await this.instances.execRcon(
          serverId,
          `ServerChat ${renderLastMinuteUpdate(remainingMs / 1_000)}`,
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
          `ServerChat ${renderWarningTemplate(policy.updateWarnings.template, remainingMs)}`,
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
        // Stop at T0 (like official fleet downtime) so players are offline when
        // the countdown hits 0 — even if SteamCMD is still busy with another server.
        // Restart after the queued update via wasRunning: true.
        const wasRunning = this.processes.isActive(serverId);
        if (wasRunning) {
          await this.instances.stop(serverId, { backup: false });
        }
        if (this.isCurrentTick(serverId, expectedTargetAtMs) === null) return;
        await this.updates.enqueueUpdateForMaintenance(serverId, {
          wasRunning,
        });
        this.lastUpdate.set(serverId, {
          atIso: new Date().toISOString(),
          ok: true,
        });
        this.failStreak.delete(serverId);
        this.invalidateSteamAvailabilityCache();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.lastUpdate.set(serverId, {
          atIso: new Date().toISOString(),
          ok: false,
        });
        this.scheduleAvailabilityRetry(state.availabilityKey);
        this.recordFail(serverId, message, error);
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

  private canArmAvailability(availabilityKey: string): boolean {
    if (!this.handledAvailability.has(availabilityKey)) return true;
    const retryAfter = this.availabilityRetryAfterMs.get(availabilityKey);
    if (retryAfter === undefined) return false;
    if (Date.now() < retryAfter) return false;
    this.releaseAvailability(availabilityKey);
    return true;
  }

  private markAvailabilityHandled(availabilityKey: string): void {
    this.handledAvailability.add(availabilityKey);
    this.availabilityRetryAfterMs.delete(availabilityKey);
  }

  private scheduleAvailabilityRetry(availabilityKey: string): void {
    this.handledAvailability.add(availabilityKey);
    this.availabilityRetryAfterMs.set(
      availabilityKey,
      Date.now() + MAINTENANCE_UPDATE_RETRY_COOLDOWN_MS,
    );
  }

  private releaseAvailability(availabilityKey: string): void {
    this.handledAvailability.delete(availabilityKey);
    this.availabilityRetryAfterMs.delete(availabilityKey);
  }

  private recordFail(serverId: string, message: string, error?: unknown): void {
    if (error !== undefined) {
      console.error(`Maintenance auto-update failed for ${serverId}`, error);
    }
    const streak = (this.failStreak.get(serverId) ?? 0) + 1;
    this.failStreak.set(serverId, streak);
    this.servers.addEvent(serverId, "error", "error", "Maintenance auto-update failed", {
      what: "A maintenance auto-update did not complete.",
      cause: message,
      suggestion:
        streak >= MAINTENANCE_FAIL_LIMIT
          ? "Automatic maintenance is paused for this YARK session — resume when ready."
          : "Check Downloads / SteamCMD, then retry or wait for the next detection.",
    });
    if (streak >= MAINTENANCE_FAIL_LIMIT) {
      this.pausedServerIds.add(serverId);
    }
  }
}
