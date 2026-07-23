import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import type { SteamCmdConsoleSnapshot, SteamCmdStatus } from "../../../shared/types";
import type { BackupService } from "../backups/backup-service";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceService } from "../instances/instance-service";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";

const ASA_APP_ID = "2430930";
const MAX_STEAMCMD_LINES = 500;

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Flujo seguro de actualización por instancia:
 * pre-backup -> stop -> steamcmd update -> start -> health-check -> rollback.
 */
export class UpdateService {
  private readonly steamCmdConsoleLines: string[] = [];
  private steamCmdConsoleUpdatedAt = new Date(0).toISOString();

  constructor(
    private readonly servers: ServerRepository,
    private readonly backups: BackupService,
    private readonly instances: InstanceService,
    private readonly processes: ProcessManager,
    private readonly locks: InstanceLockManager,
    private readonly settings: AppSettingsRepository,
    private readonly updatesLogDir: string,
    private readonly steamcmdDir: string,
  ) {}

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
        reject(new Error(`No se pudo ejecutar PowerShell: ${error.message}`));
      });

      child.once("exit", (code) => {
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
    return {
      detected: executablePath !== null,
      executablePath,
      checkedAt: new Date().toISOString(),
    };
  }

  getSteamCmdConsole(limit = 200): SteamCmdConsoleSnapshot {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 200;
    return {
      lines: this.steamCmdConsoleLines.slice(-safeLimit),
      updatedAt: this.steamCmdConsoleUpdatedAt,
    };
  }

  async installServerFiles(serverId: string): Promise<void> {
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

      const cmd = await this.runSteamUpdate(server.installDir);
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

  async updateServer(serverId: string): Promise<void> {
    await this.locks.withLock(serverId, "update", async () => {
      const server = this.servers.get(serverId);
      if (server === null) {
        throw new Error("El servidor no existe");
      }

      const wasRunning = this.processes.isActive(serverId);
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
        const cmd = await this.runSteamUpdate(server.installDir);
        await writeFile(
          logPath,
          [
            `time=${new Date().toISOString()}`,
            `server=${server.name}`,
            `installDir=${server.installDir}`,
            `exitCode=${cmd.code}`,
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

  private async runSteamUpdate(installDir: string): Promise<CommandResult> {
    const steamcmdExe = this.resolveSteamCmdExecutable();
    const args = [
      "+login",
      "anonymous",
      "+force_install_dir",
      installDir,
      "+app_update",
      ASA_APP_ID,
      "validate",
      "+quit",
    ];

    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(steamcmdExe, args, {
        windowsHide: true,
        shell: false,
      });

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
        reject(
          new Error(
            `No se pudo ejecutar SteamCMD (${steamcmdExe}). Instálalo o configúralo. Detalle: ${error.message}`,
          ),
        );
      });

      child.once("exit", (code) => {
        resolve({
          code: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
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

  private appendSteamCmdConsole(line: string): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }
    this.steamCmdConsoleLines.push(`[${new Date().toISOString()}] ${trimmed}`);
    if (this.steamCmdConsoleLines.length > MAX_STEAMCMD_LINES) {
      this.steamCmdConsoleLines.splice(0, this.steamCmdConsoleLines.length - MAX_STEAMCMD_LINES);
    }
    this.steamCmdConsoleUpdatedAt = new Date().toISOString();
  }

  private captureSteamCmdOutput(chunk: string, source: string): void {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      this.appendSteamCmdConsole(`[${source}] ${line}`);
    }
  }
}
