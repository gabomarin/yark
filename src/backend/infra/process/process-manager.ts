import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import type {
  ServerProfile,
  ServerRuntimeInfo,
  ServerStatus,
  SessionPortSet,
  StartServerOptions,
} from "@shared/types";
import {
  LEFT_RUNNING_SCHEMA_VERSION,
  classifyLeaveCandidate,
  type LeftRunningProcessIdentity,
  type LiveProcessIdentity,
} from "@shared/left-running";
import {
  buildLaunchArgs,
  buildWindowsCreateProcessCommandLine,
  buildWindowsVerbatimSpawnArgs,
  quoteWindowsArg,
  serverBinaryPath,
} from "../../domains/instances/launch-args";
import { rconExec } from "../rcon/rcon-client";
import { diagnoseAsaStartupFailure, type AsaStartupFailure } from "@shared/asa-startup-failure";
import {
  AsaSavedLogsTailer,
  captureAsaLogSessionAnchor,
  readAsaLogSessionExcerpt,
  type AsaLogSessionAnchor,
} from "./asa-log-tail";
import { createAdoptedChildHandle } from "./adopted-child";
import { killWinProcessTreeAsync } from "./kill-win-process-tree";
import { queryWindowsProcessIdentity } from "./windows-process-identity";

interface ManagedProcess {
  child: ChildProcess;
  identity: object;
  status: ServerStatus;
  startedAt: string;
  lastError: string | null;
  readinessGeneration: number;
  logTailer: AsaSavedLogsTailer | null;
  logSessionAnchor: AsaLogSessionAnchor;
  executablePath: string;
  installDir: string;
  launchArgs: string[];
  expectedCommandLine: string;
  /** Ports used for this live process (including session-only overrides). */
  runtimePorts: SessionPortSet;
}

export interface GracefulStopHandle {
  readonly serverId: string;
  /** Opaque identity of the exact child that acknowledged SaveWorld. */
  readonly identity: object;
}

export type BeginGracefulStopResult =
  | { phase: "saved"; handle: GracefulStopHandle }
  | { phase: "killed"; handle: null }
  | { phase: "absent"; handle: null };

export type FinishGracefulStopResult =
  | "stopped"
  | "already_exited"
  | "replaced";

/** Observed child exit that was not an operator stop. */
export interface UnexpectedManagedExit {
  serverId: string;
  exitCode: number | null;
  phase: "starting" | "running";
  lastError: string;
  diagnosis: AsaStartupFailure | null;
}

function argsIncludeLogFlag(args: string[]): boolean {
  return args.some((arg) => /^[-/]log$/i.test(arg.trim()));
}

function argsIncludeConsoleFlag(args: string[]): boolean {
  return args.some((arg) => /^[-/]console$/i.test(arg.trim()));
}

/**
 * Spawns ASA so its raw command line keeps the intended, separate quotes on
 * map and SessionName,
 * and so `child` is always `ArkAscendedServer.exe` (never `cmd.exe`).
 *
 * On Windows, arguments are prepared individually and passed verbatim. This
 * avoids Node's default extra wrapper around a map URL that contains spaces:
 * `""Map"?SessionName="My Server""`. CreateProcess receives `binary`
 * separately, while `argv0` is explicitly quoted for spaced install paths.
 *
 * Native console: `windowsHide: false` so Windows gives the dedicated its own
 * console. Piped mode: `windowsHide: true` + stdout/stderr pipes. Both modes
 * tail `ShooterGame/Saved/Logs/ShooterGame.log` into Runtime (Unreal rarely
 * prints the console stream to stdout when hidden).
 *
 * Always `detached: true` so ASA can outlive an unexpected Electron exit
 * (crash / Task Manager). Windows otherwise kills non-detached children with
 * the parent. Intentional quit stops servers; there is no Leave-running UX.
 */
