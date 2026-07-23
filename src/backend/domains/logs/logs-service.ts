import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  AppEvent,
  BackupRecord,
  ServerOperationalLogs,
  ServerUpdateLogFile,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { BackupRepository } from "../../infra/db/backup-repository";

function isSafeFileName(fileName: string): boolean {
  return !fileName.includes("/") && !fileName.includes("\\") && !fileName.includes("..");
}

export class LogsService {
  constructor(
    private readonly repo: ServerRepository,
    private readonly backups: BackupRepository,
    private readonly updatesLogDir: string,
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

    return {
      serverId,
      updateFiles,
      backups,
      events,
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
