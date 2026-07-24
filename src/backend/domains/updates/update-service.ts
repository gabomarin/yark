import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { SteamCmdConsoleSnapshot, SteamCmdStatus } from "../../../shared/types";
import { parseSteamCmdProgressLine } from "../../../shared/steamcmd-progress";
import type { BackupService } from "../backups/backup-service";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceService } from "../instances/instance-service";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import {
  buildSteamCmdAppUpdateArgs,
  isContentCacheFresh,
  isOperationCancelledError,
  OperationCancelledError,
  resolveAsaContentCacheDir,
  resolveDepotCacheDir,
  resolveSteamCmdHome,
  syncAsaContentCacheToInstallDir,
} from "./steamcmd-content-cache";
import {
  estimateProgressFromDisk,
  measureInstallDownloadingBytes,
  readConsoleLogSince,
  readInstallAppManifestProgress,
  steamCmdConsoleLogPath,
} from "./steamcmd-disk-progress";
import { formatSteamCmdByteProgress } from "../../../shared/steamcmd-progress";
import { ASA_APP_ID } from "./steamcmd-content-cache";

const MAX_STEAMCMD_LINES = 500;
const CRITICAL_JOBS_KEY = "criticalJobsQueue.v1";
const JOB_RETRY_DELAY_MS = 5000;
/** Push a la UI: lo bastante frecuente para ver % en vivo sin saturar Electron. */
const PROGRESS_PUSH_MIN_MS = 100;
/** No spamear la consola con cada tick \r de SteamCMD; sí actualizar la barra. */
const PROGRESS_CONSOLE_LOG_MIN_MS = 1500;
const PROGRESS_CONSOLE_LOG_MIN_DELTA = 2;

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ActiveSteamCmdOperation {
  child: ChildProcess;
  operation: "install-steamcmd" | "install-files" | "update" | "verify-files";
  serverId: string | null;
  startedAt: string;
}

interface CriticalJob {
  id: string;
  type: "install-files" | "update" | "verify-files";
  serverId: string;
  attempts: number;
  maxAttempts: number;
  status: "pending" | "running";
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Flujo seguro de actualización por instancia:
 * pre-backup -> stop -> steamcmd update -> start -> health-check -> rollback.
 */
export class UpdateService extends EventEmitter {
  private readonly steamCmdConsoleLines: string[] = [];
  private steamCmdConsoleUpdatedAt = new Date(0).toISOString();
  private activeSteamCmd: ActiveSteamCmdOperation | null = null;
  private queue: CriticalJob[] = [];
  private processingQueue = false;
  private readonly waiters = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  /** Timestamp de la última actualización exitosa de asa_content_cache en esta sesión. */
  private contentCacheUpdatedAtMs = 0;
  private progressPercent: number | null = null;
  private progressLabel: string | null = null;
  private progressBytesDownloaded: number | null = null;
  private progressBytesTotal: number | null = null;
  private lastProgressLine: string | null = null;
  private syncingServerId: string | null = null;
  private syncingStartedAt: string | null = null;
  private activeSyncChild: ChildProcess | null = null;
  private cancelRequested = false;
  private lastProgressPushAtMs = 0;
  private lastProgressConsoleLogAtMs = 0;
  private lastProgressConsoleLoggedPercent: number | null = null;
  private steamCmdOutputBuffers = new Map<string, string>();
  /** Última vez que stdout de SteamCMD aportó un % real (no estimado). */
  private lastOfficialProgressAtMs = 0;
  private diskProgressTimer: ReturnType<typeof setInterval> | null = null;
  private diskProgressInFlight = false;
  private diskProgressForceInstallDir: string | null = null;
  private diskProgressSteamCmdHome: string | null = null;
  private diskProgressBaselineBytes = 0;
  private consoleLogOffset = 0;
  private lastDiskEstimateConsoleAtMs = 0;

  constructor(
    private readonly servers: ServerRepository,
    private readonly backups: BackupService,
    private readonly instances: InstanceService,
    private readonly processes: ProcessManager,
    private readonly locks: InstanceLockManager,
    private readonly settings: AppSettingsRepository,
    private readonly updatesLogDir: string,
    private readonly steamcmdDir: string,
  ) {
    super();
    this.queue = this.loadQueue();
    if (this.queue.length > 0) {
      this.appendSteamCmdConsole(`Reanudando ${this.queue.length} job(s) críticos pendientes`);
      setTimeout(() => {
        void this.processQueue();
      }, 250);
    }
  }

  async installSteamCmd(): Promise<string> {
    this.appendSteamCmdConsole("Iniciando verificación/instalación de SteamCMD...");
    const existing = this.findSteamCmdExecutable();
    if (existing !== null) {
      this.appendSteamCmdConsole(`SteamCMD detectado en: ${existing}`);
      await this.verifySteamCmdExecutable(existing);
      this.persistSteamCmdPath(existing);
      this.appendSteamCmdConsole("SteamCMD validado correctamente.");
      return existing;
    }

    await mkdir(this.steamcmdDir, { recursive: true });
    const zipPath = join(this.steamcmdDir, "steamcmd.zip");
    const extractDir = join(this.steamcmdDir, "_extract");
    const exePath = join(this.steamcmdDir, "steamcmd.exe");

    const command = [
      "$ErrorActionPreference='Stop'",
      `$target='${this.steamcmdDir.replace(/'/g, "''")}'`,
      `$zip='${zipPath.replace(/'/g, "''")}'`,
      `$extract='${extractDir.replace(/'/g, "''")}'`,
      "$url='https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip'",
      "if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }",
      "if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }",
      "Invoke-WebRequest -Uri $url -OutFile $zip",
      "Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force",
      "$candidateExe = Join-Path $target 'steamcmd.exe'",
      "if (Test-Path -LiteralPath $candidateExe) {",
      "  $backupExe = Join-Path $target 'steamcmd.exe.bak'",
      "  if (Test-Path -LiteralPath $backupExe) { Remove-Item -LiteralPath $backupExe -Force -ErrorAction SilentlyContinue }",
      "  try { Rename-Item -LiteralPath $candidateExe -NewName 'steamcmd.exe.bak' -Force -ErrorAction Stop } catch {}",
      "}",
      "Copy-Item -Path (Join-Path $extract '*') -Destination $target -Recurse -Force",
      "if (Test-Path -LiteralPath $extract) { Remove-Item -LiteralPath $extract -Recurse -Force }",
      "if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }",
      "$backupExe = Join-Path $target 'steamcmd.exe.bak'",
      "if (Test-Path -LiteralPath $backupExe) { Remove-Item -LiteralPath $backupExe -Force -ErrorAction SilentlyContinue }",
    ].join("; ");

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        {
          windowsHide: true,
          shell: false,
        },
      );
      this.beginSteamCmdProcess(child, "install-steamcmd", null);

