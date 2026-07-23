import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { BackupService } from "../backups/backup-service";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { InstanceService } from "../instances/instance-service";
import type { ProcessManager } from "../../infra/process/process-manager";
import type { InstanceLockManager } from "../../orchestration/instance-lock-manager";

const ASA_APP_ID = "2430930";

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
  constructor(
    private readonly servers: ServerRepository,
    private readonly backups: BackupService,
    private readonly instances: InstanceService,
    private readonly processes: ProcessManager,
    private readonly locks: InstanceLockManager,
    private readonly updatesLogDir: string,
  ) {}

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
      const child = spawn("steamcmd.exe", args, {
        windowsHide: true,
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.once("error", (error) => {
        reject(
          new Error(
            `No se pudo ejecutar steamcmd.exe. Instálalo o agrégalo al PATH. Detalle: ${error.message}`,
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
}
