import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import type { ServerProfile, ServerRuntimeInfo, ServerStatus } from "@shared/types";
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
/** Tiempo tras el spawn para considerar el proceso "running" si sigue vivo. */
const STARTUP_GRACE_MS = 15000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gestiona el ciclo de vida de procesos de servidor ASA en Windows.
 * Emite "status" con ServerRuntimeInfo en cada transición.
 */
export class ProcessManager extends EventEmitter {
  private readonly processes = new Map<string, ManagedProcess>();

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

  start(profile: ServerProfile): void {
    if (this.isActive(profile.id)) {
      throw new Error(`El servidor "${profile.name}" ya está en ejecución`);
    }
    const binary = serverBinaryPath(profile.installDir);
    if (!existsSync(binary)) {
      throw new Error(
        `No se encontró el ejecutable del servidor en: ${binary}`,
      );
    }

    const args = buildLaunchArgs(profile);
    const child = spawn(binary, args, {
      cwd: profile.installDir,
      windowsHide: true,
      stdio: "ignore",
      detached: false,
    });

    const managed: ManagedProcess = {
      child,
      status: "starting",
      startedAt: new Date().toISOString(),
      lastError: null,
    };
    this.processes.set(profile.id, managed);
    this.emitStatus(profile.id);

    child.once("error", (err) => {
      managed.status = "error";
      managed.lastError = err.message;
      this.emitStatus(profile.id);
    });

    child.once("exit", (code) => {
      const wasStopping = managed.status === "stopping";
      if (wasStopping || code === 0) {
        this.processes.delete(profile.id);
        this.emitStatus(profile.id);
      } else {
        managed.status = "error";
        managed.lastError = `El proceso terminó inesperadamente (código ${code ?? "desconocido"})`;
        this.emitStatus(profile.id);
      }
    });

    // Tras un periodo de gracia, si el proceso sigue vivo se considera activo.
    setTimeout(() => {
      if (managed.status === "starting" && child.exitCode === null) {
        managed.status = "running";
        this.emitStatus(profile.id);
      }
    }, STARTUP_GRACE_MS);
  }

  /**
   * Parada segura: saveworld por RCON, espera, DoExit y fallback a kill.
   */
  async stop(profile: ServerProfile): Promise<void> {
    const managed = this.processes.get(profile.id);
    if (managed === undefined) return;
    managed.status = "stopping";
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
}
