import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ServerProfile } from "@shared/types";
import { LogsService, type BackupLogSource } from "@backend/domains/logs/logs-service";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { ProcessManager } from "@backend/infra/process/process-manager";

function makeProfile(installDir: string): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "srv-logs-1",
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

    const service = new LogsService(repo, emptyBackupSource(), updatesDir, processes);
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

    const service = new LogsService(repo, emptyBackupSource(), updatesDir, processes);
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

    const service = new LogsService(repo, emptyBackupSource(), updatesDir, processes);
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
