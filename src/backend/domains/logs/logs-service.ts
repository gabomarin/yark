import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AppEvent,
  ServerOperationalLogs,
  ServerUpdateLogFile,
  ServerUpdateLogStatus,
} from "@shared/types";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { BackupRepository } from "../../infra/db/backup-repository";
import type { ProcessManager } from "../../infra/process/process-manager";

function isSafeFileName(fileName: string): boolean {
  return !fileName.includes("/") && !fileName.includes("\\") && !fileName.includes("..");
}

function parseUpdateLogHeader(content: string): {
  status: ServerUpdateLogStatus;
  exitCode: number | null;
  durationMs: number | null;
} {
  const headerEnd = content.indexOf("--- stdout ---");
  const header = headerEnd === -1 ? content : content.slice(0, headerEnd);
  const exitCodeMatch = header.match(/^exitCode=(-?\d+)$/m);
  const durationMatch = header.match(/^durationMs=(\d+)$/m);
  const exitCode = exitCodeMatch !== null ? Number(exitCodeMatch[1]) : null;
  const durationMs = durationMatch !== null ? Number(durationMatch[1]) : null;
  const status: ServerUpdateLogStatus =
    exitCode === null ? "unknown" : exitCode === 0 ? "success" : "failed";
  return { status, exitCode, durationMs };
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
      throw new Error("Server does not exist");
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

  resolveUpdateLogPath(serverId: string, fileName: string): string {
    const server = this.repo.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }

    if (!isSafeFileName(fileName) || !fileName.startsWith(`${serverId}-`)) {
      throw new Error("Invalid log file name");
    }

    return join(this.updatesLogDir, fileName);
  }

  async readUpdateLog(serverId: string, fileName: string, maxBytes = 250_000): Promise<string> {
    const path = this.resolveUpdateLogPath(serverId, fileName);
    const content = await readFile(path, "utf8");
    if (content.length <= maxBytes) {
      return content;
    }
    return content.slice(content.length - maxBytes);
  }

  async exportServerLogs(serverId: string, destinationPath: string): Promise<string> {
    const logs = await this.listServerLogs(serverId);
    const sections: string[] = [];

    sections.push(`# Operational logs for ${serverId}`);
    sections.push(`Generated: ${new Date().toISOString()}`);

    sections.push("\n## Runtime");
    if (logs.runtimeLogLines.length === 0) {
      sections.push("(no runtime lines)");
    } else {
      sections.push(...logs.runtimeLogLines);
    }

    sections.push("\n## Events");
    if (logs.events.length === 0) {
      sections.push("(no events)");
    } else {
      for (const event of logs.events) {
        sections.push(`${event.createdAt} [${event.severity}] ${event.type} - ${event.message}`);
      }
    }

    sections.push("\n## Backups");
    if (logs.backups.length === 0) {
      sections.push("(no backups)");
    } else {
      for (const backup of logs.backups) {
        sections.push(`${backup.createdAt} [${backup.status}] ${backup.type} - ${backup.path}`);
      }
    }

    sections.push("\n## Update Logs");
    if (logs.updateFiles.length === 0) {
      sections.push("(no update logs)");
    } else {
      for (const file of logs.updateFiles.slice(0, 3)) {
        sections.push(`\n### ${file.fileName}`);
        sections.push(`Modified: ${file.modifiedAt} | Size: ${file.sizeBytes} bytes`);
        sections.push(await this.readUpdateLog(serverId, file.fileName, 120_000));
      }
      if (logs.updateFiles.length > 3) {
        sections.push(`\n(${logs.updateFiles.length - 3} additional files omitted)`);
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
        let status: ServerUpdateLogStatus = "unknown";
        let exitCode: number | null = null;
        let durationMs: number | null = null;
        try {
          const content = await readFile(fullPath, "utf8");
          const parsed = parseUpdateLogHeader(content);
          status = parsed.status;
          exitCode = parsed.exitCode;
          durationMs = parsed.durationMs;
        } catch {
          // ignore content parse errors; leave status "unknown"
        }
        files.push({
          fileName,
          fullPath,
          modifiedAt: info.mtime.toISOString(),
          sizeBytes: info.size,
          status,
          exitCode,
          durationMs,
        });
      } catch {
        // ignore files that disappear or fail metadata reads
      }
    }

    return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }
}
