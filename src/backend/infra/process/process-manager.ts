import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import type {
  ServerProfile,
  ServerRuntimeInfo,
  ServerStatus,
  StartServerOptions,
} from "@shared/types";
import { buildLaunchArgs, serverBinaryPath } from "../../domains/instances/launch-args";
import { rconExec } from "../rcon/rcon-client";

interface ManagedProcess {
  child: ChildProcess;
  status: ServerStatus;
  startedAt: string;
  lastError: string | null;
  readinessGeneration: number;
  /** Proceso envuelto en `start /WAIT` (consola nativa visible). */
  nativeConsole: boolean;
}

function quoteCmdArg(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Lanza el dedicated en una consola Windows nueva y visible.
 * El ChildProcess es un `cmd /c start /WAIT` oculto que sigue vivo
 * mientras corre el servidor (permite stop/kill por árbol de procesos).
 */
function spawnWithNativeConsole(
  binary: string,
  args: string[],
  cwd: string,
  windowTitle: string,
): ChildProcess {
  const parts = [
    "start",
    quoteCmdArg(windowTitle),
    "/D",
    quoteCmdArg(cwd),
    "/WAIT",
    quoteCmdArg(binary),
    // Siempre entrecomillar: el mapa ASA lleva `?` y cmd lo trata como comodín.
    ...args.map((arg) => quoteCmdArg(arg)),
  ];
  return spawn("cmd.exe", ["/c", parts.join(" ")], {
    windowsHide: true,
    windowsVerbatimArguments: true,
    stdio: "ignore",
    detached: false,
  });
}

function killWinProcessTree(pid: number): boolean {
  const result = spawnSync(
    "taskkill",
    ["/pid", String(pid), "/T", "/F"],
    { windowsHide: true, stdio: "ignore" },
  );
  return result.status === 0;
}

export interface ProcessManagerOptions {
  /** Timeout esperando readiness (RCON / log). Default 10 minutos. */
  readyTimeoutMs?: number;
  /** Intervalo entre intentos RCON. Default 3s. */
  readyPollMs?: number;
}

const RCON_HOST = "127.0.0.1";
const SAVE_WAIT_MS = 8000;
const EXIT_WAIT_MS = 30000;
const MAX_RUNTIME_LOG_LINES = 1200;
const DEFAULT_READY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_READY_POLL_MS = 3000;
const RCON_PROBE_TIMEOUT_MS = 2500;

/** Señales típicas de log cuando el dedicated ya acepta jugadores. */
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
 * Gestiona el ciclo de vida de procesos de servidor ASA en Windows.
 * Emite "status" con ServerRuntimeInfo en cada transición.
 *
 * `running` solo se asigna cuando el servidor responde por RCON (o hay
 * señal clara de log de startup completo), no al crear el proceso OS.
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
      throw new Error(`El servidor "${profile.name}" ya está en ejecución`);
    }
    const binary = serverBinaryPath(profile.installDir);
    if (!existsSync(binary)) {
      throw new Error(
        `No se encontró el ejecutable del servidor en: ${binary}`,
      );
    }

    const args = options?.launchArgsOverride ?? buildLaunchArgs(profile);
    const nativeConsole = options?.openNativeConsole === true;
    const child = nativeConsole
      ? spawnWithNativeConsole(
          binary,
          args,
          profile.installDir,
          `ARK-${profile.id.slice(0, 8)}`,
        )
      : spawn(binary, args, {
          cwd: profile.installDir,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          detached: false,
        });

    this.appendRuntimeLog(profile.id, "system", `Iniciando proceso ${binary}`);
    if (nativeConsole) {
      this.appendRuntimeLog(
        profile.id,
        "system",
        "Consola nativa del servidor abierta (salida en vivo en esa ventana)",
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
      nativeConsole,
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
        "Proceso creado; esperando que el servidor quede listo (RCON / startup)",
      );
      this.emitStatus(profile.id);

      if (options?.skipReadinessCheck === true) {
        managed.status = "running";
        this.appendRuntimeLog(
          profile.id,
          "system",
          "Readiness omitido (skipReadinessCheck); estado running",
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
      this.appendRuntimeLog(profile.id, "error", `Error de proceso: ${err.message}`);
      this.emitStatus(profile.id);
    });

    child.once("exit", (code) => {
      const wasStopping = managed.status === "stopping";
      const wasStarting = managed.status === "starting";
      managed.readinessGeneration += 1;
      this.appendRuntimeLog(
        profile.id,
        "system",
        `Proceso finalizado con código ${code ?? "desconocido"}`,
      );
      if (wasStopping || code === 0) {
        this.processes.delete(profile.id);
        this.emitStatus(profile.id);
        return;
      }
      managed.status = "error";
      managed.lastError = wasStarting
        ? `El proceso terminó durante el arranque (código ${code ?? "desconocido"})`
        : `El proceso terminó inesperadamente (código ${code ?? "desconocido"})`;
      this.emitStatus(profile.id);
    });
  }

  /**
   * Parada segura: saveworld por RCON, espera, DoExit y fallback a kill.
   */
  async stop(profile: ServerProfile): Promise<void> {
    const managed = this.processes.get(profile.id);
    if (managed === undefined) return;
    managed.readinessGeneration += 1;
    managed.status = "stopping";
    this.appendRuntimeLog(profile.id, "system", "Intentando parada segura por RCON");
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
      // RCON no disponible: se recurre a terminación del proceso.
      this.appendRuntimeLog(profile.id, "warning", "RCON no disponible; aplicando kill");
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

  /** Terminación inmediata sin guardado (último recurso). */
  kill(serverId: string): void {
    const managed = this.processes.get(serverId);
    if (managed === undefined) return;
    managed.readinessGeneration += 1;
    managed.status = "stopping";
    this.appendRuntimeLog(serverId, "warning", "Forzando cierre del proceso");
    this.emitStatus(serverId);
    this.terminateManaged(managed);
    this.processes.delete(serverId);
    this.emitStatus(serverId);
  }

  /** Detiene todos los procesos activos (cierre de la app). */
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
          "Señal de startup detectada en logs; verificando RCON…",
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
          "Servidor listo: RCON respondió (en espera de conexiones)",
        );
        this.emitStatus(profile.id);
        return;
      } catch {
        // seguir intentando hasta timeout o salida del proceso
      }

      await delay(pollMs);
    }

    if (!this.isSameStartingGeneration(profile.id, managed, generation)) {
      return;
    }

    managed.status = "error";
    managed.lastError =
      "Timeout esperando que el servidor quede listo (RCON no respondió a tiempo)";
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
    if (
      managed.nativeConsole &&
      process.platform === "win32" &&
      pid !== undefined &&
      killWinProcessTree(pid)
    ) {
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
