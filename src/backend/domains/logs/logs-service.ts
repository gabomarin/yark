import { readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type {
  BackupRecord,
  LogCleanupItem,
  LogCleanupOptions,
  LogCleanupPreview,
  LogCleanupResult,
  LogCleanupTargetRef,
  LogRetentionCategory,
  LogRetentionSettings,
  ServerOperationalLogs,
  ServerUpdateLogFile,
  ServerUpdateLogStatus,
} from "@shared/types";
import { resolveEventDetails } from "@shared/event-details";
import {
  LOG_RETENTION_SETTINGS_KEY,
  assertLogRetentionSettings,
  daysToCutoffIso,
  isFailureEvent,
  isFailureUpdateLogStatus,
  normalizeLogRetentionSettings,
  parseLogRetentionSettings,
} from "@shared/log-retention";
import type { AppSettingsRepository } from "../../infra/db/app-settings-repository";
import type { ServerRepository } from "../../infra/db/server-repository";
import type { ProcessManager } from "../../infra/process/process-manager";

/** Minimal backup listing surface (reconciles disk before returning). */
export interface BackupLogSource {
  list(serverId: string, limit: number): Promise<BackupRecord[]>;
}

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

function targetRefKey(ref: LogCleanupTargetRef): string {
  return `${ref.category}|${ref.serverId}|${ref.targetKey}`;
}

function normalizeCategories(
  categories: LogRetentionCategory[] | null | undefined,
): LogRetentionCategory[] {
  if (categories === undefined || categories === null || categories.length === 0) {
    return ["events", "updateLogs"];
  }
  const unique: LogRetentionCategory[] = [];
  for (const category of ["events", "updateLogs"] as const) {
    if (categories.includes(category) && !unique.includes(category)) {
      unique.push(category);
    }
  }
  if (unique.length === 0) {
    throw new Error("Select at least one log category");
  }
  return unique;
}

function normalizeServerFilter(
  serverIds: string[] | null | undefined,
): Set<string> | null {
  if (serverIds === undefined || serverIds === null || serverIds.length === 0) {
    return null;
  }
  return new Set(serverIds.filter((id) => id.trim().length > 0));
}

function emptyResult(): LogCleanupResult {
  return {
    deleted: 0,
    freedBytes: 0,
    byCategory: [
      { category: "events", deleted: 0, bytes: 0 },
      { category: "updateLogs", deleted: 0, bytes: 0 },
    ],
    skipped: [],
    failed: [],
  };
}

function aggregatePreview(items: LogCleanupItem[]): LogCleanupPreview {
  const byCategoryMap = new Map<LogRetentionCategory, { count: number; bytes: number }>();
  const byServerMap = new Map<
    string,
    { serverId: string; serverName: string; count: number; bytes: number }
  >();
  let totalBytes = 0;
  for (const item of items) {
    totalBytes += item.sizeBytes;
    const cat = byCategoryMap.get(item.category) ?? { count: 0, bytes: 0 };
    cat.count += 1;
    cat.bytes += item.sizeBytes;
    byCategoryMap.set(item.category, cat);
    const server = byServerMap.get(item.serverId) ?? {
      serverId: item.serverId,
      serverName: item.serverName,
      count: 0,
      bytes: 0,
    };
    server.count += 1;
    server.bytes += item.sizeBytes;
    byServerMap.set(item.serverId, server);
  }
  return {
    items,
    totalBytes,
    byCategory: (["events", "updateLogs"] as const).map((category) => {
      const row = byCategoryMap.get(category) ?? { count: 0, bytes: 0 };
      return { category, count: row.count, bytes: row.bytes };
    }),
    byServer: [...byServerMap.values()].sort((a, b) =>
      a.serverName.localeCompare(b.serverName),
    ),
  };
}

export class LogsService {
  private enforceInFlight = false;

  constructor(
    private readonly repo: ServerRepository,
    private readonly backups: BackupLogSource,
    private readonly updatesLogDir: string,
    private readonly processes: ProcessManager,
    private readonly settings: AppSettingsRepository,
  ) {}

  async listServerLogs(serverId: string): Promise<ServerOperationalLogs> {
    const server = this.repo.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }

    const [updateFiles, backups] = await Promise.all([
      this.listUpdateLogsForServer(serverId),
      this.backups.list(serverId, 100),
    ]);
    const events = this.repo
      .recentEvents(500)
      .filter((event) => event.serverId === serverId);
    const runtime = this.getRuntimeLogSnapshot(serverId);

    return {
      serverId,
      updateFiles,
      backups,
      events,
      runtimeLogLines: runtime.runtimeLogLines,
    };
  }

  getRuntimeLogSnapshot(
    serverId: string,
    limit = 400,
  ): { serverId: string; runtimeLogLines: string[] } {
    const server = this.repo.get(serverId);
    if (server === null) {
      throw new Error("Server does not exist");
    }
    return {
      serverId,
      runtimeLogLines: this.processes.getRuntimeLogSnapshot(serverId, limit),
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

  clearEvents(serverId: string): number {
    if (this.repo.get(serverId) === null) {
      throw new Error("Server does not exist");
    }
    return this.repo.deleteEventsForServer(serverId);
  }

  clearRuntimeLog(serverId: string): void {
    if (this.repo.get(serverId) === null) {
      throw new Error("Server does not exist");
    }
    this.processes.clearRuntimeLog(serverId);
  }

  async deleteUpdateLog(serverId: string, fileName: string): Promise<void> {
    const path = this.resolveUpdateLogPath(serverId, fileName);
    await unlink(path);
  }

  async clearUpdateLogs(serverId: string): Promise<number> {
    if (this.repo.get(serverId) === null) {
      throw new Error("Server does not exist");
    }
    const files = await this.listUpdateLogsForServer(serverId);
    let deleted = 0;
    for (const file of files) {
      try {
        await unlink(file.fullPath);
        deleted += 1;
      } catch {
        // skip files that disappear mid-clear
      }
    }
    return deleted;
  }

  getRetentionSettings(): LogRetentionSettings {
    return parseLogRetentionSettings(this.settings.get(LOG_RETENTION_SETTINGS_KEY));
  }

  setRetentionSettings(settings: LogRetentionSettings): LogRetentionSettings {
    assertLogRetentionSettings(settings);
    const next = normalizeLogRetentionSettings(settings);
    this.settings.set(LOG_RETENTION_SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  async previewCleanup(options: LogCleanupOptions = {}): Promise<LogCleanupPreview> {
    const items = await this.planCleanup(options);
    return aggregatePreview(items);
  }

  async runCleanup(options: LogCleanupOptions = {}): Promise<LogCleanupResult> {
    let plan = await this.planCleanup(options);
    const confirmed = options.confirmedTargets;
    if (confirmed !== undefined && confirmed !== null) {
      const allowed = new Set(
        confirmed
          .filter((ref) => ref.targetKey.trim().length > 0)
          .map(targetRefKey),
      );
      plan = plan.filter((item) =>
        allowed.has(
          targetRefKey({
            category: item.category,
            serverId: item.serverId,
            targetKey: item.targetKey,
          }),
        ),
      );
    }

    const result = emptyResult();
    const eventIds: number[] = [];
    for (const item of plan) {
      if (item.category === "events") {
        const id = Number(item.targetKey);
        if (Number.isFinite(id)) {
          eventIds.push(id);
        }
        continue;
      }

      const guarded = await this.resolveGuardedUpdateLogPath(item.serverId, item.targetKey);
      if (!guarded.ok) {
        result.skipped.push({
          category: "updateLogs",
          targetKey: item.targetKey,
          reason: guarded.reason,
        });
        continue;
      }
      try {
        await unlink(guarded.path);
        result.deleted += 1;
        result.freedBytes += item.sizeBytes;
        const cat = result.byCategory.find((row) => row.category === "updateLogs");
        if (cat !== undefined) {
          cat.deleted += 1;
          cat.bytes += item.sizeBytes;
        }
      } catch (error: unknown) {
        const code =
          error !== null && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : "";
        if (code === "EBUSY" || code === "EPERM" || code === "EACCES") {
          result.skipped.push({
            category: "updateLogs",
            targetKey: item.targetKey,
            reason: `In use (${code}); retry on a later cleanup cycle`,
          });
        } else if (code === "ENOENT") {
          result.skipped.push({
            category: "updateLogs",
            targetKey: item.targetKey,
            reason: "File already removed",
          });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          result.failed.push({
            category: "updateLogs",
            targetKey: item.targetKey,
            error: message,
          });
        }
      }
    }

    if (eventIds.length > 0) {
      const deletedEvents = this.repo.deleteEventsByIds(eventIds);
      result.deleted += deletedEvents;
      const cat = result.byCategory.find((row) => row.category === "events");
      if (cat !== undefined) {
        cat.deleted += deletedEvents;
      }
    }

    this.recordCleanupOutcome(result, "manual");
    return result;
  }

  /** Scheduler entry: enforce saved policy when auto-cleanup is enabled. */
  async enforceRetention(): Promise<LogCleanupResult | null> {
    if (this.enforceInFlight) return null;
    const settings = this.getRetentionSettings();
    if (!settings.autoCleanupEnabled) return null;
    this.enforceInFlight = true;
    try {
      const result = await this.runCleanupQuiet();
      return result;
    } finally {
      this.enforceInFlight = false;
    }
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
        const details = resolveEventDetails(event);
        sections.push(`  What: ${details.what}`);
        if (details.cause !== null) sections.push(`  Cause: ${details.cause}`);
        if (details.location !== null) sections.push(`  Where: ${details.location}`);
        if (details.suggestion !== null) sections.push(`  Try next: ${details.suggestion}`);
        for (const item of details.context) {
          sections.push(`  ${item.label}: ${item.value}`);
        }
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

  /** Like runCleanup but without requiring confirmedTargets; used by scheduler. */
  private async runCleanupQuiet(): Promise<LogCleanupResult> {
    const plan = await this.planCleanup({});
    const result = emptyResult();
    const eventIds: number[] = [];
    for (const item of plan) {
      if (item.category === "events") {
        const id = Number(item.targetKey);
        if (Number.isFinite(id)) eventIds.push(id);
        continue;
      }
      const guarded = await this.resolveGuardedUpdateLogPath(item.serverId, item.targetKey);
      if (!guarded.ok) {
        result.skipped.push({
          category: "updateLogs",
          targetKey: item.targetKey,
          reason: guarded.reason,
        });
        continue;
      }
      try {
        await unlink(guarded.path);
        result.deleted += 1;
        result.freedBytes += item.sizeBytes;
        const cat = result.byCategory.find((row) => row.category === "updateLogs");
        if (cat !== undefined) {
          cat.deleted += 1;
          cat.bytes += item.sizeBytes;
        }
      } catch (error: unknown) {
        const code =
          error !== null && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : "";
        if (code === "EBUSY" || code === "EPERM" || code === "EACCES" || code === "ENOENT") {
          result.skipped.push({
            category: "updateLogs",
            targetKey: item.targetKey,
            reason: code === "ENOENT" ? "File already removed" : `In use (${code})`,
          });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          result.failed.push({
            category: "updateLogs",
            targetKey: item.targetKey,
            error: message,
          });
        }
      }
    }
    if (eventIds.length > 0) {
      const deletedEvents = this.repo.deleteEventsByIds(eventIds);
      result.deleted += deletedEvents;
      const cat = result.byCategory.find((row) => row.category === "events");
      if (cat !== undefined) cat.deleted += deletedEvents;
    }
    if (result.deleted > 0 || result.failed.length > 0) {
      this.recordCleanupOutcome(result, "auto");
    }
    return result;
  }

  private recordCleanupOutcome(
    result: LogCleanupResult,
    trigger: "manual" | "auto",
  ): void {
    const eventsDeleted =
      result.byCategory.find((row) => row.category === "events")?.deleted ?? 0;
    const updateDeleted =
      result.byCategory.find((row) => row.category === "updateLogs")?.deleted ?? 0;
    if (result.failed.length > 0) {
      this.repo.addEvent(
        null,
        "logs_retention_failed",
        "warning",
        `Log retention (${trigger}) finished with ${result.failed.length} failure(s); deleted ${result.deleted} item(s).`,
        {
          what: "Operational log retention could not finish cleanly.",
          context: {
            trigger,
            deleted: result.deleted,
            skipped: result.skipped.length,
            failed: result.failed.length,
            eventsDeleted,
            updateLogsDeleted: updateDeleted,
            freedBytes: result.freedBytes,
          },
        },
      );
      return;
    }
    if (result.deleted === 0 && result.skipped.length === 0) {
      return;
    }
    this.repo.addEvent(
      null,
      "logs_retention_completed",
      "info",
      `Log retention (${trigger}) removed ${result.deleted} item(s) (${eventsDeleted} events, ${updateDeleted} update logs).`,
      {
        what: "YARK applied the operational log retention policy.",
        context: {
          trigger,
          deleted: result.deleted,
          skipped: result.skipped.length,
          eventsDeleted,
          updateLogsDeleted: updateDeleted,
          freedBytes: result.freedBytes,
        },
      },
    );
  }

  private async planCleanup(options: LogCleanupOptions): Promise<LogCleanupItem[]> {
    const settings = this.getRetentionSettings();
    const categories = normalizeCategories(options.categories);
    const serverFilter = normalizeServerFilter(options.serverIds);
    const items: LogCleanupItem[] = [];
    const nameById = new Map(this.repo.list().map((s) => [s.id, s.name]));

    if (categories.includes("events")) {
      items.push(...this.planEventCleanup(settings, serverFilter, nameById));
    }
    if (categories.includes("updateLogs")) {
      items.push(...(await this.planUpdateLogCleanup(settings, serverFilter, nameById)));
    }
    return items;
  }

  private planEventCleanup(
    settings: LogRetentionSettings,
    serverFilter: Set<string> | null,
    nameById: Map<string, string>,
  ): LogCleanupItem[] {
    const routineCutoff = daysToCutoffIso(settings.eventsRetainDays);
    const failureCutoff = daysToCutoffIso(settings.eventsFailureRetainDays);
    const items: LogCleanupItem[] = [];

    for (const event of this.repo.listAllEvents()) {
      // Retention outcome events should not immediately re-queue themselves.
      if (
        event.type === "logs_retention_completed"
        || event.type === "logs_retention_failed"
      ) {
        continue;
      }
      const serverId = event.serverId ?? "";
      if (serverFilter !== null && !serverFilter.has(serverId)) {
        continue;
      }
      const failure = isFailureEvent(event);
      const cutoff = failure ? failureCutoff : routineCutoff;
      if (event.createdAt >= cutoff) {
        continue;
      }
      const serverName =
        serverId.length === 0
          ? "Global"
          : (nameById.get(serverId) ?? serverId);
      items.push({
        category: "events",
        serverId,
        serverName,
        targetKey: String(event.id),
        label: `${event.type}: ${event.message.slice(0, 80)}`,
        reason: failure
          ? `failure evidence older than ${settings.eventsFailureRetainDays}d`
          : `older than ${settings.eventsRetainDays}d`,
        sizeBytes: 0,
        isFailureEvidence: failure,
      });
    }
    return items;
  }

  private async planUpdateLogCleanup(
    settings: LogRetentionSettings,
    serverFilter: Set<string> | null,
    nameById: Map<string, string>,
  ): Promise<LogCleanupItem[]> {
    const failureCutoff = daysToCutoffIso(settings.updateLogsFailureRetainDays);
    const items: LogCleanupItem[] = [];
    const servers = this.repo.list();
    const serverIds =
      serverFilter === null
        ? servers.map((s) => s.id)
        : servers.map((s) => s.id).filter((id) => serverFilter.has(id));

    for (const serverId of serverIds) {
      const files = await this.listUpdateLogsForServer(serverId);
      const serverName = nameById.get(serverId) ?? serverId;
      let successKept = 0;
      for (const file of files) {
        const failure = isFailureUpdateLogStatus(file.status);
        if (failure) {
          if (file.modifiedAt >= failureCutoff) {
            continue;
          }
          items.push({
            category: "updateLogs",
            serverId,
            serverName,
            targetKey: file.fileName,
            label: file.fileName,
            reason: `failed/unknown update log older than ${settings.updateLogsFailureRetainDays}d`,
            sizeBytes: file.sizeBytes,
            isFailureEvidence: true,
          });
          continue;
        }
        successKept += 1;
        if (successKept <= settings.updateLogsRetainCount) {
          continue;
        }
        items.push({
          category: "updateLogs",
          serverId,
          serverName,
          targetKey: file.fileName,
          label: file.fileName,
          reason: `over keep-last ${settings.updateLogsRetainCount} successful update logs`,
          sizeBytes: file.sizeBytes,
          isFailureEvidence: false,
        });
      }
    }
    return items;
  }

  /**
   * Resolve an update-log path and ensure it stays inside the YARK update-logs root.
   */
  private async resolveGuardedUpdateLogPath(
    serverId: string,
    fileName: string,
  ): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
    if (!isSafeFileName(fileName) || !fileName.startsWith(`${serverId}-`)) {
      return { ok: false, reason: "Invalid log file name" };
    }
    if (this.repo.get(serverId) === null) {
      return { ok: false, reason: "Server does not exist" };
    }
    const root = resolve(this.updatesLogDir);
    const candidate = resolve(root, fileName);
    const rel = relative(root, candidate);
    if (rel.startsWith("..") || rel === "") {
      return { ok: false, reason: "Path is outside the YARK update-logs root" };
    }
    return { ok: true, path: candidate };
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
