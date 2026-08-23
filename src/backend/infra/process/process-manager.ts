import { type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type {
  ServerProfile,
  ServerRuntimeInfo,
  SessionPortSet,
  StartServerOptions,
} from "@shared/types";
import {
  LEFT_RUNNING_SCHEMA_VERSION,
  type LeftRunningProcessIdentity,
  type LiveProcessIdentity,
} from "@shared/left-running";
import { rconExec } from "../rcon/rcon-client";
import { diagnoseAsaStartupFailure, type AsaStartupFailure } from "@shared/asa-startup-failure";
import { readAsaLogSessionExcerpt } from "./asa-log-tail";
import { createAdoptedChildHandle } from "./adopted-child";
import { killWinProcessTreeAsync } from "./kill-win-process-tree";
import { queryWindowsProcessIdentity } from "./windows-process-identity";
import { spawnAsaProcess } from "./process-spawn";
import {
  DEFAULT_READY_PROBE_MIN_WAIT_MS,
  DEFAULT_READY_SETTLE_MS,
  RUNTIME_LOG_SOURCES,
  appendRuntimeLogRing,
  formatRuntimeLogLine,
  runtimeLogPartialKey,
  splitRuntimeLogChunk,
  type RuntimeLogSource,
} from "./process-readiness";
import {
  waitUntilReady as waitUntilManagedReady,
  type ReadyWaitHost,
} from "./process-ready-wait";
import {
  startManagedProcess,
  type ProcessStartHost,
  type ProcessStartManaged,
} from "./process-start";
import {
  collectLeaveIdentities as collectLeaveIdentitiesForHost,
  detachAfterLeavePersist as detachAfterLeavePersistForHost,
  detachForLeave as detachForLeaveForHost,
  reattachManagedProcess,
  type ProcessLeaveHost,
} from "./process-leave";
import {
  beginGracefulStop as beginGracefulStopForHost,
  finishGracefulStop as finishGracefulStopForHost,
  type BeginGracefulStopResult,
  type FinishGracefulStopResult,
  type GracefulStopHandle,
  type ProcessGracefulStopHost,
} from "./process-graceful-stop";
import {
  formatProcessExitLogLine,
  isUnexpectedManagedExit,
  planManagedExitLastError,
} from "./process-stop";

export type {
  BeginGracefulStopResult,
  FinishGracefulStopResult,
  GracefulStopHandle,
};

/** Ports used for this live process (including session-only overrides). */
type ManagedProcess = ProcessStartManaged;

/** Observed child exit that was not an operator stop. */
export interface UnexpectedManagedExit {
  serverId: string;
  exitCode: number | null;
  phase: "starting" | "running";
  lastError: string;
  diagnosis: AsaStartupFailure | null;
}

/** Optional persistent-session RCON path (falls back to one-shot `rconExec`). */
export type ManagedRconExecutor = (
  serverId: string,
  command: string,
) => Promise<string>;

export interface ProcessManagerOptions {
  /** Timeout waiting for readiness (RCON / log). Default 10 minutes. */
  readyTimeoutMs?: number;
  /** Interval between RCON attempts. Default 3s. */
  readyPollMs?: number;
  /**
   * Do not open RCON probes until this long after spawn, unless a startup
   * log signal was already seen. Default 45s.
   */
  readyProbeMinWaitMs?: number;
  /**
   * After the first successful ListPlayers, wait this long and confirm once
   * more before promoting to `running`. Default 15s.
   */
  readySettleMs?: number;
  /** Process factory override for lifecycle tests. */
  spawnProcess?: typeof spawnAsaProcess;
  /** Adopted-PID handle factory (Leave reattach tests). */
  createAdoptedChild?: (pid: number) => ChildProcess;
  /** OS identity probe (crash-recovery checkpoints / Leave snapshot). */
  queryOsIdentity?: (pid: number) => Promise<LiveProcessIdentity | null>;
  /** Persist durable identity while a managed process is active. */
  onProcessCheckpoint?: (record: LeftRunningProcessIdentity) => void;
  /** Clear durable identity after a managed process exits/stops. */
  onProcessCheckpointCleared?: (serverId: string) => void;
}

const RCON_HOST = "127.0.0.1";
const DEFAULT_READY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_READY_POLL_MS = 3000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Manages ASA server process lifecycle on Windows.
 * Emits "status" with ServerRuntimeInfo on each transition.
 *
 * `running` is only set when the server responds via RCON (or there is
 * a clear full-startup log signal), not when the OS process is created.
 */
export class ProcessManager extends EventEmitter {
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly runtimeLogs = new Map<string, string[]>();
  /** Incomplete trailing line per server+source while chunks arrive mid-line. */
  private readonly runtimePartials = new Map<string, string>();
  private readonly readyTimeoutMs: number;
  private readonly readyPollMs: number;
  private readonly readyProbeMinWaitMs: number;
  private readonly readySettleMs: number;
  private readonly spawnProcess: typeof spawnAsaProcess;
  private readonly createAdoptedChild: (pid: number) => ChildProcess;
  private readonly queryOsIdentity: (
    pid: number,
  ) => Promise<LiveProcessIdentity | null>;
  private readonly onProcessCheckpoint:
    | ((record: LeftRunningProcessIdentity) => void)
    | null;
  private readonly onProcessCheckpointCleared: ((serverId: string) => void) | null;
  /** Prefer persistent session when wired from InstanceService. */
  private rconExecutor: ManagedRconExecutor | null = null;

  constructor(options?: ProcessManagerOptions) {
    super();
    this.readyTimeoutMs = options?.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    this.readyPollMs = options?.readyPollMs ?? DEFAULT_READY_POLL_MS;
    this.readyProbeMinWaitMs =
      options?.readyProbeMinWaitMs ?? DEFAULT_READY_PROBE_MIN_WAIT_MS;
    this.readySettleMs = options?.readySettleMs ?? DEFAULT_READY_SETTLE_MS;
    this.spawnProcess = options?.spawnProcess ?? spawnAsaProcess;
    this.createAdoptedChild = options?.createAdoptedChild ?? createAdoptedChildHandle;
    this.queryOsIdentity =
      options?.queryOsIdentity ?? ((pid) => queryWindowsProcessIdentity(pid));
    this.onProcessCheckpoint = options?.onProcessCheckpoint ?? null;
    this.onProcessCheckpointCleared = options?.onProcessCheckpointCleared ?? null;
  }

  /**
   * Prefer a persistent RCON session (InstanceService) for stop/SaveWorld/DoExit.
   * Readiness probes stay on one-shot `rconExec` until status is `running`.
   */
  setRconExecutor(executor: ManagedRconExecutor | null): void {
    this.rconExecutor = executor;
  }

  private async executeRcon(
    profile: ServerProfile,
    command: string,
  ): Promise<string> {
    if (this.rconExecutor !== null) {
      return this.rconExecutor(profile.id, command);
    }
    return rconExec(
      RCON_HOST,
      profile.rconPort,
      profile.adminPassword,
      command,
    );
  }

  /**
   * True when a managed child is still in the OS process table (exit not observed).
   */
  hasLiveProcess(serverId: string): boolean {
    const managed = this.processes.get(serverId);
    if (managed === undefined) return false;
    const { child } = managed;
    // Treat missing props (test fakes / adopted handles) like Node's null = not exited.
    return child.exitCode == null && child.signalCode == null;
  }

  getStatus(serverId: string): ServerRuntimeInfo {
    const managed = this.processes.get(serverId);
    if (managed === undefined) {
      return {
        serverId,
        status: "stopped",
        processLive: false,
        pid: null,
        startedAt: null,
        lastError: null,
      };
    }
    return {
      serverId,
      status: managed.status,
      processLive: this.hasLiveProcess(serverId),
      pid: managed.child.pid ?? null,
      startedAt: managed.startedAt,
      lastError: managed.lastError,
    };
  }

  listStatuses(serverIds: string[]): ServerRuntimeInfo[] {
    return serverIds.map((id) => this.getStatus(id));
  }

  /**
   * Ports the live process was started with (session overrides included).
   * Null when the server is not managed.
   */
  getRuntimePorts(serverId: string): SessionPortSet | null {
    const managed = this.processes.get(serverId);
    if (managed === undefined) return null;
    return { ...managed.runtimePorts };
  }

  /**
   * Overlay live runtime ports onto a saved profile for RCON / conflict checks
   * while the process is active.
   */
  applyRuntimePorts(profile: ServerProfile): ServerProfile {
    const ports = this.getRuntimePorts(profile.id);
    if (ports == null) return profile;
    return {
      ...profile,
      gamePort: ports.gamePort,
      queryPort: ports.queryPort,
      rconPort: ports.rconPort,
    };
  }

  isActive(serverId: string): boolean {
    if (!this.hasLiveProcess(serverId)) return false;
    const status = this.processes.get(serverId)?.status;
    return (
      status === "starting"
      || status === "running"
      || status === "stopping"
      || status === "error"
    );
  }

  getRuntimeLogSnapshot(serverId: string, limit = 300): string[] {
    const lines = this.runtimeLogs.get(serverId) ?? [];
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 300;
    return lines.slice(-safeLimit);
  }

  clearRuntimeLog(serverId: string): void {
    this.runtimeLogs.delete(serverId);
    this.clearRuntimePartials(serverId);
  }

  start(profile: ServerProfile, options?: StartServerOptions): void {
    startManagedProcess(this.startHost(), profile, options);
  }

  /**
   * Result of {@link beginGracefulStop}: `saved` means RCON SaveWorld
   * succeeded and the process is still managed; `killed` means RCON failed
   * and the process was terminated; `absent` means nothing was running.
   */
  async beginGracefulStop(
    profile: ServerProfile,
  ): Promise<BeginGracefulStopResult> {
    return beginGracefulStopForHost(this.gracefulStopHost(), profile);
  }

  /**
   * After a successful {@link beginGracefulStop} (`saved`), send DoExit and
   * wait / force-kill. No-op if the process is already gone.
   */
  async finishGracefulStop(
    profile: ServerProfile,
    handle: GracefulStopHandle,
  ): Promise<FinishGracefulStopResult> {
    return finishGracefulStopForHost(this.gracefulStopHost(), profile, handle);
  }

  /**
   * Safe stop: saveworld via RCON, wait, DoExit, then kill fallback.
   * Prefer {@link InstanceService.stop} for user-initiated stops (pre-stop backup).
   */
  async stop(profile: ServerProfile): Promise<void> {
    const result = await this.beginGracefulStop(profile);
    if (result.phase === "saved") {
      await this.finishGracefulStop(profile, result.handle);
    }
  }

  /** Immediate termination without save (last resort). */
  async kill(serverId: string): Promise<void> {
    const managed = this.processes.get(serverId);
    if (managed === undefined) return;
    managed.readinessGeneration += 1;
    managed.status = "stopping";
    this.appendRuntimeLog(serverId, "warning", "Forcing process shutdown");
    this.emitStatus(serverId);
    await this.terminateManaged(serverId, managed);
    if (this.processes.get(serverId) === managed) {
      this.processes.delete(serverId);
      this.clearProcessCheckpoint(serverId);
      this.emitStatus(serverId);
    }
  }

  /** Stops all active processes (app shutdown). Prefer InstanceService.stopAllForAppQuit. */
  async stopAll(profiles: ServerProfile[]): Promise<void> {
    const stops: Array<Promise<void>> = [];
    for (const profile of profiles) {
      if (this.isActive(profile.id)) {
        stops.push(this.stop(profile));
      }
    }
    await Promise.allSettled(stops);
  }

  /**
   * Resolves when the server is no longer `"starting"` (ready, gone, error, or
   * readiness timeout). Stop/quit must not hang forever on a stuck reattach.
   */
  async waitWhileStarting(serverId: string): Promise<void> {
    const deadline = Date.now() + this.readyTimeoutMs;
    while (this.getStatus(serverId).status === "starting") {
      if (Date.now() >= deadline) {
        const managed = this.processes.get(serverId);
        if (managed !== undefined && managed.status === "starting") {
          // Cancel readiness wait (incl. infinite reattach poll) so quit/stop
          // can attempt SaveWorld → DoExit instead of hanging forever.
          managed.readinessGeneration += 1;
          managed.status = "running";
          managed.lastError = null;
          this.appendRuntimeLog(
            serverId,
            "warning",
            "Timed out waiting for starting server before stop; treating as running for graceful stop",
          );
          this.emitStatus(serverId);
        }
        return;
      }
      await delay(this.readyPollMs);
    }
  }

  /**
   * Snapshot process identities for durable recovery metadata (tests / legacy
   * Leave path). Requires OS creation time so the next launch can reject PID
   * reuse. Does not mutate process state.
   */
  async collectLeaveIdentities(
    profiles: ServerProfile[],
    options?: {
      queryOsIdentity?: (pid: number) => Promise<LiveProcessIdentity | null>;
      leftAt?: string;
    },
  ): Promise<LeftRunningProcessIdentity[]> {
    return collectLeaveIdentitiesForHost(this.leaveHost(), profiles, options);
  }

  /**
   * Detach previously snapshotted Leave processes (after durable metadata write).
   * Stops log capture, disconnects stdio, unrefs, and drops tracking.
   */
  detachAfterLeavePersist(records: LeftRunningProcessIdentity[]): void {
    detachAfterLeavePersistForHost(this.leaveHost(), records);
  }

  /**
   * @deprecated Prefer {@link collectLeaveIdentities} + {@link detachAfterLeavePersist}.
   * Kept for tests that expect a single call; still detaches only after a full snapshot.
   */
  async detachForLeave(
    profiles: ServerProfile[],
    options?: {
      queryOsIdentity?: (pid: number) => Promise<LiveProcessIdentity | null>;
      leftAt?: string;
    },
  ): Promise<LeftRunningProcessIdentity[]> {
    return detachForLeaveForHost(this.leaveHost(), profiles, options);
  }

  /**
   * Reattach to a validated crash-recovery process (same profile + OS identity).
   * Uses a synthetic child handle (PID poll) and Saved/Logs tail — no pipes.
   */
  async reattach(
    profile: ServerProfile,
    record: LeftRunningProcessIdentity,
    options?: {
      skipReadinessCheck?: boolean;
      queryOsIdentity?: (pid: number) => Promise<LiveProcessIdentity | null>;
    },
  ): Promise<void> {
    return reattachManagedProcess(this.leaveHost(), profile, record, options);
  }

  private gracefulStopHost(): ProcessGracefulStopHost {
    return {
      getManaged: (serverId) => this.processes.get(serverId),
      appendRuntimeLog: (serverId, source, message) =>
        this.appendRuntimeLog(serverId, source, message),
      emitStatus: (serverId) => this.emitStatus(serverId),
      executeRcon: (profile, command) => this.executeRcon(profile, command),
      waitForExit: (child, timeoutMs) => this.waitForExit(child, timeoutMs),
      stopManagedCapture: (serverId, managed) =>
        this.stopManagedCapture(serverId, managed),
      deleteManaged: (serverId) => {
        this.processes.delete(serverId);
      },
      clearProcessCheckpoint: (serverId) => this.clearProcessCheckpoint(serverId),
      terminateManaged: (serverId, managed) =>
        this.terminateManaged(serverId, managed),
    };
  }

  private leaveHost(): ProcessLeaveHost {
    return {
      isActive: (serverId) => this.isActive(serverId),
      getManaged: (serverId) => this.processes.get(serverId),
      queryOsIdentity: (pid) => this.queryOsIdentity(pid),
      appendRuntimeLog: (serverId, source, message) =>
        this.appendRuntimeLog(serverId, source, message),
      stopManagedCapture: (serverId, managed) =>
        this.stopManagedCapture(serverId, managed),
      deleteManaged: (serverId) => {
        this.processes.delete(serverId);
      },
      emitStatus: (serverId) => this.emitStatus(serverId),
      createAdoptedChild: (pid) => this.createAdoptedChild(pid),
      setManaged: (serverId, managed) => {
        this.processes.set(serverId, managed);
      },
      writeProcessCheckpoint: (serverId, managed, live) =>
        this.writeProcessCheckpoint(serverId, managed, live),
      captureRuntimeChunk: (serverId, source, text) =>
        this.captureRuntimeChunk(serverId, source, text),
      onManagedExit: (serverId, managed, code) =>
        this.onManagedExit(serverId, managed, code),
      waitUntilReady: (profile, managed, generation, options) =>
        this.waitUntilReady(profile, managed, generation, options),
    };
  }

  private startHost(): ProcessStartHost {
    return {
      isActive: (serverId) => this.isActive(serverId),
      clearRuntimeLog: (serverId) => this.clearRuntimeLog(serverId),
      spawnProcess: this.spawnProcess,
      appendRuntimeLog: (serverId, source, message) =>
        this.appendRuntimeLog(serverId, source, message),
      registerManaged: (serverId, managed) => {
        this.processes.set(serverId, managed);
      },
      getManaged: (serverId) => this.processes.get(serverId),
      captureRuntimeChunk: (serverId, source, chunk) =>
        this.captureRuntimeChunk(serverId, source, chunk),
      emitStatus: (serverId) => this.emitStatus(serverId),
      writeProcessCheckpoint: (serverId, managed) =>
        this.writeProcessCheckpoint(serverId, managed),
      waitUntilReady: (profile, managed, generation) =>
        this.waitUntilReady(profile, managed, generation),
      flushRuntimePartials: (serverId) => this.flushRuntimePartials(serverId),
      clearProcessCheckpoint: (serverId) => this.clearProcessCheckpoint(serverId),
      onManagedExit: (serverId, managed, code) =>
        this.onManagedExit(serverId, managed, code),
    };
  }

  private readyWaitHost(managed: ManagedProcess): ReadyWaitHost {
    return {
      getManaged: (serverId) => this.processes.get(serverId),
      getRuntimeLogLines: (serverId) => this.runtimeLogs.get(serverId) ?? [],
      appendRuntimeLog: (serverId, source, message) =>
        this.appendRuntimeLog(serverId, source, message),
      emitStatus: (serverId) => this.emitStatus(serverId),
      clearProcessCheckpoint: (serverId) => this.clearProcessCheckpoint(serverId),
      terminateManaged: async (serverId) => {
        await this.terminateManaged(serverId, managed);
      },
    };
  }

  private async waitUntilReady(
    profile: ServerProfile,
    managed: ManagedProcess,
    generation: number,
    options?: { terminateOnTimeout?: boolean },
  ): Promise<void> {
    return waitUntilManagedReady(
      this.readyWaitHost(managed),
      profile,
      managed,
      generation,
      {
        timeoutMs: this.readyTimeoutMs,
        pollMs: this.readyPollMs,
        probeMinWaitMs: this.readyProbeMinWaitMs,
        settleMs: this.readySettleMs,
      },
      options,
    );
  }

  private async writeProcessCheckpoint(
    serverId: string,
    managed: ManagedProcess,
    liveIdentity?: LiveProcessIdentity | null,
  ): Promise<void> {
    if (this.onProcessCheckpoint === null) {
      return;
    }
    try {
      const pid = managed.child.pid;
      if (pid === undefined || !Number.isInteger(pid) || pid <= 0) {
        return;
      }
      // Reuse a just-fetched identity when provided (reattach) to avoid a second
      // PowerShell round-trip during startup (#145 review).
      const live =
        liveIdentity !== undefined
          ? liveIdentity
          : await this.queryOsIdentity(pid);
      const osCreationTime = live?.osCreationTime?.trim() || null;
      if (osCreationTime === null) {
        this.appendRuntimeLog(
          serverId,
          "warning",
          "Could not checkpoint process identity (no OS creation time); crash reattach may be unavailable",
        );
        return;
      }
      this.onProcessCheckpoint({
        schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
        serverId,
        pid,
        executablePath: managed.executablePath,
        installDir: managed.installDir,
        startedAt: managed.startedAt,
        expectedCommandLine: managed.expectedCommandLine,
        launchArgs: [...managed.launchArgs],
        runtimePorts: { ...managed.runtimePorts },
        osCreationTime,
        osExecutablePath: live?.executablePath ?? null,
        leftAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.appendRuntimeLog(
        serverId,
        "warning",
        `Process checkpoint write failed: ${detail}`,
      );
    }
  }

  private clearProcessCheckpoint(serverId: string): void {
    try {
      this.onProcessCheckpointCleared?.(serverId);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.appendRuntimeLog(
        serverId,
        "warning",
        `Process checkpoint clear failed: ${detail}`,
      );
    }
  }

  private async terminateManaged(
    serverId: string,
    managed: ManagedProcess,
  ): Promise<void> {
    this.stopManagedCapture(serverId, managed);
    const pid = managed.child.pid;
    if (
      process.platform === "win32"
      && pid !== undefined
      && (await killWinProcessTreeAsync(pid))
    ) {
      return;
    }
    try {
      managed.child.kill();
    } catch {
      // already exited
    }
  }

  private stopManagedCapture(serverId: string, managed: ManagedProcess): void {
    managed.logTailer?.stop();
    managed.logTailer = null;
    if (this.processes.get(serverId) === managed) {
      this.flushRuntimePartials(serverId);
    }
  }

  private waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.removeListener("exit", onExit);
        resolve(false);
      }, timeoutMs);
      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      child.once("exit", onExit);
    });
  }

  private onManagedExit(
    serverId: string,
    managed: ManagedProcess,
    code: number | null,
  ): void {
    const wasStopping = managed.status === "stopping";
    const wasStarting = managed.status === "starting";
    const wasRunning = managed.status === "running";
    managed.readinessGeneration += 1;
    managed.logTailer?.stop();
    managed.logTailer = null;
    if (this.processes.get(serverId) !== managed) return;
    this.flushRuntimePartials(serverId);
    this.appendRuntimeLog(
      serverId,
      "system",
      formatProcessExitLogLine(code),
    );
    this.clearProcessCheckpoint(serverId);
    const unexpected = isUnexpectedManagedExit({
      wasStopping,
      wasStarting,
      wasRunning,
      exitCode: code,
    });
    if (!unexpected) {
      if (managed.status !== "error") {
        this.processes.delete(serverId);
      }
      this.emitStatus(serverId);
      return;
    }

    const diagnosis = diagnoseAsaStartupFailure(
      [
        this.getRuntimeLogSnapshot(serverId, 400).join("\n"),
        readAsaLogSessionExcerpt(managed.installDir, managed.logSessionAnchor),
      ].join("\n"),
    );
    if (diagnosis !== null) {
      this.appendRuntimeLog(serverId, "error", diagnosis.summary);
      for (const line of diagnosis.excerpt.split("\n")) {
        this.appendRuntimeLog(serverId, "log", line);
      }
    }
    managed.status = "error";
    managed.lastError = planManagedExitLastError({
      wasStarting,
      exitCode: code,
      diagnosisSummary: diagnosis?.summary ?? null,
    });
    this.emit("unexpected-exit", {
      serverId,
      exitCode: code,
      phase: wasStarting ? "starting" : "running",
      lastError: managed.lastError,
      diagnosis,
    } satisfies UnexpectedManagedExit);
    this.emitStatus(serverId);
  }

  private emitStatus(serverId: string): void {
    this.emit("status", this.getStatus(serverId));
  }

  private captureRuntimeChunk(
    serverId: string,
    source: RuntimeLogSource,
    chunk: string,
  ): void {
    const key = runtimeLogPartialKey(serverId, source);
    const previous = this.runtimePartials.get(key) ?? "";
    const { completeLines, remainder } = splitRuntimeLogChunk(previous, chunk);
    this.runtimePartials.set(key, remainder);
    for (const line of completeLines) {
      this.appendRuntimeLog(serverId, source, line);
    }
  }

  private flushRuntimePartials(serverId: string): void {
    for (const source of RUNTIME_LOG_SOURCES) {
      const key = runtimeLogPartialKey(serverId, source);
      const pending = this.runtimePartials.get(key);
      this.runtimePartials.delete(key);
      if (pending !== undefined && pending.trim().length > 0) {
        this.appendRuntimeLog(serverId, source, pending);
      }
    }
  }

  private clearRuntimePartials(serverId: string): void {
    for (const source of RUNTIME_LOG_SOURCES) {
      this.runtimePartials.delete(runtimeLogPartialKey(serverId, source));
    }
  }

  private appendRuntimeLog(serverId: string, source: string, message: string): void {
    const line = message.trim();
    if (line.length === 0) {
      return;
    }

    const list = this.runtimeLogs.get(serverId) ?? [];
    this.runtimeLogs.set(
      serverId,
      appendRuntimeLogRing(
        list,
        formatRuntimeLogLine(new Date().toISOString(), source, line),
      ),
    );
  }
}
