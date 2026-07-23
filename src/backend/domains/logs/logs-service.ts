import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AppEvent,
  ServerOperationalLogs,
  ServerUpdateLogFile,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ProcessManager } from "../../infra/process/process-manager";

function isSafeFileName(fileName: string): boolean {
  return !fileName.includes("/") && !fileName.includes("\\") && !fileName.includes("..");
}

export class LogsService {
  constructor(
    private readonly repo: ServerRepository,
    private readonly backups: BackupRepository,
    private readonly updatesLogDir: string,
    private readonly processes: ProcessManager,
  ) {}

  async listServerLogs(serverId: string): Promise<ServerOperationalLogs> {
    const server = this.repo.get(serverId);
    if (server === null) {
      throw new Error("El servidor no existe");
    }

    const updateFiles = await this.listUpdateLogsForServer(serverId);
    const backups = this.backups.listBackups(serverId, 100);
    const events = this.repo
      .recentEvents(500)
      .filter((event) => event.serverId === serverId);
    const runtimeLogLines = this.processes.getRuntimeLogSnapshot(serverId, 400);

    return {
      serverId,
      updateFiles,
      backups,
      events,
      runtimeLogLines,
    };
  }

  async readUpdateLog(serverId: string, fileName: string, maxBytes = 250_000): Promise<string> {
    const server = this.repo.get(serverId);
    if (server === null) {
      throw new Error("El servidor no existe");
    }

    if (!isSafeFileName(fileName) || !fileName.startsWith(`${serverId}-`)) {
      throw new Error("Nombre de archivo de log inválido");
    }

    const path = join(this.updatesLogDir, fileName);
    const content = await readFile(path, "utf8");
    if (content.length <= maxBytes) {
      return content;
    }
    return content.slice(content.length - maxBytes);
  }

  async exportServerLogs(serverId: string, destinationPath: string): Promise<string> {
    const logs = await this.listServerLogs(serverId);
    const sections: string[] = [];

    sections.push(`# Logs operativos de ${serverId}`);
    sections.push(`Generado: ${new Date().toISOString()}`);

    sections.push("\n## Runtime");
    if (logs.runtimeLogLines.length === 0) {
      sections.push("(sin líneas runtime)");
    } else {
      sections.push(...logs.runtimeLogLines);
    }

    sections.push("\n## Eventos");
    if (logs.events.length === 0) {
      sections.push("(sin eventos)");
    } else {
      for (const event of logs.events) {
        sections.push(`${event.createdAt} [${event.severity}] ${event.type} - ${event.message}`);
      }
    }

    sections.push("\n## Backups");
    if (logs.backups.length === 0) {
      sections.push("(sin backups)");
    } else {
      for (const backup of logs.backups) {
        sections.push(`${backup.createdAt} [${backup.status}] ${backup.type} - ${backup.path}`);
      }
    }

    sections.push("\n## Update Logs");
    if (logs.updateFiles.length === 0) {
      sections.push("(sin logs de update)");
    } else {
      for (const file of logs.updateFiles.slice(0, 3)) {
        sections.push(`\n### ${file.fileName}`);
        sections.push(`Modificado: ${file.modifiedAt} | Tamaño: ${file.sizeBytes} bytes`);
        sections.push(await this.readUpdateLog(serverId, file.fileName, 120_000));
      }
      if (logs.updateFiles.length > 3) {
        sections.push(`\n(${logs.updateFiles.length - 3} archivos adicionales omitidos)`);
      }
    }

    await writeFile(destinationPath, `${sections.join("\n")}\n`, "utf8");
    return destinationPath;
  }

  private async listUpdateLogsForServer(serverId: string): Promise<ServerUpdateLogFile[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(this.updatesLogDir);
    } catch {
      return [];
    }

    const files: ServerUpdateLogFile[] = [];
    for (const fileName of entries) {
      if (!fileName.startsWith(`${serverId}-`) || !fileName.endsWith(".log")) {
        continue;
      }
      const fullPath = join(this.updatesLogDir, fileName);
      try {
        const info = await stat(fullPath);
        if (!info.isFile()) continue;
        files.push({
          fileName,
          fullPath,
          modifiedAt: info.mtime.toISOString(),
          sizeBytes: info.size,
        });
      } catch {
        // ignora archivos que desaparecen o fallan al leer metadata
      }
    }

    return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }
}
