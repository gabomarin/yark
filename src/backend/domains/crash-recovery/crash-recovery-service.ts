import type { CrashRecoveryPolicy, CrashRecoveryRuntime, ServerRuntimeInfo } from "@shared/types";
import type { CrashRecoveryRepository, CrashRecoveryPolicyWrite } from "../../infra/db/crash-recovery-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager, UnexpectedManagedExit } from "../../infra/process/process-manager";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { InstanceService } from "../instances/instance-service";
import { crashRecoveryBlockReason, planCrashRecovery } from "./crash-recovery-plan";

interface PendingRestart {
  attempt: number;
  maxAttempts: number;
  restartAtMs: number;
  reason: string | null;
}

type CrashRecoveryServers = Pick<ServerRepository, "get" | "list" | "addEvent">;
type CrashRecoveryProcesses = Pick<ProcessManager, "on" | "off" | "getStatus" | "isActive">;
type CrashRecoveryInstances = Pick<InstanceService, "start" | "isStopInProgress">;
type CrashRecoveryLocks = Pick<InstanceLockManager, "isLocked">;

/**
 * Bounded auto-restart after real unexpected exits (#563).
 *
 * Subscribes to `ProcessManager` `unexpected-exit` (operator-closed exits never
 * emit here — #524), consumes a persisted attempt budget, and restarts through
 * `InstanceService.start` so every existing lifecycle guard still applies.
 * Does nothing while YARK is quit; tray-hidden is fine.
 */
export class CrashRecoveryService {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Scheduled retries surfaced to the UI via {@link annotateStatus}. */
  private readonly pending = new Map<string, PendingRestart>();
  private maintenanceActive: (serverId: string) => boolean = () => false;
  private runtimeChange: (serverId: string) => void = () => {};
  private started = false;

  constructor(
    private readonly repo: CrashRecoveryRepository,
    private readonly servers: CrashRecoveryServers,
    private readonly processes: CrashRecoveryProcesses,
    private readonly instances: CrashRecoveryInstances,
    private readonly locks: CrashRecoveryLocks,
  ) {}

  /** Active Maintenance window/countdown gate (wired after MaintenanceService). */
  setMaintenanceActiveCheck(check: (serverId: string) => boolean): void {
    this.maintenanceActive = check;
  }

  /** Called when the pending-retry notice changes so main can re-push status. */
  setRuntimeChangeNotify(notify: (serverId: string) => void): void {
    this.runtimeChange = notify;
  }

  /** Adds the transient pending-retry notice to a status snapshot (#563). */
  annotateStatus(info: ServerRuntimeInfo): ServerRuntimeInfo {
    const pending = this.pending.get(info.serverId);
    if (pending === undefined) {
      return info.crashRecovery == null ? info : { ...info, crashRecovery: null };
    }
    const crashRecovery: CrashRecoveryRuntime = {
      attempt: pending.attempt,
      maxAttempts: pending.maxAttempts,
      restartAt: new Date(pending.restartAtMs).toISOString(),
      reason: pending.reason,
    };
    return { ...info, crashRecovery };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.processes.on("unexpected-exit", this.onUnexpectedExit);
    this.processes.on("status", this.onProcessStatus);
    this.repo.ensurePoliciesForServers(this.servers.list().map((s) => s.id));
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.processes.off("unexpected-exit", this.onUnexpectedExit);
    this.processes.off("status", this.onProcessStatus);
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.pending.clear();
  }

  getPolicy(serverId: string): CrashRecoveryPolicy {
    this.repo.ensurePolicy(serverId);
    const policy = this.repo.getPolicy(serverId);
    // A current run past the stability window already counts as fresh, so show
    // the reset now instead of waiting for the next crash to recompute it.
    if (policy.attempts > 0 && this.isStableRun(serverId, policy)) {
      this.repo.reset(serverId);
      return this.repo.getPolicy(serverId);
    }
    return policy;
  }

  /** True when the live process has been up at least the stability window. */
  private isStableRun(serverId: string, policy: CrashRecoveryPolicy): boolean {
    // Only a live process counts: after a crash the managed entry is retained
    // with its old startedAt, and its uptime keeps growing while it is dead.
    if (this.processes.getStatus(serverId).processLive !== true) return false;
    const uptimeMs = this.uptimeMsFor(serverId);
    return uptimeMs !== null && uptimeMs >= policy.stabilitySeconds * 1000;
  }

  setPolicy(serverId: string, input: CrashRecoveryPolicyWrite): CrashRecoveryPolicy {
    if (this.servers.get(serverId) === null) {
      throw new Error("Server does not exist");
    }
    this.repo.setPolicy(serverId, input);
    // Turning the policy off or pausing must also cancel a scheduled retry, or
    // the card/header would keep showing "Restarting in …" until the timer fires.
    if (input.paused || !input.enabled) this.clearPending(serverId);
    return this.getPolicy(serverId);
  }

  /** Clears the attempt budget; leaves an operator pause untouched. */
  resetAttempts(serverId: string): CrashRecoveryPolicy {
    if (this.servers.get(serverId) === null) {
      throw new Error("Server does not exist");
    }
    this.repo.reset(serverId);
    return this.getPolicy(serverId);
  }

