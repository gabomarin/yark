import { spawn, type ChildProcess } from "node:child_process";
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
}

const RCON_HOST = "127.0.0.1";
const SAVE_WAIT_MS = 8000;
const EXIT_WAIT_MS = 30000;
const MAX_RUNTIME_LOG_LINES = 1200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gestiona el ciclo de vida de procesos de servidor ASA en Windows.
 * Emite "status" con ServerRuntimeInfo en cada transición.
 */
export class ProcessManager extends EventEmitter {
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly runtimeLogs = new Map<string, string[]>();

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
    const child = spawn(binary, args, {
      cwd: profile.installDir,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    this.appendRuntimeLog(profile.id, "system", `Iniciando proceso ${binary}`);
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
    };
    this.processes.set(profile.id, managed);
    this.emitStatus(profile.id);

    child.once("spawn", () => {
      if (managed.status === "starting") {
        managed.status = "running";
        this.appendRuntimeLog(profile.id, "system", "Proceso en estado running");
        this.emitStatus(profile.id);
      }
    });

    child.once("error", (err) => {
      managed.status = "error";
      managed.lastError = err.message;
      this.appendRuntimeLog(profile.id, "error", `Error de proceso: ${err.message}`);
      this.emitStatus(profile.id);
    });

    child.once("exit", (code) => {
      const wasStopping = managed.status === "stopping";
      this.appendRuntimeLog(
        profile.id,
        "system",
        `Proceso finalizado con código ${code ?? "desconocido"}`,
      );
      if (wasStopping || code === 0) {
        this.processes.delete(profile.id);
        this.emitStatus(profile.id);
      } else {
        managed.status = "error";
        managed.lastError = `El proceso terminó inesperadamente (código ${code ?? "desconocido"})`;
        this.emitStatus(profile.id);
      }
    });

  }

  /**
   * Parada segura: saveworld por RCON, espera, DoExit y fallback a kill.
   */
  async stop(profile: ServerProfile): Promise<void> {
    const managed = this.processes.get(profile.id);
    if (managed === undefined) return;
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
      managed.child.kill();
    }

    const exited = await this.waitForExit(managed.child, EXIT_WAIT_MS);
    if (!exited) {
      managed.child.kill();
      await this.waitForExit(managed.child, 5000);
    }
    this.processes.delete(profile.id);
    this.emitStatus(profile.id);
  }

  /** Terminación inmediata sin guardado (último recurso). */
  kill(serverId: string): void {
    const managed = this.processes.get(serverId);
    if (managed === undefined) return;
    managed.status = "stopping";
    this.appendRuntimeLog(serverId, "warning", "Forzando cierre del proceso");
    this.emitStatus(serverId);
    managed.child.kill();
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
