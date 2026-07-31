import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import type {
  ServerProfile,
  ServerRuntimeInfo,
  ServerStatus,
  StartServerOptions,
} from "@shared/types";
import {
  buildLaunchArgs,
  buildWindowsVerbatimSpawnArgs,
  formatLaunchCommandLine,
  quoteWindowsArg,
  serverBinaryPath,
} from "../../domains/instances/launch-args";
import { rconExec } from "../rcon/rcon-client";
import { AsaSavedLogsTailer } from "./asa-log-tail";

interface ManagedProcess {
  child: ChildProcess;
  identity: object;
  status: ServerStatus;
  startedAt: string;
  lastError: string | null;
  readinessGeneration: number;
  logTailer: AsaSavedLogsTailer | null;
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

function killWinProcessTree(pid: number): boolean {
  const result = spawnSync(
    "taskkill",
    ["/pid", String(pid), "/T", "/F"],
    { windowsHide: true, stdio: "ignore" },
  );
  return result.status === 0;
}

function argsIncludeLogFlag(args: string[]): boolean {
  return args.some((arg) => /^[-/]log$/i.test(arg.trim()));
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
 * console. Piped mode: `windowsHide: true` + stdout/stderr pipes + Saved/Logs
 * file tail (Unreal rarely prints the console stream to stdout when hidden).
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
      detached: false,
    });
  }

  return spawn(binary, spawnArgs, {
    argv0,
    cwd,
    shell: false,
    windowsVerbatimArguments: isWindows,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
}

export interface ProcessManagerOptions {
  /** Timeout waiting for readiness (RCON / log). Default 10 minutes. */
  readyTimeoutMs?: number;
  /** Interval between RCON attempts. Default 3s. */
  readyPollMs?: number;
  /** Process factory override for lifecycle tests. */
  spawnProcess?: typeof spawnAsaProcess;
}

const RCON_HOST = "127.0.0.1";
const SAVE_WAIT_MS = 8000;
const EXIT_WAIT_MS = 30000;
const MAX_RUNTIME_LOG_LINES = 1200;
const DEFAULT_READY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_READY_POLL_MS = 3000;
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
  private readonly spawnProcess: typeof spawnAsaProcess;

  constructor(options?: ProcessManagerOptions) {
    super();
    this.readyTimeoutMs = options?.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    this.readyPollMs = options?.readyPollMs ?? DEFAULT_READY_POLL_MS;
    this.spawnProcess = options?.spawnProcess ?? spawnAsaProcess;
  }

  getStatus(serverId: string): ServerRuntimeInfo {
    const managed = this.processes.get(serverId);
    if (managed === undefined) {
      return {
        serverId,
        status: "stopped",
        pid: null,
        startedAt: null,
        lastError: null,
      };
    }
    return {
      serverId,
      status: managed.status,
      pid: managed.child.pid ?? null,
      startedAt: managed.startedAt,
      lastError: managed.lastError,
    };
  }

  listStatuses(serverIds: string[]): ServerRuntimeInfo[] {
    return serverIds.map((id) => this.getStatus(id));
  }

  isActive(serverId: string): boolean {
    const status = this.processes.get(serverId)?.status;
    return status === "starting" || status === "running" || status === "stopping";
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

    const args = options?.launchArgsOverride ?? buildLaunchArgs(profile);
    const nativeConsole = options?.openNativeConsole === true;
    let spawnArgs = args;
    // Only when using profile-built CLI — never mutate launchArgsOverride (tests / custom argv).
    if (
      !nativeConsole &&
      options?.launchArgsOverride === undefined &&
      !argsIncludeLogFlag(spawnArgs)
    ) {
      // Helps Unreal write ShooterGame/Saved/Logs while the console is hidden.
      spawnArgs = [...spawnArgs, "-log"];
    }
    // Log the same logical Unreal shape sent verbatim on Windows.
    const displayCommandLine =
      options?.launchArgsOverride !== undefined
        ? [binary, ...spawnArgs].join(" ")
        : spawnArgs !== args
          ? `${formatLaunchCommandLine(profile, binary)} -log`
          : formatLaunchCommandLine(profile, binary);
    const child = this.spawnProcess(binary, spawnArgs, profile.installDir, {
      nativeConsole,
    });

    this.appendRuntimeLog(profile.id, "system", `Starting process ${binary}`);
    this.appendRuntimeLog(profile.id, "system", `Commandline: ${displayCommandLine}`);
    if (nativeConsole) {
      this.appendRuntimeLog(
        profile.id,
        "system",
        "Native server console opened (live output in that window)",
      );
    } else {
      this.appendRuntimeLog(
        profile.id,
        "system",
        "Piped mode: following ShooterGame/Saved/Logs for Runtime",
      );
    }
    const managed: ManagedProcess = {
      child,
      identity: {},
      status: "starting",
      startedAt: new Date().toISOString(),
      lastError: null,
      readinessGeneration: 0,
      logTailer: null,
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
    if (!nativeConsole) {
      managed.logTailer = new AsaSavedLogsTailer(
        profile.installDir,
        (text) => {
          if (this.processes.get(profile.id) !== managed) return;
          this.captureRuntimeChunk(profile.id, "log", text);
        },
      );
      managed.logTailer.start(Date.parse(managed.startedAt));
    }
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
      this.emitStatus(profile.id);
    });

    child.once("exit", (code) => {
      const wasStopping = managed.status === "stopping";
      const wasStarting = managed.status === "starting";
      managed.readinessGeneration += 1;
      managed.logTailer?.stop();
      managed.logTailer = null;
      if (this.processes.get(profile.id) !== managed) return;
      this.flushRuntimePartials(profile.id);
      this.appendRuntimeLog(
        profile.id,
        "system",
        `Process exited with code ${code ?? "unknown"}`,
      );
      if (wasStopping || code === 0) {
        this.processes.delete(profile.id);
        this.emitStatus(profile.id);
        return;
      }
      managed.status = "error";
      managed.lastError = wasStarting
        ? `Process exited during startup (code ${code ?? "unknown"})`
        : `Process exited unexpectedly (code ${code ?? "unknown"})`;
      this.emitStatus(profile.id);
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
      await rconExec(
        RCON_HOST,
        profile.rconPort,
        profile.adminPassword,
        "SaveWorld",
      );
      await delay(SAVE_WAIT_MS);
      return {
        phase: "saved",
        handle: { serverId: profile.id, identity: managed.identity },
      };
    } catch {
      this.appendRuntimeLog(profile.id, "warning", "RCON unavailable; applying kill");
      this.terminateManaged(profile.id, managed);
      let exited = await this.waitForExit(managed.child, EXIT_WAIT_MS);
      if (!exited && this.processes.get(profile.id) === managed) {
        this.terminateManaged(profile.id, managed);
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
      await rconExec(
        RCON_HOST,
        profile.rconPort,
        profile.adminPassword,
        "DoExit",
      );
    } catch {
      this.appendRuntimeLog(profile.id, "warning", "RCON DoExit failed; applying kill");
      this.terminateManaged(profile.id, managed);
    }

    const exited = await this.waitForExit(managed.child, EXIT_WAIT_MS);
    if (!exited) {
      this.terminateManaged(profile.id, managed);
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
  kill(serverId: string): void {
    const managed = this.processes.get(serverId);
    if (managed === undefined) return;
    managed.readinessGeneration += 1;
    managed.status = "stopping";
    this.appendRuntimeLog(serverId, "warning", "Forcing process shutdown");
    this.emitStatus(serverId);
    this.terminateManaged(serverId, managed);
    if (this.processes.get(serverId) === managed) {
      this.processes.delete(serverId);
      this.emitStatus(serverId);
    }
  }

  /** Stops all active processes (app shutdown). Prefer InstanceService.stopAllForAppQuit. */
  async stopAll(profiles: ServerProfile[]): Promise<void> {
    await Promise.allSettled(
      profiles
        .filter((p) => this.isActive(p.id))
        .map((p) => this.stop(p)),
    );
  }

  /**
   * Resolves when the server is no longer `"starting"` (ready, gone, or error).
   * Used so Stop can wait for RCON before SaveWorld instead of force-killing.
   */
  async waitWhileStarting(serverId: string): Promise<void> {
    while (this.getStatus(serverId).status === "starting") {
      await delay(this.readyPollMs);
    }
  }

  private async waitUntilReady(
    profile: ServerProfile,
    managed: ManagedProcess,
    generation: number,
  ): Promise<void> {
    const timeoutMs = this.readyTimeoutMs;
    const pollMs = this.readyPollMs;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
        return;
      }

      if (this.hasReadyLogSignal(profile.id)) {
        this.appendRuntimeLog(
          profile.id,
          "system",
          "Startup signal detected in logs; checking RCON…",
        );
      }

      try {
        await rconExec(
          RCON_HOST,
          profile.rconPort,
          profile.adminPassword,
          "ListPlayers",
          RCON_PROBE_TIMEOUT_MS,
        );
        if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
          return;
        }
        managed.status = "running";
        managed.lastError = null;
        this.appendRuntimeLog(
          profile.id,
          "system",
          "Server ready: RCON responded (waiting for connections)",
        );
        this.emitStatus(profile.id);
        return;
      } catch {
        // keep trying until timeout or process exit
      }

      await delay(pollMs);
    }

    if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
      return;
    }

    managed.status = "error";
    managed.lastError =
      "Timeout waiting for server readiness (RCON did not respond in time)";
    this.appendRuntimeLog(profile.id, "error", managed.lastError);
    this.emitStatus(profile.id);
    try {
      this.terminateManaged(profile.id, managed);
    } catch {
      // ignore
    }
  }

  private terminateManaged(serverId: string, managed: ManagedProcess): void {
    this.stopManagedCapture(serverId, managed);
    const pid = managed.child.pid;
    if (process.platform === "win32" && pid !== undefined && killWinProcessTree(pid)) {
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
