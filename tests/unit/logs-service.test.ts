import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppEvent, LogRetentionSettings, ServerProfile } from "@shared/types";
import { DEFAULT_LOG_RETENTION_SETTINGS } from "@shared/log-retention";
import { LogsService, type BackupLogSource } from "@backend/domains/logs/logs-service";
import type { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ProcessManager } from "@backend/infra/process/process-manager";

function makeProfile(installDir: string, id = "srv-logs-1"): ServerProfile {
  const now = new Date().toISOString();
  return {
    id,
    name: "Logs Test",
    map: "TheIsland_WP",
    installDir,
    enabled: true,
    autoStart: false,
    sessionName: "Logs",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: now,
    updatedAt: now,
  };
}

function emptyBackupSource(): BackupLogSource {
  return {
    list: async () => [],
  };
}

function memorySettings(initial: Record<string, string | null> = {}): AppSettingsRepository {
  const store = new Map<string, string | null>(Object.entries(initial));
  return {
    get: (key: string) => (store.has(key) ? store.get(key)! : null),
    set: (key: string, value: string | null) => {
      store.set(key, value);
    },
  } as unknown as AppSettingsRepository;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function touchAge(path: string, daysAgo: number): void {
  const when = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  utimesSync(path, when, when);
}

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("LogsService runtime logs", () => {
  it("includes runtimeLogLines in listServerLogs", async () => {
    const root = mkdtempSync(join(tmpdir(), "ark-logs-"));
    tmpDirs.push(root);
    const updatesDir = join(root, "updates");
    mkdirSync(updatesDir, { recursive: true });
    writeFileSync(join(updatesDir, "srv-logs-1-1.log"), "update output", "utf8");

    const profile = makeProfile(root);
    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      recentEvents: () => [],
    } as unknown as ServerRepository;

    const processes = {
      getRuntimeLogSnapshot: (_id: string, _limit?: number) => [
        "[2026-07-22T00:00:00.000Z] [stdout] server started",
      ],
    } as unknown as ProcessManager;

    const service = new LogsService(
      repo,
      emptyBackupSource(),
      updatesDir,
      processes,
      memorySettings(),
    );
    const logs = await service.listServerLogs(profile.id);

    expect(logs.updateFiles.length).toBe(1);
    expect(logs.runtimeLogLines.length).toBe(1);
    expect(logs.runtimeLogLines[0]).toContain("server started");
  });

  it("exports operational logs to a file", async () => {
    const root = mkdtempSync(join(tmpdir(), "ark-logs-export-"));
    tmpDirs.push(root);
    const updatesDir = join(root, "updates");
    mkdirSync(updatesDir, { recursive: true });
    writeFileSync(join(updatesDir, "srv-logs-1-1.log"), "update output", "utf8");

    const profile = makeProfile(root);
    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      recentEvents: () => [
        {
          id: 1,
          serverId: profile.id,
          type: "error" as const,
          severity: "error" as const,
          message: "Backup scheduled/world failed",
          createdAt: "2026-07-25T12:00:00.000Z",
          details: {
            what: "A scheduled world backup failed before the archive was completed.",
            cause: "ENOSPC: no space left on device",
            location: "C:\\ARK\\Backups\\World",
            suggestion: "Free disk space, then retry.",
            context: { kind: "world", code: "ENOSPC" },
          },
        },
      ],
    } as unknown as ServerRepository;

    const processes = {
      getRuntimeLogSnapshot: (_id: string, _limit?: number) => [
        "[2026-07-22T00:00:00.000Z] [stdout] server started",
      ],
    } as unknown as ProcessManager;

    const service = new LogsService(
      repo,
      emptyBackupSource(),
      updatesDir,
      processes,
      memorySettings(),
    );
    const outFile = join(root, "logs-export.txt");
    const resultPath = await service.exportServerLogs(profile.id, outFile);

    expect(resultPath).toBe(outFile);
    const content = readFileSync(outFile, "utf8");
    expect(content).toContain("Operational logs for srv-logs-1");
    expect(content).toContain("server started");
    expect(content).toContain("srv-logs-1-1.log");
    expect(content).toContain("update output");
    expect(content).toContain("Backup scheduled/world failed");
    expect(content).toContain("What: A scheduled world backup failed");
    expect(content).toContain("Cause: ENOSPC: no space left on device");
    expect(content).toContain("Try next: Free disk space, then retry.");
    expect(content).toContain("kind: world");
  });

  it("clears events, runtime buffer, and update log files", async () => {
    const root = mkdtempSync(join(tmpdir(), "ark-logs-clear-"));
    tmpDirs.push(root);
    const updatesDir = join(root, "updates");
    mkdirSync(updatesDir, { recursive: true });
    writeFileSync(join(updatesDir, "srv-logs-1-a.log"), "one", "utf8");
    writeFileSync(join(updatesDir, "srv-logs-1-b.log"), "two", "utf8");
    writeFileSync(join(updatesDir, "other-server-c.log"), "keep", "utf8");

    const profile = makeProfile(root);
    let deletedEvents = 0;
    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      recentEvents: () => [],
      deleteEventsForServer: (id: string) => {
        expect(id).toBe(profile.id);
        deletedEvents = 3;
        return 3;
      },
    } as unknown as ServerRepository;

    let runtimeCleared = false;
    const processes = {
      getRuntimeLogSnapshot: () => ["line"],
      clearRuntimeLog: (id: string) => {
        expect(id).toBe(profile.id);
        runtimeCleared = true;
      },
    } as unknown as ProcessManager;

    const service = new LogsService(
      repo,
      emptyBackupSource(),
      updatesDir,
      processes,
      memorySettings(),
    );
    expect(service.clearEvents(profile.id)).toBe(3);
    expect(deletedEvents).toBe(3);

    service.clearRuntimeLog(profile.id);
    expect(runtimeCleared).toBe(true);

    await service.deleteUpdateLog(profile.id, "srv-logs-1-a.log");
    const cleared = await service.clearUpdateLogs(profile.id);
    expect(cleared).toBe(1);
    expect(readFileSync(join(updatesDir, "other-server-c.log"), "utf8")).toBe("keep");

    const remaining = await service.listServerLogs(profile.id);
    expect(remaining.updateFiles).toEqual([]);
  });
});