function spawnAsaProcess(
  binary: string,
  args: string[],
  cwd: string,
  options: { nativeConsole: boolean },
): ChildProcess {
  const isWindows = process.platform === "win32";
  const spawnArgs = isWindows
    ? buildWindowsVerbatimSpawnArgs(args)
    : args;
  const argv0 = isWindows ? quoteWindowsArg(binary) : binary;

  if (options.nativeConsole) {
    return spawn(binary, spawnArgs, {
      argv0,
      cwd,
      shell: false,
      windowsVerbatimArguments: isWindows,
      windowsHide: false,
      stdio: "ignore",
      detached: true,
    });
  }

  return spawn(binary, spawnArgs, {
    argv0,
    cwd,
    shell: false,
    windowsVerbatimArguments: isWindows,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
}

function disconnectChildStdio(child: ChildProcess): void {
  for (const stream of [child.stdin, child.stdout, child.stderr]) {
    if (stream == null || stream.destroyed) {
      continue;
    }
    try {
      stream.destroy();
    } catch {
      // Ignore: already closing during Leave.
    }
  }
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
const SAVE_WAIT_MS = 8000;
const EXIT_WAIT_MS = 30000;
const MAX_RUNTIME_LOG_LINES = 1200;
const DEFAULT_READY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_READY_POLL_MS = 3000;
/** Avoid hammering RCON while the dedicated is still booting assets/world. */
const DEFAULT_READY_PROBE_MIN_WAIT_MS = 45_000;
/** First RCON success is early; confirm after the world settles. */
const DEFAULT_READY_SETTLE_MS = 15_000;
const RCON_PROBE_TIMEOUT_MS = 2500;

/** Typical log signals when the dedicated already accepts players. */
const READY_LOG_PATTERNS: RegExp[] = [
  /server has completed startup/i,
  /now advertising/i,
  /full startup/i,
  /started listening/i,
  /rcon.*listening/i,
  /lognet:.*listen/i,
];

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
    if (this.isActive(profile.id)) {
      throw new Error(`Server "${profile.name}" is already running`);
    }
    const binary = serverBinaryPath(profile.installDir);
    if (!existsSync(binary)) {
      throw new Error(
        `Server executable not found at: ${binary}`,
      );
    }

    this.clearRuntimeLog(profile.id);
    const logSessionAnchor = captureAsaLogSessionAnchor(profile.installDir);
    const args = options?.launchArgsOverride ?? buildLaunchArgs(profile);
    const nativeConsole = options?.openNativeConsole === true;
    let spawnArgs = args;
    // Only when using profile-built CLI — never mutate launchArgsOverride (tests / custom argv).
    if (options?.launchArgsOverride === undefined) {
      if (nativeConsole && !argsIncludeConsoleFlag(spawnArgs)) {
        spawnArgs = [...spawnArgs, "-console"];
      }
      if (!argsIncludeLogFlag(spawnArgs)) {
        spawnArgs = [...spawnArgs, "-log"];
      }
    }
    const expectedCommandLine =
      process.platform === "win32"
        ? buildWindowsCreateProcessCommandLine(binary, spawnArgs)
        : [binary, ...spawnArgs].join(" ");
    const child = this.spawnProcess(binary, spawnArgs, profile.installDir, {
      nativeConsole,
    });

    this.appendRuntimeLog(profile.id, "system", `Starting process ${binary}`);
    this.appendRuntimeLog(profile.id, "system", `Commandline: ${expectedCommandLine}`);
    this.appendRuntimeLog(
      profile.id,
      "system",
      nativeConsole
        ? "Native server console opened; Runtime follows ShooterGame.log"
        : "Piped mode: following ShooterGame/Saved/Logs for Runtime",
    );
    const managed: ManagedProcess = {
      child,
      identity: {},
      status: "starting",
      startedAt: new Date().toISOString(),
      lastError: null,
      readinessGeneration: 0,
      logTailer: null,
      logSessionAnchor,
      executablePath: binary,
      installDir: profile.installDir,
      launchArgs: [...spawnArgs],
      expectedCommandLine,
      runtimePorts: {
        gamePort: profile.gamePort,
        queryPort: profile.queryPort,
        rconPort: profile.rconPort,
      },
    };
    this.processes.set(profile.id, managed);
    if (child.stdout !== null) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (this.processes.get(profile.id) !== managed) return;
        this.captureRuntimeChunk(profile.id, "stdout", chunk);
      });
    }
    if (child.stderr !== null) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        if (this.processes.get(profile.id) !== managed) return;
        this.captureRuntimeChunk(profile.id, "stderr", chunk);
      });
    }
    managed.logTailer = new AsaSavedLogsTailer(
      profile.installDir,
      (text) => {
        if (this.processes.get(profile.id) !== managed) return;
        this.captureRuntimeChunk(profile.id, "log", text);
      },
    );
    managed.logTailer.start(managed.logSessionAnchor);
    this.emitStatus(profile.id);

    child.once("spawn", () => {
      if (
        this.processes.get(profile.id) !== managed ||
        managed.status !== "starting"
      ) {
        return;
      }
      this.appendRuntimeLog(
        profile.id,
        "system",
        "Process created; waiting for server readiness (RCON / startup)",
      );
      void this.writeProcessCheckpoint(profile.id, managed);
      this.emitStatus(profile.id);

      if (options?.skipReadinessCheck === true) {
        managed.status = "running";
        this.appendRuntimeLog(
          profile.id,
          "system",
          "Readiness skipped (skipReadinessCheck); status running",
        );
        this.emitStatus(profile.id);
        return;
      }

      managed.readinessGeneration += 1;
      void this.waitUntilReady(profile, managed, managed.readinessGeneration);
    });

    child.once("error", (err) => {
      managed.readinessGeneration += 1;
      managed.logTailer?.stop();
      managed.logTailer = null;
      if (this.processes.get(profile.id) !== managed) return;
      this.flushRuntimePartials(profile.id);
      managed.status = "error";
      managed.lastError = err.message;
      this.appendRuntimeLog(profile.id, "error", `Process error: ${err.message}`);
      this.clearProcessCheckpoint(profile.id);
      this.emitStatus(profile.id);
    });

    child.once("exit", (code) => {
      this.onManagedExit(profile.id, managed, code);
    });
  }

  /**
   * Result of {@link beginGracefulStop}: `saved` means RCON SaveWorld
   * succeeded and the process is still managed; `killed` means RCON failed
   * and the process was terminated; `absent` means nothing was running.
   */
  async beginGracefulStop(
    profile: ServerProfile,
  ): Promise<BeginGracefulStopResult> {
    const managed = this.processes.get(profile.id);
    if (managed === undefined) return { phase: "absent", handle: null };
    managed.readinessGeneration += 1;
    managed.status = "stopping";
    this.appendRuntimeLog(profile.id, "system", "Attempting safe stop via RCON");
    this.emitStatus(profile.id);

    try {
      await this.executeRcon(profile, "SaveWorld");
      await delay(SAVE_WAIT_MS);
      return {
        phase: "saved",
        handle: { serverId: profile.id, identity: managed.identity },
      };
    } catch {
      // Prefer DoExit before force-kill when SaveWorld is unavailable (e.g. still
      // bootstrapping after a readiness wait timeout on quit Stop).
      this.appendRuntimeLog(
        profile.id,
        "warning",
        "RCON SaveWorld unavailable; attempting DoExit before kill",
      );
      try {
        await this.executeRcon(profile, "DoExit");
        const exitedAfterDoExit = await this.waitForExit(managed.child, EXIT_WAIT_MS);
        if (exitedAfterDoExit) {
          if (this.processes.get(profile.id) === managed) {
            this.stopManagedCapture(profile.id, managed);
            this.processes.delete(profile.id);
            this.clearProcessCheckpoint(profile.id);
            this.emitStatus(profile.id);
          }
          return { phase: "killed", handle: null };
        }
      } catch {
        this.appendRuntimeLog(
          profile.id,
          "warning",
          "RCON DoExit unavailable; applying kill",
        );
      }

      await this.terminateManaged(profile.id, managed);
      let exited = await this.waitForExit(managed.child, EXIT_WAIT_MS);
      if (!exited && this.processes.get(profile.id) === managed) {
        await this.terminateManaged(profile.id, managed);
        exited = await this.waitForExit(managed.child, 5000);
      }
      if (!exited && this.processes.get(profile.id) === managed) {
        managed.status = "error";
        managed.lastError = "Could not terminate process after RCON SaveWorld failed";
        this.appendRuntimeLog(profile.id, "error", managed.lastError);
        this.emitStatus(profile.id);
        throw new Error(managed.lastError);
      }
      if (this.processes.get(profile.id) === managed) {
        this.stopManagedCapture(profile.id, managed);
        this.processes.delete(profile.id);
        this.clearProcessCheckpoint(profile.id);
        this.emitStatus(profile.id);
      }
      return { phase: "killed", handle: null };
    }
  }

  /**
   * After a successful {@link beginGracefulStop} (`saved`), send DoExit and
   * wait / force-kill. No-op if the process is already gone.
   */
  async finishGracefulStop(
    profile: ServerProfile,
    handle: GracefulStopHandle,
  ): Promise<FinishGracefulStopResult> {
    const managed = this.processes.get(profile.id);
    if (managed === undefined) return "already_exited";
    if (managed.identity !== handle.identity || handle.serverId !== profile.id) {
      return "replaced";
    }

    try {
      await this.executeRcon(profile, "DoExit");
    } catch {
      this.appendRuntimeLog(profile.id, "warning", "RCON DoExit failed; applying kill");
      await this.terminateManaged(profile.id, managed);
    }

    const exited = await this.waitForExit(managed.child, EXIT_WAIT_MS);
    if (!exited) {
      await this.terminateManaged(profile.id, managed);
      const forcedExit = await this.waitForExit(managed.child, 5000);
      if (!forcedExit && this.processes.get(profile.id) === managed) {
        managed.status = "error";
        managed.lastError = "Could not terminate process after RCON DoExit";
        this.appendRuntimeLog(profile.id, "error", managed.lastError);
        this.emitStatus(profile.id);
        throw new Error(managed.lastError);
      }
    }
    if (this.processes.get(profile.id) === managed) {
      this.stopManagedCapture(profile.id, managed);
      this.processes.delete(profile.id);
      this.clearProcessCheckpoint(profile.id);
      this.emitStatus(profile.id);
    }
    return "stopped";
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
    const queryOs =
      options?.queryOsIdentity ??
      ((pid: number) => this.queryOsIdentity(pid));
    const leftAt = options?.leftAt ?? new Date().toISOString();
    const records: LeftRunningProcessIdentity[] = [];

    for (const profile of profiles) {
      const managed = this.processes.get(profile.id);
      if (managed === undefined || !this.isActive(profile.id)) {
        continue;
      }
      const pid = managed.child.pid;
      if (pid === undefined || !Number.isInteger(pid) || pid <= 0) {
        throw new Error(
          `Cannot leave "${profile.name}" running: process id is unavailable`,
        );
      }

      const live = await queryOs(pid);
      const osCreationTime = live?.osCreationTime?.trim() || null;
      if (osCreationTime === null) {
        throw new Error(
          `Cannot leave "${profile.name}" running: OS process creation time is unavailable (needed to reject PID reuse)`,
        );
      }

      records.push({
        schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
        serverId: profile.id,
        pid,
        executablePath: managed.executablePath,
        installDir: managed.installDir,
        startedAt: managed.startedAt,
        expectedCommandLine: managed.expectedCommandLine,
        launchArgs: [...managed.launchArgs],
        runtimePorts: { ...managed.runtimePorts },
        osCreationTime,
        osExecutablePath: live?.executablePath ?? null,
        leftAt,
      });
    }

    return records;
  }

  /**
   * Detach previously snapshotted Leave processes (after durable metadata write).
   * Stops log capture, disconnects stdio, unrefs, and drops tracking.
   */
  detachAfterLeavePersist(records: LeftRunningProcessIdentity[]): void {
    for (const record of records) {
      const managed = this.processes.get(record.serverId);
      if (managed === undefined || !this.isActive(record.serverId)) {
        continue;
      }
      if (managed.child.pid !== record.pid) {
        throw new Error(
          `Cannot detach "${record.serverId}": process id changed since Leave snapshot`,
        );
      }

      this.appendRuntimeLog(
        record.serverId,
        "system",
        `Detaching for Leave running (pid ${record.pid}); process stays alive`,
      );
      this.stopManagedCapture(record.serverId, managed);
      managed.readinessGeneration += 1;
      disconnectChildStdio(managed.child);
      try {
        managed.child.unref();
      } catch {
        // Ignore: some test fakes omit unref.
      }
      if (this.processes.get(record.serverId) === managed) {
        this.processes.delete(record.serverId);
        this.emitStatus(record.serverId);
      }
    }
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
    const records = await this.collectLeaveIdentities(profiles, options);
    this.detachAfterLeavePersist(records);
    return records;
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
    if (this.isActive(profile.id)) {
      throw new Error(`Server "${profile.name}" is already running`);
    }
    if (record.serverId !== profile.id) {
      throw new Error("Leave identity serverId does not match profile");
    }
    if (!Number.isInteger(record.pid) || record.pid <= 0) {
      throw new Error("Leave identity has an invalid process id");
    }

    const queryOs = options?.queryOsIdentity ?? this.queryOsIdentity;
    const live = await queryOs(record.pid);
    const classification = classifyLeaveCandidate(record, live);
    if (classification !== "match") {
      throw new Error(
        `Leave identity for "${profile.name}" failed re-validation (${classification})`,
      );
    }

    const child = this.createAdoptedChild(record.pid);
    const runtimePorts = record.runtimePorts ?? {
      gamePort: profile.gamePort,
      queryPort: profile.queryPort,
      rconPort: profile.rconPort,
    };
    const managed: ManagedProcess = {
      child,
      identity: {},
      status: "starting",
      startedAt: record.startedAt,
      lastError: null,
      readinessGeneration: 0,
      logTailer: null,
      logSessionAnchor: captureAsaLogSessionAnchor(record.installDir),
      executablePath: record.executablePath,
      installDir: record.installDir,
      launchArgs: [...record.launchArgs],
      expectedCommandLine: record.expectedCommandLine,
      runtimePorts: { ...runtimePorts },
    };
    this.processes.set(profile.id, managed);
    this.appendRuntimeLog(
      profile.id,
      "system",
      `Reattached to left-running process (pid ${record.pid})`,
    );
    // Fire-and-forget like start(); pass live identity to skip a second PowerShell probe.
    void this.writeProcessCheckpoint(profile.id, managed, live);

    managed.logTailer = new AsaSavedLogsTailer(profile.installDir, (text) => {
      if (this.processes.get(profile.id) !== managed) return;
      this.captureRuntimeChunk(profile.id, "log", text);
    });
    managed.logTailer.start(managed.logSessionAnchor);
    this.appendRuntimeLog(
      profile.id,
      "system",
      "Waiting for RCON readiness after crash-recovery reattach…",
    );
    this.emitStatus(profile.id);

    child.once("exit", (code) => {
      this.onManagedExit(profile.id, managed, code);
    });

    if (options?.skipReadinessCheck === true) {
      managed.status = "running";
      this.appendRuntimeLog(
        profile.id,
        "system",
        "Readiness skipped after reattach; status running",
      );
      this.emitStatus(profile.id);
      return;
    }

    managed.readinessGeneration += 1;
    void this.waitUntilReady(
      {
        ...profile,
        gamePort: managed.runtimePorts.gamePort,
        queryPort: managed.runtimePorts.queryPort,
        rconPort: managed.runtimePorts.rconPort,
      },
      managed,
      managed.readinessGeneration,
      {
        terminateOnTimeout: false,
      },
    );
  }

  private async waitUntilReady(
    profile: ServerProfile,
    managed: ManagedProcess,
    generation: number,
    options?: { terminateOnTimeout?: boolean },
  ): Promise<void> {
    const timeoutMs = this.readyTimeoutMs;
    const pollMs = this.readyPollMs;
    const deadline = Date.now() + timeoutMs;
    const terminateOnTimeout = options?.terminateOnTimeout !== false;
    let loggedReattachWait = false;
    let loggedWaitingForBoot = false;
    let loggedProbeStart = false;
    const bootStartedAt = Date.parse(managed.startedAt) || Date.now();

    for (;;) {
      if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
        return;
      }

      const sawLogSignal = this.hasReadyLogSignal(profile.id);
      const elapsedMs = Date.now() - bootStartedAt;
      const mayProbe =
        sawLogSignal || elapsedMs >= this.readyProbeMinWaitMs;

      if (!mayProbe) {
        if (!loggedWaitingForBoot) {
          loggedWaitingForBoot = true;
          this.appendRuntimeLog(
            profile.id,
            "system",
            `Waiting for startup to progress before RCON probes (min ${Math.round(this.readyProbeMinWaitMs / 1000)}s or log signal)…`,
          );
        }
        await delay(pollMs);
        continue;
      }

      if (sawLogSignal && !loggedProbeStart) {
        this.appendRuntimeLog(
          profile.id,
          "system",
          "Startup signal detected in logs; checking RCON…",
        );
      } else if (!loggedProbeStart) {
        this.appendRuntimeLog(
          profile.id,
          "system",
          "Minimum startup wait elapsed; checking RCON…",
        );
      }
      loggedProbeStart = true;

      try {
        await rconExec(
          RCON_HOST,
          profile.rconPort,
          profile.adminPassword,
          "ListPlayers",
          RCON_PROBE_TIMEOUT_MS,
          { quiet: true },
        );
        if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
          return;
        }

        if (this.readySettleMs > 0) {
          this.appendRuntimeLog(
            profile.id,
            "system",
            `RCON responded; waiting ${Math.round(this.readySettleMs / 1000)}s for the dedicated to finish settling…`,
          );
          const settleDeadline = Date.now() + this.readySettleMs;
          while (Date.now() < settleDeadline) {
            if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
              return;
            }
            await delay(Math.min(pollMs, settleDeadline - Date.now()));
          }
          if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
            return;
          }
          await rconExec(
            RCON_HOST,
            profile.rconPort,
            profile.adminPassword,
            "ListPlayers",
            RCON_PROBE_TIMEOUT_MS,
            { quiet: true },
          );
          if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
            return;
          }
        }

        managed.status = "running";
        managed.lastError = null;
        this.appendRuntimeLog(
          profile.id,
          "system",
          "Server ready: RCON confirmed after settle (waiting for connections)",
        );
        this.emitStatus(profile.id);
        return;
      } catch {
        // keep trying until timeout, process exit, or (reattach) forever
      }

      if (Date.now() >= deadline) {
        if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
          return;
        }
        if (!terminateOnTimeout) {
          if (!loggedReattachWait) {
            loggedReattachWait = true;
            this.appendRuntimeLog(
              profile.id,
              "warning",
              "Still waiting for RCON after Leave reattach; UI stays on starting",
            );
          }
          await delay(pollMs);
          continue;
        }

        managed.status = "error";
        managed.lastError =
          "Timeout waiting for server readiness (RCON did not respond in time)";
        this.appendRuntimeLog(profile.id, "error", managed.lastError);
        this.clearProcessCheckpoint(profile.id);
        this.emitStatus(profile.id);
        try {
          await this.terminateManaged(profile.id, managed);
        } catch {
          // ignore
        }
        return;
      }

      await delay(pollMs);
    }
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

  private isSameStartingGeneration(
    serverId: string,
    managed: ManagedProcess,
    generation: number,
  ): boolean {
    const current = this.processes.get(serverId);
    return (
      current === managed &&
      managed.status === "starting" &&
      managed.readinessGeneration === generation
    );
  }

  private hasReadyLogSignal(serverId: string): boolean {
    const lines = this.runtimeLogs.get(serverId) ?? [];
    return lines.some((line) => READY_LOG_PATTERNS.some((pattern) => pattern.test(line)));
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
      `Process exited with code ${code ?? "unknown"}`,
    );
    this.clearProcessCheckpoint(serverId);
    const unexpected = !wasStopping && (wasStarting || (wasRunning && code !== 0));
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
    managed.lastError =
      diagnosis?.summary ??
      (wasStarting
        ? `Process exited during startup (code ${code ?? "unknown"})`
        : `Process exited unexpectedly (code ${code ?? "unknown"})`);
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
    source: "stdout" | "stderr" | "log",
    chunk: string,
  ): void {
    const key = `${serverId}\0${source}`;
    const combined = `${this.runtimePartials.get(key) ?? ""}${chunk}`;
    const parts = combined.split(/\r?\n/);
    const pending = parts.pop() ?? "";
    this.runtimePartials.set(key, pending);
    for (const line of parts) {
      if (line.trim().length === 0) continue;
      this.appendRuntimeLog(serverId, source, line);
    }
  }

  private flushRuntimePartials(serverId: string): void {
    for (const source of ["stdout", "stderr", "log"] as const) {
      const key = `${serverId}\0${source}`;
      const pending = this.runtimePartials.get(key);
      this.runtimePartials.delete(key);
      if (pending !== undefined && pending.trim().length > 0) {
        this.appendRuntimeLog(serverId, source, pending);
      }
    }
  }

  private clearRuntimePartials(serverId: string): void {
    for (const source of ["stdout", "stderr", "log"] as const) {
      this.runtimePartials.delete(`${serverId}\0${source}`);
    }
  }

  private appendRuntimeLog(serverId: string, source: string, message: string): void {
    const line = message.trim();
    if (line.length === 0) {
      return;
    }

    const list = this.runtimeLogs.get(serverId) ?? [];
    list.push(`[${new Date().toISOString()}] [${source}] ${line}`);
    if (list.length > MAX_RUNTIME_LOG_LINES) {
      list.splice(0, list.length - MAX_RUNTIME_LOG_LINES);
    }
    this.runtimeLogs.set(serverId, list);
  }
}