  private readonly onUnexpectedExit = (payload: UnexpectedManagedExit): void => {
    this.handleCrash(payload);
  };

  /**
   * The server came back up outside crash recovery (manual Start/Restart,
   * maintenance, …): drop the pending retry so the countdown notice disappears
   * and the timer cannot fire a second start.
   */
  private readonly onProcessStatus = (info: ServerRuntimeInfo): void => {
    if (info.status !== "starting" && info.status !== "running") return;
    if (this.pending.has(info.serverId)) this.clearPending(info.serverId);
  };

  private handleCrash(payload: UnexpectedManagedExit): void {
    const policy = this.repo.getPolicy(payload.serverId);
    const plan = planCrashRecovery({
      policy,
      serverEnabled: this.servers.get(payload.serverId)?.enabled === true,
      uptimeMs: this.uptimeMsFor(payload.serverId),
      stopInProgress: this.instances.isStopInProgress(payload.serverId),
      locked: this.locks.isLocked(payload.serverId),
      maintenanceActive: this.maintenanceActive(payload.serverId),
    });
    if (plan.kind === "skip") {
      this.clearPending(payload.serverId);
      return;
    }

    const name = this.servers.get(payload.serverId)?.name ?? payload.serverId;
    this.repo.recordAttempt(payload.serverId, plan.attempts, payload.lastError);

    if (plan.kind === "exhausted") {
      this.servers.addEvent(
        payload.serverId,
        "auto_restart_exhausted",
        "warning",
        `YARK stopped restarting "${name}" after ${plan.maxAttempts} failed tries`,
        {
          what: "Crash recovery used every restart try without the server staying up.",
          cause: payload.lastError,
          suggestion:
            "Fix the cause of the crash, then Reset tries (or start the server by hand) to arm crash recovery again.",
          context: {
            attempts: plan.attempts,
            maxAttempts: plan.maxAttempts,
            phase: payload.phase,
          },
        },
      );
      return;
    }

    this.servers.addEvent(
      payload.serverId,
      "auto_restart_scheduled",
      "info",
      `"${name}" crashed — YARK will start it again in ${Math.round(plan.delayMs / 1000)}s (attempt ${plan.attempts} of ${plan.maxAttempts})`,
      {
        what: "The server crashed on its own and crash recovery scheduled a restart.",
        context: {
          attempt: plan.attempts,
          maxAttempts: plan.maxAttempts,
          delaySeconds: Math.round(plan.delayMs / 1000),
          stabilizedBudget: plan.stabilized,
        },
      },
    );
    this.scheduleTimer(payload.serverId, plan.delayMs, plan.attempts, plan.maxAttempts, payload.lastError);
  }

  private scheduleTimer(
    serverId: string,
    delayMs: number,
    attempt: number,
    maxAttempts: number,
    reason: string | null,
  ): void {
    this.clearTimer(serverId);
    this.pending.set(serverId, {
      attempt,
      maxAttempts,
      restartAtMs: Date.now() + delayMs,
      reason,
    });
    this.runtimeChange(serverId);
    const timer = setTimeout(() => {
      this.timers.delete(serverId);
      this.clearPending(serverId);
      void this.attemptRestart(serverId, attempt, maxAttempts);
    }, delayMs);
    timer.unref?.();
    this.timers.set(serverId, timer);
  }

  private clearTimer(serverId: string): void {
    const timer = this.timers.get(serverId);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.timers.delete(serverId);
  }

  /** Drops a scheduled retry (timer + UI notice) and notifies when it existed. */
  private clearPending(serverId: string): void {
    const hadTimer = this.timers.has(serverId);
    this.clearTimer(serverId);
    const hadNotice = this.pending.delete(serverId);
    if (hadTimer || hadNotice) this.runtimeChange(serverId);
  }

  private async attemptRestart(serverId: string, attempt: number, maxAttempts: number): Promise<void> {
    if (!this.started) return;

    const policy = this.repo.getPolicy(serverId);
    const server = this.servers.get(serverId);
    const blocked = crashRecoveryBlockReason({
      policy,
      serverEnabled: server?.enabled === true,
      stopInProgress: this.instances.isStopInProgress(serverId),
      locked: this.locks.isLocked(serverId),
      maintenanceActive: this.maintenanceActive(serverId),
    });
    // Operator started it again, disabled/paused, or maintenance took over.
    if (blocked !== null || server === null) return;
    if (this.processes.isActive(serverId)) return;

    try {
      await this.instances.start(serverId);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.servers.addEvent(
        serverId,
        "auto_restart_failed",
        "error",
        `YARK could not start "${server.name}" again (attempt ${attempt} of ${maxAttempts}): ${detail}`,
        {
          what: "Crash recovery could not start the server again after a crash.",
          cause: detail,
          suggestion:
            "Open Logs → Runtime and check the install, then start the server by hand. YARK will not try again until the next crash.",
          context: { attempt, maxAttempts },
        },
      );
    }
  }

  private uptimeMsFor(serverId: string): number | null {
    const startedAt = this.processes.getStatus(serverId).startedAt;
    if (startedAt === null || startedAt === undefined) return null;
    const startedMs = Date.parse(startedAt);
    if (Number.isNaN(startedMs)) return null;
    return Math.max(0, Date.now() - startedMs);
  }
}