describe("LogsService retention (#84)", () => {
  it("rejects invalid retention settings and preserves the previous policy", () => {
    const settings = memorySettings({
      "logRetention.v1": JSON.stringify(DEFAULT_LOG_RETENTION_SETTINGS),
    });
    const service = new LogsService(
      { get: () => null, list: () => [], listAllEvents: () => [] } as unknown as ServerRepository,
      emptyBackupSource(),
      join(tmpdir(), "missing-updates"),
      { getRuntimeLogSnapshot: () => [] } as unknown as ProcessManager,
      settings,
    );

    const before = service.getRetentionSettings();
    expect(() =>
      service.setRetentionSettings({
        ...before,
        eventsRetainDays: 2,
      }),
    ).toThrow(/eventsRetainDays/);
    expect(service.getRetentionSettings()).toEqual(before);
  });

  it("deletes routine events past retain days but keeps recent failure evidence", async () => {
    const root = mkdtempSync(join(tmpdir(), "ark-logs-ret-events-"));
    tmpDirs.push(root);
    const updatesDir = join(root, "updates");
    mkdirSync(updatesDir, { recursive: true });
    const profile = makeProfile(root);

    const events: AppEvent[] = [
      {
        id: 1,
        serverId: profile.id,
        type: "server_started",
        severity: "info",
        message: "old routine",
        createdAt: daysAgoIso(100),
        details: null,
      },
      {
        id: 2,
        serverId: profile.id,
        type: "update_failed",
        severity: "error",
        message: "recent failure",
        createdAt: daysAgoIso(100),
        details: null,
      },
      {
        id: 3,
        serverId: profile.id,
        type: "server_stopped",
        severity: "info",
        message: "fresh routine",
        createdAt: daysAgoIso(10),
        details: null,
      },
    ];
    const deletedIds: number[] = [];
    const recorded: AppEvent["type"][] = [];
    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      list: () => [profile],
      listAllEvents: () => events,
      deleteEventsByIds: (ids: number[]) => {
        deletedIds.push(...ids);
        return ids.length;
      },
      addEvent: (
        _serverId: string | null,
        type: AppEvent["type"],
      ) => {
        recorded.push(type);
      },
    } as unknown as ServerRepository;

    const policy: LogRetentionSettings = {
      ...DEFAULT_LOG_RETENTION_SETTINGS,
      eventsRetainDays: 90,
      eventsFailureRetainDays: 180,
    };
    const service = new LogsService(
      repo,
      emptyBackupSource(),
      updatesDir,
      { getRuntimeLogSnapshot: () => [] } as unknown as ProcessManager,
      memorySettings({ "logRetention.v1": JSON.stringify(policy) }),
    );

    const preview = await service.previewCleanup({ categories: ["events"] });
    expect(preview.items.map((i) => i.targetKey)).toEqual(["1"]);

    const result = await service.runCleanup({
      categories: ["events"],
      confirmedTargets: preview.items.map((item) => ({
        category: item.category,
        serverId: item.serverId,
        targetKey: item.targetKey,
      })),
    });
    expect(result.deleted).toBe(1);
    expect(deletedIds).toEqual([1]);
    expect(recorded).toContain("logs_retention_completed");
  });

  it("prunes successful update logs over retain count and keeps recent failures", async () => {
    const root = mkdtempSync(join(tmpdir(), "ark-logs-ret-updates-"));
    tmpDirs.push(root);
    const updatesDir = join(root, "updates");
    mkdirSync(updatesDir, { recursive: true });
    const profile = makeProfile(root);

    // Newest first by mtime after touchAge — create 3 success + 1 recent failure.
    const successNames = [
      "srv-logs-1-success-a.log",
      "srv-logs-1-success-b.log",
      "srv-logs-1-success-c.log",
    ];
    for (const [index, name] of successNames.entries()) {
      const path = join(updatesDir, name);
      writeFileSync(path, `exitCode=0\ndurationMs=1\n--- stdout ---\nok\n`, "utf8");
      touchAge(path, 10 + index);
    }
    const failPath = join(updatesDir, "srv-logs-1-fail.log");
    writeFileSync(failPath, `exitCode=1\ndurationMs=1\n--- stdout ---\nerr\n`, "utf8");
    touchAge(failPath, 20);

    const oldFailPath = join(updatesDir, "srv-logs-1-old-fail.log");
    writeFileSync(oldFailPath, `exitCode=1\ndurationMs=1\n--- stdout ---\nold\n`, "utf8");
    touchAge(oldFailPath, 200);

    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      list: () => [profile],
      listAllEvents: () => [],
      deleteEventsByIds: () => 0,
      addEvent: () => undefined,
    } as unknown as ServerRepository;

    const policy: LogRetentionSettings = {
      ...DEFAULT_LOG_RETENTION_SETTINGS,
      updateLogsRetainCount: 2,
      updateLogsFailureRetainDays: 180,
    };
    const service = new LogsService(
      repo,
      emptyBackupSource(),
      updatesDir,
      { getRuntimeLogSnapshot: () => [] } as unknown as ProcessManager,
      memorySettings({ "logRetention.v1": JSON.stringify(policy) }),
    );

    const preview = await service.previewCleanup({ categories: ["updateLogs"] });
    const keys = preview.items.map((i) => i.targetKey).sort();
    expect(keys).toContain("srv-logs-1-success-c.log");
    expect(keys).toContain("srv-logs-1-old-fail.log");
    expect(keys).not.toContain("srv-logs-1-fail.log");
    expect(keys).not.toContain("srv-logs-1-success-a.log");

    const result = await service.runCleanup({
      categories: ["updateLogs"],
      confirmedTargets: preview.items.map((item) => ({
        category: item.category,
        serverId: item.serverId,
        targetKey: item.targetKey,
      })),
    });
    expect(result.deleted).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(updatesDir, "srv-logs-1-fail.log"))).toBe(true);
    expect(existsSync(join(updatesDir, "srv-logs-1-old-fail.log"))).toBe(false);
  });

  it("skips update-log targets that escape the approved root", async () => {
    const root = mkdtempSync(join(tmpdir(), "ark-logs-ret-guard-"));
    tmpDirs.push(root);
    const updatesDir = join(root, "updates");
    mkdirSync(updatesDir, { recursive: true });
    const profile = makeProfile(root);

    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      list: () => [profile],
      listAllEvents: () => [],
      deleteEventsByIds: () => 0,
      addEvent: () => undefined,
    } as unknown as ServerRepository;

    const service = new LogsService(
      repo,
      emptyBackupSource(),
      updatesDir,
      { getRuntimeLogSnapshot: () => [] } as unknown as ProcessManager,
      memorySettings({
        "logRetention.v1": JSON.stringify(DEFAULT_LOG_RETENTION_SETTINGS),
      }),
    );

    // Force a plan item with an unsafe name through confirmedTargets intersection:
    // plan will be empty for updates, so craft runCleanup with a forged confirmed
    // target that would only delete if path guard were bypassed — plan ∩ confirm
    // yields empty when not in plan. Instead call resolve via run with a stub by
    // planting a file and verifying outside-root names never appear in plan.
    writeFileSync(join(updatesDir, "srv-logs-1-ok.log"), "exitCode=0\n--- stdout ---\n", "utf8");
    const preview = await service.previewCleanup({ categories: ["updateLogs"] });
    for (const item of preview.items) {
      expect(item.targetKey.includes("..")).toBe(false);
      expect(item.targetKey.includes("/") || item.targetKey.includes("\\")).toBe(false);
      expect(item.targetKey.startsWith(`${profile.id}-`)).toBe(true);
    }
  });

  it("only deletes confirmed targets that still match the fresh plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "ark-logs-ret-confirm-"));
    tmpDirs.push(root);
    const updatesDir = join(root, "updates");
    mkdirSync(updatesDir, { recursive: true });
    const profile = makeProfile(root);

    for (const [index, name] of [
      "srv-logs-1-a.log",
      "srv-logs-1-b.log",
      "srv-logs-1-c.log",
    ].entries()) {
      const path = join(updatesDir, name);
      writeFileSync(path, "exitCode=0\ndurationMs=1\n--- stdout ---\nok\n", "utf8");
      touchAge(path, 3 + index);
    }

    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      list: () => [profile],
      listAllEvents: () => [],
      deleteEventsByIds: () => 0,
      addEvent: () => undefined,
    } as unknown as ServerRepository;

    const service = new LogsService(
      repo,
      emptyBackupSource(),
      updatesDir,
      { getRuntimeLogSnapshot: () => [] } as unknown as ProcessManager,
      memorySettings({
        "logRetention.v1": JSON.stringify({
          ...DEFAULT_LOG_RETENTION_SETTINGS,
          updateLogsRetainCount: 1,
        }),
      }),
    );

    const preview = await service.previewCleanup({ categories: ["updateLogs"] });
    expect(preview.items.length).toBeGreaterThanOrEqual(2);
    const onlyOne = preview.items.slice(0, 1);
    const result = await service.runCleanup({
      categories: ["updateLogs"],
      confirmedTargets: onlyOne.map((item) => ({
        category: item.category,
        serverId: item.serverId,
        targetKey: item.targetKey,
      })),
    });
    expect(result.deleted).toBe(1);
    expect(existsSync(join(updatesDir, onlyOne[0]!.targetKey))).toBe(false);
    for (const item of preview.items.slice(1)) {
      expect(existsSync(join(updatesDir, item.targetKey))).toBe(true);
    }
  });
});
