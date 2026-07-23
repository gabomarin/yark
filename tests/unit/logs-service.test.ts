import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ServerProfile } from "@shared/types";
import { LogsService } from "@backend/domains/logs/logs-service";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import type { BackupRepository } from "@backend/infra/db/backup-repository";
import type { ProcessManager } from "@backend/infra/process/process-manager";

function makeProfile(installDir: string): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "srv-logs-1",
    name: "Logs Test",
    map: "TheIsland_WP",
    installDir,
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

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0, tmpDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("LogsService runtime logs", () => {
  it("incluye runtimeLogLines en listServerLogs", async () => {
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

    const backups = {
      listBackups: () => [],
    } as unknown as BackupRepository;

    const processes = {
      getRuntimeLogSnapshot: (_id: string, _limit?: number) => [
        "[2026-07-22T00:00:00.000Z] [stdout] server started",
      ],
    } as unknown as ProcessManager;

    const service = new LogsService(repo, backups, updatesDir, processes);
    const logs = await service.listServerLogs(profile.id);

    expect(logs.updateFiles.length).toBe(1);
    expect(logs.runtimeLogLines.length).toBe(1);
    expect(logs.runtimeLogLines[0]).toContain("server started");
  });

  it("exporta logs operativos a un archivo", async () => {
    const root = mkdtempSync(join(tmpdir(), "ark-logs-export-"));
    tmpDirs.push(root);
    const updatesDir = join(root, "updates");
    mkdirSync(updatesDir, { recursive: true });
    writeFileSync(join(updatesDir, "srv-logs-1-1.log"), "update output", "utf8");

    const profile = makeProfile(root);
    const repo = {
      get: (id: string) => (id === profile.id ? profile : null),
      recentEvents: () => [],
    } as unknown as ServerRepository;

    const backups = {
      listBackups: () => [],
    } as unknown as BackupRepository;

    const processes = {
      getRuntimeLogSnapshot: (_id: string, _limit?: number) => [
        "[2026-07-22T00:00:00.000Z] [stdout] server started",
      ],
    } as unknown as ProcessManager;

    const service = new LogsService(repo, backups, updatesDir, processes);
    const outFile = join(root, "logs-export.txt");
    const resultPath = await service.exportServerLogs(profile.id, outFile);

    expect(resultPath).toBe(outFile);
    const content = readFileSync(outFile, "utf8");
    expect(content).toContain("Logs operativos de srv-logs-1");
    expect(content).toContain("server started");
    expect(content).toContain("srv-logs-1-1.log");
    expect(content).toContain("update output");
  });
});