      let stderr = "";
      child.stderr.on("data", (chunk) => {
        const text = String(chunk);
        stderr += text;
        this.captureSteamCmdOutput(text, "install/stderr");
      });
      child.stdout.on("data", (chunk) => {
        this.captureSteamCmdOutput(String(chunk), "install/stdout");
      });

      child.once("error", (error) => {
        this.endSteamCmdProcess(child);
        reject(new Error(`No se pudo ejecutar PowerShell: ${error.message}`));
      });

      child.once("exit", (code) => {
        this.endSteamCmdProcess(child);
        if ((code ?? 1) !== 0) {
          reject(new Error(`Falló instalación de SteamCMD (exit ${code ?? 1}): ${stderr}`));
          return;
        }
        resolve();
      });
    });

    if (!existsSync(exePath)) {
      throw new Error(`SteamCMD no quedó instalado en ${exePath}`);
    }

    await this.verifySteamCmdExecutable(exePath);
    this.persistSteamCmdPath(exePath);
    this.appendSteamCmdConsole(`SteamCMD instalado y validado en: ${exePath}`);
    return exePath;
  }

  getSteamCmdStatus(): SteamCmdStatus {
    const executablePath = this.findSteamCmdExecutable();
    const active = this.activeSteamCmd;
    const queuedPending = this.queue.filter((job) => job.status === "pending");
    const queued = this.queue.find(
      (job) => job.status === "pending" || job.status === "running",
    );
    const steamCmdHome =
      executablePath !== null
        ? resolveSteamCmdHome(executablePath)
        : resolveSteamCmdHome(join(this.steamcmdDir, "steamcmd.exe"));
    const busy =
      active !== null || this.syncingServerId !== null || queued !== undefined;
    const operation: SteamCmdStatus["operation"] =
      this.syncingServerId !== null
        ? "sync-files"
        : (active?.operation ?? queued?.type ?? null);
    const serverId =
      this.syncingServerId
      ?? active?.serverId
      ?? queued?.serverId
      ?? null;

    return {
      detected: executablePath !== null,
      executablePath,
      depotCacheDir: resolveDepotCacheDir(steamCmdHome),
      contentCacheDir: resolveAsaContentCacheDir(steamCmdHome),
      busy,
      running: active !== null || this.syncingServerId !== null,
      operation,
      serverId,
      startedAt: this.syncingStartedAt ?? active?.startedAt ?? queued?.updatedAt ?? null,
      pid: active?.child.pid ?? null,
      progressPercent: this.progressPercent,
      progressLabel: this.progressLabel,
      progressBytesDownloaded: this.progressBytesDownloaded,
      progressBytesTotal: this.progressBytesTotal,
      lastLine: this.lastProgressLine,
      queuedCount: queuedPending.length,
      checkedAt: new Date().toISOString(),
    };
  }

  cancelSteamCmd(): boolean {
    const hadWork =
      this.activeSteamCmd !== null
      || this.activeSyncChild !== null
      || this.syncingServerId !== null
      || this.queue.length > 0;

    if (!hadWork) {
      this.appendSteamCmdConsole("Cancelar: no hay operación activa");
      this.emitProgress(true);
      return false;
    }

    this.cancelRequested = true;
    this.stopDiskProgressMonitor();
    this.appendSteamCmdConsole(
      `Cancelando operación (steamcmd=${this.activeSteamCmd?.child.pid ?? "n/a"}, sync=${this.activeSyncChild?.pid ?? "n/a"}, jobs=${this.queue.length})`,
    );
    this.setProgress(null, "Cancelando…", "Cancelación solicitada por el usuario");

    if (this.activeSteamCmd !== null) {
      const child = this.activeSteamCmd.child;
      this.activeSteamCmd = null;
      this.killProcessTree(child);
    }
    if (this.activeSyncChild !== null) {
      const child = this.activeSyncChild;
      this.activeSyncChild = null;
      this.killProcessTree(child);
    }

    const jobs = [...this.queue];
    this.queue = [];
    this.persistQueue();
    for (const job of jobs) {
      this.servers.addEvent(
        job.serverId,
        "update_failed",
        "warning",
        `Operación ${job.type} cancelada por el usuario`,
      );
      this.rejectJob(job.id, new OperationCancelledError());
    }

    this.syncingServerId = null;
    this.syncingStartedAt = null;
    this.setProgress(null, "Cancelado", "Operación cancelada por el usuario");
    this.emitProgress(true);
    return true;
  }

  async setSteamCmdExecutablePath(exePath: string): Promise<string> {
    const normalized = exePath.trim();
    if (normalized.length === 0) {
      throw new Error("Ruta de SteamCMD vacía");
    }
    if (!existsSync(normalized)) {
      throw new Error(`No existe steamcmd.exe en: ${normalized}`);
    }
    await this.verifySteamCmdExecutable(normalized);
    this.persistSteamCmdPath(normalized);
    this.contentCacheUpdatedAtMs = 0;
    this.appendSteamCmdConsole(`Ruta manual de SteamCMD configurada: ${normalized}`);
    return normalized;
  }

  getSteamCmdConsole(limit = 200): SteamCmdConsoleSnapshot {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 200;
    return {
      lines: this.steamCmdConsoleLines.slice(-safeLimit),
      updatedAt: this.steamCmdConsoleUpdatedAt,
    };
  }

  async installServerFiles(serverId: string): Promise<void> {
    await this.enqueueAndWait("install-files", serverId);
  }

  async updateServer(serverId: string): Promise<void> {
    this.assertServerStoppedForFilesJob(serverId, "actualizar");
    await this.enqueueAndWait("update", serverId);
  }

  /** Fuerza app_update validate (ignora caché “fresca”) y sincroniza al servidor. */
  async verifyServerFiles(serverId: string): Promise<void> {
    this.assertServerStoppedForFilesJob(serverId, "verificar");
    await this.enqueueAndWait("verify-files", serverId);
  }

  private assertServerStoppedForFilesJob(serverId: string, action: string): void {
    if (this.processes.isActive(serverId)) {
      throw new Error(`Detén el servidor antes de ${action}`);
    }
  }

  private async performInstallServerFiles(serverId: string): Promise<void> {
    await this.locks.withLock(serverId, "install-files", async () => {
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("El servidor no existe");
      }

      await mkdir(server.installDir, { recursive: true });
      this.servers.addEvent(
        serverId,
        "update_started",
        "info",
        `Instalando archivos base por SteamCMD en "${server.name}"`,
      );

      const cmd = await this.runSteamUpdate(server.installDir, "install-files", serverId);
      if (cmd.code !== 0) {
        this.servers.addEvent(
          serverId,
          "update_failed",
          "error",
          `Falló instalación base (exit ${cmd.code})`,
        );
        throw new Error(`SteamCMD finalizó con código ${cmd.code}`);
      }

      this.servers.addEvent(
        serverId,
        "update_completed",
        "info",
        `Archivos base instalados para "${server.name}"`,
      );
    });
  }

  private async performUpdateServer(serverId: string): Promise<void> {
    await this.locks.withLock(serverId, "update", async () => {
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("El servidor no existe");
      }

      const wasRunning = this.processes.isActive(serverId);
      const startedAt = new Date();
      this.servers.addEvent(
        serverId,
        "update_started",
        "info",
        `Inicio de update seguro para \"${server.name}\"`,
      );

      const preUpdateBackup = await this.backups.createPreUpdateBackupForJob(serverId);

      if (wasRunning) {
        await this.instances.stop(serverId);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await mkdir(this.updatesLogDir, { recursive: true });
      const logPath = join(this.updatesLogDir, `${serverId}-${timestamp}.log`);

      try {
        const cmd = await this.runSteamUpdate(server.installDir, "update", serverId);
        const durationMs = Date.now() - startedAt.getTime();
        await writeFile(
          logPath,
          [
            `time=${new Date().toISOString()}`,
            `server=${server.name}`,
            `installDir=${server.installDir}`,
            `exitCode=${cmd.code}`,
            `startedAt=${startedAt.toISOString()}`,
            `durationMs=${durationMs}`,
            "--- stdout ---",
            cmd.stdout,
            "--- stderr ---",
            cmd.stderr,
          ].join("\n"),
          "utf8",
        );

        if (cmd.code !== 0) {
          throw new Error(
            `SteamCMD finalizó con código ${cmd.code}. Revisa log: ${logPath}`,
          );
        }

        await this.instances.start(serverId);
        const healthy = await this.waitForHealthy(serverId, 90_000);
        if (!healthy) {
          throw new Error("El servidor no alcanzó estado running tras update");
        }

        this.servers.addEvent(
          serverId,
          "update_completed",
          "info",
          `Update completado en \"${server.name}\"`,
        );
      } catch (err) {
        this.servers.addEvent(
          serverId,
          "update_failed",
          "error",
          `Fallo update en \"${server.name}\": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );

        if (this.processes.isActive(serverId)) {
          await this.instances.stop(serverId);
        }

        await this.backups.restoreBackupForJob(serverId, preUpdateBackup.id);
        await this.instances.start(serverId);
        const rollbackHealthy = await this.waitForHealthy(serverId, 90_000);
        if (!rollbackHealthy) {
          throw new Error(
            "Rollback ejecutado pero el servidor no logró quedar en running",
          );
        }

        this.servers.addEvent(
          serverId,
          "update_rolled_back",
          "warning",
          `Update revertido automáticamente usando backup ${preUpdateBackup.id}`,
        );
      }
    });
  }

  private async performVerifyServerFiles(serverId: string): Promise<void> {
    await this.locks.withLock(serverId, "verify-files", async () => {
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("El servidor no existe");
      }

      const wasRunning = this.processes.isActive(serverId);
      this.servers.addEvent(
        serverId,
        "update_started",
        "info",
        `Verificando integridad de archivos (SteamCMD validate) en "${server.name}"`,
      );

      if (wasRunning) {
        this.appendSteamCmdConsole(
          `Deteniendo "${server.name}" antes de verificar integridad…`,
        );
        await this.instances.stop(serverId);
      }

      try {
        await mkdir(server.installDir, { recursive: true });
        const cmd = await this.runSteamUpdate(server.installDir, "verify-files", serverId);
        if (cmd.code !== 0) {
          this.servers.addEvent(
            serverId,
            "update_failed",
            "error",
            `Falló verificación de integridad (exit ${cmd.code})`,
          );
          throw new Error(`SteamCMD validate finalizó con código ${cmd.code}`);
        }

        this.servers.addEvent(
          serverId,
          "update_completed",
          "info",
          `Integridad verificada para "${server.name}"`,
        );

        if (wasRunning) {
          await this.instances.start(serverId);
          const healthy = await this.waitForHealthy(serverId, 90_000);
          if (!healthy) {
            throw new Error(
              "Verificación OK pero el servidor no volvió a running",
            );
          }
        }
      } catch (error) {
        if (wasRunning && !this.processes.isActive(serverId)) {
          try {
            await this.instances.start(serverId);
          } catch {
            // El error original es más relevante.
          }
        }
        throw error;
      }
    });
  }

  private async enqueueAndWait(
    type: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<void> {
    const existingPending = this.queue.find(
      (job) => job.serverId === serverId && job.type === type,
    );
    if (existingPending !== undefined) {
      await new Promise<void>((resolve, reject) => {
        this.waiters.set(existingPending.id, { resolve, reject });
      });
      return;
    }

    const now = new Date().toISOString();
    const job: CriticalJob = {
      id: randomUUID(),
      type,
      serverId,
      attempts: 0,
      maxAttempts: 3,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      lastError: null,
    };

    this.queue.push(job);
    this.persistQueue();
    this.progressLabel =
      type === "install-files"
        ? "En cola: instalar archivos…"
        : type === "verify-files"
          ? "En cola: verificar integridad…"
          : "En cola: actualizar…";
    this.lastProgressLine = `Job encolado: ${type}`;
    this.emitProgress(true);
    this.servers.addEvent(
      serverId,
      "update_started",
      "info",
      `Job encolado: ${type} (${job.id.slice(0, 8)})`,
    );

    const completion = new Promise<void>((resolve, reject) => {
      this.waiters.set(job.id, { resolve, reject });
    });
    void this.processQueue();
    await completion;
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }
    this.processingQueue = true;

    try {
      for (;;) {
        const job = this.queue.find((candidate) => candidate.status === "pending");
        if (job === undefined) {
          break;
        }

        job.status = "running";
        job.updatedAt = new Date().toISOString();
        this.cancelRequested = false;
        this.persistQueue();
        this.emitProgress(true);

        try {
          if (job.type === "install-files") {
            await this.performInstallServerFiles(job.serverId);
          } else if (job.type === "verify-files") {
            await this.performVerifyServerFiles(job.serverId);
          } else {
            await this.performUpdateServer(job.serverId);
          }
          this.resolveJob(job.id);
          this.removeJob(job.id);
          this.persistQueue();
          if (this.queue.length === 0 && this.activeSteamCmd === null && this.syncingServerId === null) {
            this.setProgress(100, "Completado", "Operación finalizada");
            this.emitProgress(true);
          }
        } catch (error) {
          if (this.cancelRequested || isOperationCancelledError(error)) {
            this.appendSteamCmdConsole(
              `Job ${job.type} detenido tras cancelación`,
            );
            this.rejectJob(
              job.id,
              isOperationCancelledError(error)
                ? (error as Error)
                : new OperationCancelledError(),
            );
            this.removeJob(job.id);
            this.persistQueue();
            this.cancelRequested = false;
            this.endFileSync();
            this.setProgress(null, "Cancelado", "Operación cancelada por el usuario");
            this.emitProgress(true);
            break;
          }

          job.attempts += 1;
          job.lastError = error instanceof Error ? error.message : String(error);
          job.updatedAt = new Date().toISOString();

          if (job.attempts >= job.maxAttempts) {
            this.rejectJob(job.id, new Error(job.lastError));
            this.servers.addEvent(
              job.serverId,
              "update_failed",
              "error",
              `Job ${job.type} agotó reintentos (${job.maxAttempts}): ${job.lastError}`,
            );
            this.removeJob(job.id);
            this.persistQueue();
            continue;
          }

          job.status = "pending";
          this.persistQueue();
          this.servers.addEvent(
            job.serverId,
            "update_failed",
            "warning",
            `Job ${job.type} reintentará (${job.attempts}/${job.maxAttempts})`,
          );
          await delay(JOB_RETRY_DELAY_MS);
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private async runSteamUpdate(
    installDir: string,
    operation: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<CommandResult> {
    this.assertNotCancelled();
    const steamcmdExe = this.resolveSteamCmdExecutable();
    const steamCmdHome = resolveSteamCmdHome(steamcmdExe);
    const depotCacheDir = resolveDepotCacheDir(steamCmdHome);
    const contentCacheDir = resolveAsaContentCacheDir(steamCmdHome);

    await mkdir(contentCacheDir, { recursive: true });
    await mkdir(depotCacheDir, { recursive: true });

    this.appendSteamCmdConsole(
      `Caché SteamCMD: depot=${depotCacheDir} | contenido ASA=${contentCacheDir}`,
    );

    const cacheResult = await this.ensureAsaContentCache(
      steamcmdExe,
      steamCmdHome,
      contentCacheDir,
      operation,
      serverId,
    );
    this.assertNotCancelled();
    if (cacheResult.code !== 0) {
      return cacheResult;
    }

    this.appendSteamCmdConsole(
      `Sincronizando caché ASA → ${installDir} (preserva ShooterGame\\Saved)`,
    );
    const syncLabel =
      operation === "verify-files"
        ? "Aplicando archivos verificados…"
        : operation === "install-files"
          ? "Instalando archivos…"
          : "Actualizando archivos…";
    this.beginFileSync(serverId, syncLabel);
    try {
      const robocopyCode = await syncAsaContentCacheToInstallDir(contentCacheDir, installDir, {
        onSpawn: (child) => {
          this.activeSyncChild = child;
        },
        isCancelled: () => this.cancelRequested,
      });
      this.activeSyncChild = null;
      this.appendSteamCmdConsole(
        `Sincronización de caché ASA completada (robocopy=${robocopyCode})`,
      );
      this.setProgress(
        100,
        operation === "verify-files" ? "Integridad OK" : "Archivos sincronizados",
        operation === "verify-files" ? "Verificación completada" : "Sincronización completada",
      );
    } catch (error) {
      this.activeSyncChild = null;
      this.endFileSync();
      if (isOperationCancelledError(error) || this.cancelRequested) {
        throw isOperationCancelledError(error) ? error : new OperationCancelledError();
      }
      const message = error instanceof Error ? error.message : String(error);
      this.appendSteamCmdConsole(`Falló sync de caché; instalando directo en el servidor: ${message}`);
      return await this.invokeSteamCmdAppUpdate(
        steamcmdExe,
        steamCmdHome,
        installDir,
        operation,
        serverId,
      );
    }
    this.endFileSync();

    return { code: 0, stdout: cacheResult.stdout, stderr: cacheResult.stderr };
  }

  private async ensureAsaContentCache(
    steamcmdExe: string,
    steamCmdHome: string,
    contentCacheDir: string,
    operation: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<CommandResult> {
    // verify-files siempre fuerza validate; no reutilizar “caché fresca”.
    if (
      operation !== "verify-files"
      && isContentCacheFresh(contentCacheDir, this.contentCacheUpdatedAtMs)
    ) {
      const ageSec = Math.round((Date.now() - this.contentCacheUpdatedAtMs) / 1000);
      this.appendSteamCmdConsole(
        `Reutilizando caché de contenido ASA (actualizada hace ${ageSec}s; sin re-descarga)`,
      );
      return { code: 0, stdout: "", stderr: "" };
    }

    this.appendSteamCmdConsole(
      operation === "verify-files"
        ? `Verificando integridad de caché ASA vía SteamCMD validate (depotcache en ${steamCmdHome})`
        : `Actualizando caché compartida ASA vía SteamCMD (reutiliza depotcache en ${steamCmdHome})`,
    );
    const result = await this.invokeSteamCmdAppUpdate(
      steamcmdExe,
      steamCmdHome,
      contentCacheDir,
      operation,
      serverId,
    );
    if (result.code === 0) {
      this.contentCacheUpdatedAtMs = Date.now();
    } else {
      this.contentCacheUpdatedAtMs = 0;
    }
    return result;
  }

  private async invokeSteamCmdAppUpdate(
    steamcmdExe: string,
    steamCmdHome: string,
    forceInstallDir: string,
    operation: "install-files" | "update" | "verify-files",
    serverId: string,
  ): Promise<CommandResult> {
    const args = buildSteamCmdAppUpdateArgs(forceInstallDir);

    this.appendSteamCmdConsole(
      `[invoke] op=${operation} server=${serverId} cwd=${steamCmdHome} cmd=${steamcmdExe} args=${args.join(" ")}`,
    );
    this.appendSteamCmdConsole(
      "Progreso en vivo: se lee logs/console_log.txt + appmanifest/downloading de esta instalación (stdout de SteamCMD suele ir bufferizado).",
    );

    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(steamcmdExe, args, {
        cwd: steamCmdHome,
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          // Intento best-effort; builds recientes pueden ignorarlo.
          STEAMCMD_OUTPUT_BUFFERS: "0",
        },
      });
      this.beginSteamCmdProcess(child, operation, serverId);
      this.startDiskProgressMonitor(steamCmdHome, forceInstallDir);

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        const text = String(chunk);
        stdout += text;
        this.captureSteamCmdOutput(text, "update/stdout");
      });
      child.stderr.on("data", (chunk) => {
        const text = String(chunk);
        stderr += text;
        this.captureSteamCmdOutput(text, "update/stderr");
      });

      child.once("error", (error) => {
        this.stopDiskProgressMonitor();
        this.endSteamCmdProcess(child);
        reject(
          new Error(
            `No se pudo ejecutar SteamCMD (${steamcmdExe}). Instálalo o configúralo. Detalle: ${error.message}`,
          ),
        );
      });

      child.once("exit", (code) => {
        this.stopDiskProgressMonitor();
        this.endSteamCmdProcess(child);
        if (this.cancelRequested) {
          reject(new OperationCancelledError());
          return;
        }
        resolve({
          code: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
  }

  /**
   * Progreso sin depender del pipe stdout:
   * - tail de logs/console_log.txt (tiempo casi real)
   * - appmanifest BytesDownloaded de ESTA instalación
   * - tamaño de steamapps/downloading bajo force_install_dir
   */
  private startDiskProgressMonitor(steamCmdHome: string, forceInstallDir: string): void {
    this.stopDiskProgressMonitor();
    this.diskProgressForceInstallDir = forceInstallDir;
    this.diskProgressSteamCmdHome = steamCmdHome;
    this.lastOfficialProgressAtMs = 0;
    this.lastDiskEstimateConsoleAtMs = 0;

    const logPath = steamCmdConsoleLogPath(steamCmdHome);
    if (existsSync(logPath)) {
      try {
        this.consoleLogOffset = statSync(logPath).size;
      } catch {
        this.consoleLogOffset = 0;
      }
    } else {
      this.consoleLogOffset = 0;
    }

    void measureInstallDownloadingBytes(forceInstallDir).then((baseline) => {
      if (this.diskProgressForceInstallDir !== forceInstallDir) {
        return;
      }
      this.diskProgressBaselineBytes = baseline;
    });

    this.appendSteamCmdConsole(`Siguiendo log en vivo: ${logPath}`);

    this.diskProgressTimer = setInterval(() => {
      void this.tickDiskProgressEstimate();
    }, 400);
  }

  private stopDiskProgressMonitor(): void {
    if (this.diskProgressTimer !== null) {
      clearInterval(this.diskProgressTimer);
      this.diskProgressTimer = null;
    }
    this.diskProgressForceInstallDir = null;
    this.diskProgressSteamCmdHome = null;
    this.diskProgressInFlight = false;
  }

  private async tickDiskProgressEstimate(): Promise<void> {
    const installDir = this.diskProgressForceInstallDir;
    const steamCmdHome = this.diskProgressSteamCmdHome;
    if (installDir === null || steamCmdHome === null || this.diskProgressInFlight || this.cancelRequested) {
      return;
    }

    this.diskProgressInFlight = true;
    try {
      // 1) Consola en vivo desde console_log.txt (prioridad para %/MB)
      const logChunk = await readConsoleLogSince(steamCmdHome, this.consoleLogOffset);
      this.consoleLogOffset = logChunk.nextOffset;
      if (logChunk.text.length > 0) {
        this.captureSteamCmdOutput(logChunk.text, "console_log");
      }

      // Si console_log/stdout ya aportó progreso reciente, NO pisar con appmanifest (suele ir atrasado).
      if (
        this.lastOfficialProgressAtMs > 0
        && Date.now() - this.lastOfficialProgressAtMs < 5_000
      ) {
        return;
      }

      // 2) Fallback: appmanifest de ESTA instalación
      const manifest = await readInstallAppManifestProgress(installDir, ASA_APP_ID);
      if (
        manifest !== null
        && manifest.bytesDownloaded !== null
        && manifest.bytesToDownload !== null
        && manifest.bytesToDownload > 0
      ) {
        this.progressBytesDownloaded = manifest.bytesDownloaded;
        this.progressBytesTotal = manifest.bytesToDownload;
        if (manifest.percent !== null) {
          this.progressPercent = manifest.percent;
        }
        this.progressLabel = `Descargando · ${formatSteamCmdByteProgress(
          manifest.bytesDownloaded,
          manifest.bytesToDownload,
        )}`;
        this.lastProgressLine = this.progressLabel;
        this.emitProgress(true);
        return;
      }

      // 3) Fallback: tamaño de downloading/temp solo bajo force_install_dir
      const bytesOnDisk = await measureInstallDownloadingBytes(installDir);
      if (this.diskProgressForceInstallDir !== installDir || this.cancelRequested) {
        return;
      }
      const estimate = estimateProgressFromDisk(
        bytesOnDisk,
        this.progressBytesTotal,
        this.diskProgressBaselineBytes,
      );
      if (estimate.downloaded < 1_000_000 && estimate.deltaBytes < 1_000_000) {
        return;
      }

      this.progressPercent = estimate.percent;
      this.progressBytesDownloaded = estimate.downloaded;
      this.progressBytesTotal = estimate.total;
      this.progressLabel = `Descargando (estimado) · ${formatSteamCmdByteProgress(
        estimate.downloaded,
        estimate.total,
      )}`;
      this.lastProgressLine = this.progressLabel;
      this.emitProgress(true);

      const now = Date.now();
      if (now - this.lastDiskEstimateConsoleAtMs >= 5000) {
        this.lastDiskEstimateConsoleAtMs = now;
        this.steamCmdConsoleLines.push(
          `[${new Date().toISOString()}] [estimado/downloading] ${estimate.percent.toFixed(1)}% — ${formatSteamCmdByteProgress(estimate.downloaded, estimate.total)}`,
        );
        if (this.steamCmdConsoleLines.length > MAX_STEAMCMD_LINES) {
          this.steamCmdConsoleLines.splice(
            0,
            this.steamCmdConsoleLines.length - MAX_STEAMCMD_LINES,
          );
        }
        this.steamCmdConsoleUpdatedAt = new Date().toISOString();
        this.emitProgress(true);
      }
    } finally {
      this.diskProgressInFlight = false;
    }
  }

  private assertNotCancelled(): void {
    if (this.cancelRequested) {
      throw new OperationCancelledError();
    }
  }

  private resolveSteamCmdExecutable(): string {
    const discovered = this.findSteamCmdExecutable();
    if (discovered !== null) {
      this.persistSteamCmdPath(discovered);
      return discovered;
    }

    return "steamcmd.exe";
  }

  private findSteamCmdExecutable(): string | null {
    const configured = this.settings.get("steamcmdPath");
    const envPath = process.env["STEAMCMD_PATH"];
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const programFiles = process.env["ProgramFiles"] ?? "C:\\Program Files";
    const localAppData = process.env["LOCALAPPDATA"];

    const candidates = [
      configured,
      envPath,
      join(this.steamcmdDir, "steamcmd.exe"),
      "C:\\steamcmd\\steamcmd.exe",
      "D:\\steamcmd\\steamcmd.exe",
      join(programFilesX86, "SteamCMD", "steamcmd.exe"),
      join(programFiles, "SteamCMD", "steamcmd.exe"),
      join(programFilesX86, "Steam", "steamcmd.exe"),
      localAppData !== undefined
        ? join(localAppData, "Programs", "steamcmd", "steamcmd.exe")
        : null,
    ];

    for (const candidate of candidates) {
      if (candidate != null && candidate.trim().length > 0 && existsSync(candidate)) {
        return candidate;
      }
    }

    try {
      const raw = execFileSync("where.exe", ["steamcmd.exe"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
        timeout: 2_000,
      });
      const fromPath = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && existsSync(line));
      if (fromPath !== undefined) {
        return fromPath;
      }
    } catch {
      // Best effort: si where.exe no encuentra steamcmd, continúa sin ruta detectada.
    }

    return null;
  }

  private persistSteamCmdPath(exePath: string): void {
    this.settings.set("steamcmdPath", exePath);
    process.env["STEAMCMD_PATH"] = exePath;
    process.env["ARK_STEAMCMD_DIR"] = dirname(exePath);
  }

  private async verifySteamCmdExecutable(exePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.appendSteamCmdConsole(`Validando SteamCMD: ${exePath}`);
      const child = spawn(exePath, ["+quit"], {
        cwd: resolveSteamCmdHome(exePath),
        windowsHide: true,
        shell: false,
      });

      let finished = false;
      let sawOutput = false;
      let stderr = "";
      const timer = setTimeout(() => {
        if (finished) {
          return;
        }
        finished = true;
        child.kill();
        resolve();
      }, 20_000);

      child.stdout.on("data", (chunk) => {
        sawOutput = true;
        this.captureSteamCmdOutput(String(chunk), "verify/stdout");
      });
      child.stderr.on("data", (chunk) => {
        sawOutput = true;
        const text = String(chunk);
        stderr += text;
        this.captureSteamCmdOutput(text, "verify/stderr");
      });

      child.once("error", (error) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        reject(new Error(`SteamCMD existe pero no se puede ejecutar: ${error.message}`));
      });

      child.once("exit", (code) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        if ((code ?? 1) === 0 || sawOutput) {
          resolve();
          return;
        }

        reject(
          new Error(
            `SteamCMD no respondió correctamente (exit ${code ?? 1})${
              stderr.length > 0 ? `: ${stderr}` : ""
            }`,
          ),
        );
      });
    });
  }

  private async waitForHealthy(serverId: string, timeoutMs: number): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const status = this.processes.getStatus(serverId).status;
      if (status === "running") return true;
      if (status === "error" || status === "stopped") return false;
      await delay(1000);
    }
    return false;
  }

  private appendSteamCmdConsole(line: string, options?: { forceProgressPush?: boolean }): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }
    this.steamCmdConsoleLines.push(`[${new Date().toISOString()}] ${trimmed}`);
    if (this.steamCmdConsoleLines.length > MAX_STEAMCMD_LINES) {
      this.steamCmdConsoleLines.splice(0, this.steamCmdConsoleLines.length - MAX_STEAMCMD_LINES);
    }
    this.steamCmdConsoleUpdatedAt = new Date().toISOString();
    this.lastProgressLine = trimmed;
    const percentChanged = this.ingestProgressFromLine(trimmed);
    this.emitProgress(options?.forceProgressPush === true || percentChanged);
  }

  /**
   * SteamCMD escribe el progreso con \\r (misma línea) casi sin \\n.
   * Hay que fragmentar por CR/LF o la UI no ve avance hasta mucho después.
   */
  private captureSteamCmdOutput(chunk: string, source: string): void {
    const previous = this.steamCmdOutputBuffers.get(source) ?? "";
    const combined = previous + String(chunk);
    const parts = combined.split(/\r\n|\n|\r/);
    const remainder = parts.pop() ?? "";
    this.steamCmdOutputBuffers.set(source, remainder);

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length === 0) {
        continue;
      }
      this.handleSteamCmdOutputLine(trimmed, source);
    }
  }

  private handleSteamCmdOutputLine(line: string, source: string): void {
    // Quitar prefijos de fuente y timestamps propios de console_log.txt
    const bare = line
      .replace(/^\[(?:(?:update|verify)\/(?:stdout|stderr)|console_log)\]\s*/i, "")
      .replace(/^\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*/, "")
      .trim();
    const parsed = parseSteamCmdProgressLine(bare);
    const isProgressTick = parsed.percent !== null;

    if (isProgressTick) {
      const now = Date.now();
      const previousPercent = this.progressPercent;
      if (parsed.percent !== null) {
        this.progressPercent = parsed.percent;
      }
      if (parsed.label !== null) {
        this.progressLabel = parsed.label;
      }
      if (parsed.bytesDownloaded !== null) {
        this.progressBytesDownloaded = parsed.bytesDownloaded;
      }
      if (parsed.bytesTotal !== null) {
        this.progressBytesTotal = parsed.bytesTotal;
      }
      this.lastProgressLine = bare;
      this.lastOfficialProgressAtMs = Date.now();

      const percentChanged =
        previousPercent === null
        || parsed.percent === null
        || Math.abs(parsed.percent - previousPercent) >= 0.05;
      this.emitProgress(percentChanged);

      const shouldLogToConsole =
        this.lastProgressConsoleLoggedPercent === null
        || parsed.percent === null
        || Math.abs(parsed.percent - this.lastProgressConsoleLoggedPercent) >= PROGRESS_CONSOLE_LOG_MIN_DELTA
        || now - this.lastProgressConsoleLogAtMs >= PROGRESS_CONSOLE_LOG_MIN_MS;

      if (shouldLogToConsole) {
        this.lastProgressConsoleLogAtMs = now;
        this.lastProgressConsoleLoggedPercent = parsed.percent;
        this.steamCmdConsoleLines.push(`[${new Date().toISOString()}] [${source}] ${bare}`);
        if (this.steamCmdConsoleLines.length > MAX_STEAMCMD_LINES) {
          this.steamCmdConsoleLines.splice(0, this.steamCmdConsoleLines.length - MAX_STEAMCMD_LINES);
        }
        this.steamCmdConsoleUpdatedAt = new Date().toISOString();
        this.emitProgress(true);
      }
      return;
    }

    this.appendSteamCmdConsole(`[${source}] ${line}`, { forceProgressPush: true });
  }

  private ingestProgressFromLine(line: string): boolean {
    const bare = line.replace(/^\[(?:update|verify)\/(?:stdout|stderr)\]\s*/i, "");
    const parsed = parseSteamCmdProgressLine(bare);
    let percentChanged = false;
    if (parsed.percent !== null) {
      percentChanged =
        this.progressPercent === null
        || Math.abs(parsed.percent - this.progressPercent) >= 0.05;
      this.progressPercent = parsed.percent;
    }
    if (parsed.label !== null) {
      this.progressLabel = parsed.label;
    }
    if (parsed.bytesDownloaded !== null) {
      this.progressBytesDownloaded = parsed.bytesDownloaded;
    }
    if (parsed.bytesTotal !== null) {
      this.progressBytesTotal = parsed.bytesTotal;
    }
    if (parsed.percent !== null || parsed.bytesDownloaded !== null) {
      this.lastOfficialProgressAtMs = Date.now();
    }
    return percentChanged;
  }

  private setProgress(percent: number | null, label: string | null, line?: string): void {
    if (percent !== null) {
      this.progressPercent = percent;
    }
    if (label !== null) {
      this.progressLabel = label;
    }
    if (percent === 0 || percent === null) {
      this.progressBytesDownloaded = null;
      this.progressBytesTotal = null;
    }
    if (line !== undefined) {
      this.lastProgressLine = line;
    }
    this.emitProgress(true);
  }

  private beginFileSync(serverId: string, label: string): void {
    this.syncingServerId = serverId;
    this.syncingStartedAt = new Date().toISOString();
    this.setProgress(null, label, label);
  }

  private endFileSync(): void {
    this.syncingServerId = null;
    this.syncingStartedAt = null;
    this.activeSyncChild = null;
    this.emitProgress(true);
  }

  private emitProgress(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastProgressPushAtMs < PROGRESS_PUSH_MIN_MS) {
      return;
    }
    this.lastProgressPushAtMs = now;
    this.emit("progress", {
      status: this.getSteamCmdStatus(),
      console: this.getSteamCmdConsole(160),
    });
  }

  private beginSteamCmdProcess(
    child: ChildProcess,
    operation: "install-steamcmd" | "install-files" | "update" | "verify-files",
    serverId: string | null,
  ): void {
    if (this.activeSteamCmd !== null) {
      throw new Error("Ya hay una operación de SteamCMD en curso");
    }
    this.steamCmdOutputBuffers.clear();
    this.lastProgressConsoleLogAtMs = 0;
    this.lastProgressConsoleLoggedPercent = null;
    if (operation === "install-files") {
      this.setProgress(0, "Descargando archivos del servidor…", "Iniciando SteamCMD");
    } else if (operation === "update") {
      this.setProgress(0, "Actualizando archivos del servidor…", "Iniciando SteamCMD");
    } else if (operation === "verify-files") {
      this.setProgress(0, "Verificando integridad…", "Iniciando SteamCMD validate");
    } else {
      this.setProgress(null, "Instalando SteamCMD…", "Iniciando instalación de SteamCMD");
    }
    this.activeSteamCmd = {
      child,
      operation,
      serverId,
      startedAt: new Date().toISOString(),
    };
    this.emitProgress(true);
  }

  private endSteamCmdProcess(child: ChildProcess): void {
    if (this.activeSteamCmd?.child === child) {
      // Vaciar restos del buffer (\r sin cerrar).
      for (const [source, remainder] of this.steamCmdOutputBuffers) {
        const trimmed = remainder.trim();
        if (trimmed.length > 0) {
          this.handleSteamCmdOutputLine(trimmed, source);
        }
      }
      this.steamCmdOutputBuffers.clear();
      this.activeSteamCmd = null;
      this.emitProgress(true);
    }
  }

  private killProcessTree(child: ChildProcess): void {
    const pid = child.pid;
    if (pid !== undefined && process.platform === "win32") {
      try {
        execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
          stdio: ["ignore", "ignore", "ignore"],
          timeout: 5_000,
        });
        return;
      } catch {
        // Fallback a kill directo si taskkill falla.
      }
    }
    child.kill();
  }

  private loadQueue(): CriticalJob[] {
    const raw = this.settings.get(CRITICAL_JOBS_KEY);
    if (raw === null || raw.trim().length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as CriticalJob[];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((job) =>
          typeof job.id === "string"
          && (job.type === "install-files" || job.type === "update" || job.type === "verify-files")
          && typeof job.serverId === "string",
        )
        .map((job) => ({
          ...job,
          status: "pending",
          attempts: Number.isFinite(job.attempts) ? Math.max(0, Math.floor(job.attempts)) : 0,
          maxAttempts: Number.isFinite(job.maxAttempts)
            ? Math.max(1, Math.floor(job.maxAttempts))
            : 3,
          updatedAt: new Date().toISOString(),
        }));
    } catch {
      return [];
    }
  }

  private persistQueue(): void {
    this.settings.set(CRITICAL_JOBS_KEY, JSON.stringify(this.queue));
  }

  private removeJob(jobId: string): void {
    this.queue = this.queue.filter((job) => job.id !== jobId);
  }

  private resolveJob(jobId: string): void {
    const waiter = this.waiters.get(jobId);
    if (waiter !== undefined) {
      waiter.resolve();
      this.waiters.delete(jobId);
    }
  }

  private rejectJob(jobId: string, error: Error): void {
    const waiter = this.waiters.get(jobId);
    if (waiter !== undefined) {
      waiter.reject(error);
      this.waiters.delete(jobId);
    }
  }
}
