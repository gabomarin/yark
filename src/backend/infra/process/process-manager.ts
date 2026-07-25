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
  formatLaunchCommandLine,
  serverBinaryPath,
} from "../../domains/instances/launch-args";
import { rconExec } from "../rcon/rcon-client";

interface ManagedProcess {
  child: ChildProcess;
  status: ServerStatus;
  startedAt: string;
  lastError: string | null;
  readinessGeneration: number;
}

function killWinProcessTree(pid: number): boolean {
  const result = spawnSync(
    "taskkill",
    ["/pid", String(pid), "/T", "/F"],
    { windowsHide: true, stdio: "ignore" },
  );
  return result.status === 0;
}

/**
 * Spawns ASA so the **child argv** keeps literal quotes on map and SessionName,
 * and so `child` is always `ArkAscendedServer.exe` (never `cmd.exe`).
 *
 * Pass **logical** args (`"Map"?SessionName="name"`) with
 * `windowsVerbatimArguments: false`. Node then quotes spaced exe paths and
 * escapes embedded quotes so CommandLineToArgvW yields the real quote chars
 * in argv (ASA Commandline log shows `"Map"?SessionName="name"`).
 *
 * Do **not** use `windowsVerbatimArguments: true` when the exe path has
 * spaces: Node leaves the path unquoted on lpCommandLine and argv breaks.
 * Do **not** wrap with `.cmd` / `cmd /c` / `start`: that flashes a visible
 * console and makes ProcessManager track cmd instead of the game.
 *
 * Native console: `windowsHide: false` so Windows gives the dedicated its own
 * console. Piped mode: `windowsHide: true` + stdout/stderr pipes.
 */
function spawnAsaProcess(
  binary: string,
  args: string[],
  cwd: string,
  options: { nativeConsole: boolean },
): ChildProcess {
  if (options.nativeConsole) {
    return spawn(binary, args, {
      cwd,
      shell: false,
      windowsVerbatimArguments: false,
      windowsHide: false,
      stdio: "ignore",
      detached: false,
    });
  }

  return spawn(binary, args, {
    cwd,
    shell: false,
    windowsVerbatimArguments: false,
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
  private readonly readyTimeoutMs: number;
  private readonly readyPollMs: number;

  constructor(options?: ProcessManagerOptions) {
    super();
    this.readyTimeoutMs = options?.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    this.readyPollMs = options?.readyPollMs ?? DEFAULT_READY_POLL_MS;
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
    // Log the logical Unreal shape (real quotes). Spawn uses Node escaping of the same args.
    const displayCommandLine =
      options?.launchArgsOverride !== undefined
        ? [binary, ...args].join(" ")
        : formatLaunchCommandLine(profile, binary);
    const nativeConsole = options?.openNativeConsole === true;
    const child = spawnAsaProcess(binary, args, profile.installDir, {
      nativeConsole,
    });

    this.appendRuntimeLog(profile.id, "system", `Starting process ${binary}`);
    this.appendRuntimeLog(
      profile.id,
      "system",
      `Commandline: ${displayCommandLine}`,
    );
    if (nativeConsole) {
      this.appendRuntimeLog(
        profile.id,
        "system",
        "Native server console opened (live output in that window)",
      );
    }
    if (child.stdout !== null) {
      child.stdout.on("data", (chunk) => {
        this.captureRuntimeChunk(profile.id, "stdout", String(chunk));
      });
    }
    if (child.stderr !== null) {
      child.stderr.on("data", (chunk) => {
        this.captureRuntimeChunk(profile.id, "stderr", String(chunk));
      });
    }

    const managed: ManagedProcess = {
      child,
      status: "starting",
      startedAt: new Date().toISOString(),
      lastError: null,
      readinessGeneration: 0,
    };
    this.processes.set(profile.id, managed);
    this.emitStatus(profile.id);

    child.once("spawn", () => {
      if (managed.status !== "starting") {
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
      managed.status = "error";
      managed.lastError = err.message;
      this.appendRuntimeLog(profile.id, "error", `Process error: ${err.message}`);
      this.emitStatus(profile.id);
    });

    child.once("exit", (code) => {
      const wasStopping = managed.status === "stopping";
      const wasStarting = managed.status === "starting";
      managed.readinessGeneration += 1;
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
   * Safe stop: saveworld via RCON, wait, DoExit, then kill fallback.
   */
  async stop(profile: ServerProfile): Promise<void> {
    const managed = this.processes.get(profile.id);
    if (managed === undefined) return;
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
      await rconExec(
        RCON_HOST,
        profile.rconPort,
        profile.adminPassword,
        "DoExit",
      );
    } catch {
      // RCON unavailable: fall back to process termination.
      this.appendRuntimeLog(profile.id, "warning", "RCON unavailable; applying kill");
      this.terminateManaged(managed);
    }

    const exited = await this.waitForExit(managed.child, EXIT_WAIT_MS);
    if (!exited) {
      this.terminateManaged(managed);
      await this.waitForExit(managed.child, 5000);
    }
    this.processes.delete(profile.id);
    this.emitStatus(profile.id);
  }

  /** Immediate termination without save (last resort). */
  kill(serverId: string): void {
    const managed = this.processes.get(serverId);
    if (managed === undefined) return;
    managed.readinessGeneration += 1;
    managed.status = "stopping";
    this.appendRuntimeLog(serverId, "warning", "Forcing process shutdown");
    this.emitStatus(serverId);
    this.terminateManaged(managed);
    this.processes.delete(serverId);
    this.emitStatus(serverId);
  }

  /** Stops all active processes (app shutdown). */
  async stopAll(profiles: ServerProfile[]): Promise<void> {
    await Promise.allSettled(
      profiles
        .filter((p) => this.isActive(p.id))
        .map((p) => this.stop(p)),
    );
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
      this.terminateManaged(managed);
    } catch {
      // ignore
    }
  }

  private terminateManaged(managed: ManagedProcess): void {
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

  private captureRuntimeChunk(serverId: string, source: "stdout" | "stderr", chunk: string): void {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      this.appendRuntimeLog(serverId, source, line);
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
