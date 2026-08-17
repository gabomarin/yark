import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessManager } from "@backend/infra/process/process-manager";
import { reattachLeftRunningProcesses } from "@backend/infra/process/left-running-reattach";
import { writeLeftRunningProcesses, upsertLeftRunningProcess, removeLeftRunningProcess } from "@backend/infra/process/left-running-store";
import type { AppSettingsRepository } from "@backend/infra/db/app-settings-repository";
import type { ServerRepository } from "@backend/infra/db/server-repository";
import {
  LEFT_RUNNING_PROCESSES_SETTING_KEY,
  LEFT_RUNNING_SCHEMA_VERSION,
  type LeftRunningProcessIdentity,
} from "@shared/left-running";
import type { ServerProfile } from "@shared/types";

function fakeAdoptedChild(pid: number): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.assign(child, {
    pid,
    exitCode: null,
    stdout: null,
    stderr: null,
    kill: vi.fn(() => true),
    unref: vi.fn(),
  });
  return child;
}

function makeProfile(id: string, installDir: string): ServerProfile {
  const now = new Date().toISOString();
  return {
    id,
    name: "Reattach Server",
    map: "TheIsland_WP",
    installDir,
    enabled: true,
    autoStart: false,
    sessionName: "Reattach",
    maxPlayers: 70,
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

function makeSettings(): AppSettingsRepository {
  const store = new Map<string, string | null>();
  return {
    get: (key: string) => store.get(key) ?? null,
    set: (key: string, value: string | null) => {
      if (value === null) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    },
  } as AppSettingsRepository;
}

describe("reattachLeftRunningProcesses", () => {
  let cleanupRoot: string | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (cleanupRoot !== null) {
      await rm(cleanupRoot, { recursive: true, force: true });
      cleanupRoot = null;
    }
  });

  it("reattaches a matching leave record and clears metadata", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-reattach-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    const binary = join(binaryDir, "ArkAscendedServer.exe");
    await writeFile(binary, "");

    const profile = makeProfile("srv-reattach", cleanupRoot);
    const settings = makeSettings();
    const record: LeftRunningProcessIdentity = {
      schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
      serverId: profile.id,
      pid: 4242,
      executablePath: binary,
      installDir: cleanupRoot,
      startedAt: "2026-07-31T12:00:00.000Z",
      expectedCommandLine: `"${binary}" -port=7777`,
      launchArgs: ["-port=7777"],
      osCreationTime: "20260731120000.000000-420",
      osExecutablePath: binary,
      leftAt: "2026-07-31T12:05:00.000Z",
    };
    writeLeftRunningProcesses(settings, [record]);

    const repo = {
      get: vi.fn((id: string) => (id === profile.id ? profile : null)),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;

    const manager = new ProcessManager({
      createAdoptedChild: fakeAdoptedChild,
      spawnProcess: () => {
        throw new Error("spawn should not run during reattach");
      },
      onProcessCheckpoint: (next) => {
        upsertLeftRunningProcess(settings, next);
      },
      onProcessCheckpointCleared: (serverId) => {
        removeLeftRunningProcess(settings, serverId);
      },
      queryOsIdentity: async (pid) => ({
        pid,
        executablePath: binary,
        commandLine: `"${binary}" -port=7777`,
        osCreationTime: "20260731120000.000000-420",
      }),
    });

    const outcomes = await reattachLeftRunningProcesses(settings, repo, manager, {
      queryOsIdentity: async (pid) => ({
        pid,
        executablePath: binary,
        commandLine: `"${binary}" -port=7777`,
        osCreationTime: "20260731120000.000000-420",
      }),
    });

    expect(outcomes).toEqual([
      { serverId: profile.id, classification: "match", reattached: true },
    ]);
    expect(manager.isActive(profile.id)).toBe(true);
    expect(manager.getStatus(profile.id).status).toBe("starting");
    expect(manager.getStatus(profile.id).pid).toBe(4242);
    // Successful reattach rewrites the checkpoint (not a wipe-before-adopt).
    const rewritten = JSON.parse(
      settings.get(LEFT_RUNNING_PROCESSES_SETTING_KEY) as string,
    ) as LeftRunningProcessIdentity[];
    expect(rewritten).toHaveLength(1);
    expect(rewritten[0]?.pid).toBe(4242);
    expect(rewritten[0]?.serverId).toBe(profile.id);
    expect(repo.addEvent).toHaveBeenCalledWith(
      profile.id,
      "server_started",
      "info",
      expect.stringContaining("Reattached"),
    );
  });

  it("restores checkpoint runtimePorts on reattach instead of saved profile ports", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-reattach-ports-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    const binary = join(binaryDir, "ArkAscendedServer.exe");
    await writeFile(binary, "");

    const profile = makeProfile("srv-session-ports", cleanupRoot);
    const sessionPorts = {
      gamePort: 7787,
      queryPort: 27025,
      rconPort: 27030,
    };
    const manager = new ProcessManager({
      createAdoptedChild: fakeAdoptedChild,
      spawnProcess: () => {
        throw new Error("spawn should not run during reattach");
      },
      queryOsIdentity: async (pid) => ({
        pid,
        executablePath: binary,
        commandLine: `"${binary}" -port=7787`,
        osCreationTime: "20260731120000.000000-420",
      }),
    });

    await manager.reattach(
      profile,
      {
        schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
        serverId: profile.id,
        pid: 5150,
        executablePath: binary,
        installDir: cleanupRoot,
        startedAt: "2026-07-31T12:00:00.000Z",
        expectedCommandLine: `"${binary}" -port=7787`,
        launchArgs: ["-port=7787"],
        runtimePorts: sessionPorts,
        osCreationTime: "20260731120000.000000-420",
        osExecutablePath: binary,
        leftAt: "2026-07-31T12:05:00.000Z",
      },
      { skipReadinessCheck: true },
    );

    expect(manager.getRuntimePorts(profile.id)).toEqual(sessionPorts);
    expect(manager.applyRuntimePorts(profile).rconPort).toBe(27030);
    expect(manager.applyRuntimePorts(profile).gamePort).not.toBe(profile.gamePort);
  });

  it("keeps checkpoint when adopt fails after a match", async () => {
    const settings = makeSettings();
    const record: LeftRunningProcessIdentity = {
      schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
      serverId: "srv-keep",
      pid: 4242,
      executablePath: "C:\\ARK\\ArkAscendedServer.exe",
      installDir: "C:\\ARK",
      startedAt: "2026-07-31T12:00:00.000Z",
      expectedCommandLine: "x",
      launchArgs: [],
      osCreationTime: "20260731120000.000000-420",
      osExecutablePath: "C:\\ARK\\ArkAscendedServer.exe",
      leftAt: "2026-07-31T12:05:00.000Z",
    };
    writeLeftRunningProcesses(settings, [record]);
    const profile = makeProfile("srv-keep", "C:\\ARK");
    const repo = {
      get: vi.fn(() => profile),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const manager = new ProcessManager({
      createAdoptedChild: () => {
        throw new Error("adopt failed");
      },
    });

    const outcomes = await reattachLeftRunningProcesses(settings, repo, manager, {
      queryOsIdentity: async (pid) => ({
        pid,
        executablePath: record.executablePath,
        commandLine: record.expectedCommandLine,
        osCreationTime: record.osCreationTime,
      }),
    });

    expect(outcomes[0]).toMatchObject({
      reattached: false,
      classification: "inaccessible",
    });
    expect(settings.get(LEFT_RUNNING_PROCESSES_SETTING_KEY)).toBe(
      JSON.stringify([record]),
    );
  });

  it("clears stale leave metadata without adopting", async () => {
    const settings = makeSettings();
    const record: LeftRunningProcessIdentity = {
      schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
      serverId: "srv-gone",
      pid: 99,
      executablePath: "C:\\ARK\\ArkAscendedServer.exe",
      installDir: "C:\\ARK",
      startedAt: "2026-07-31T12:00:00.000Z",
      expectedCommandLine: "x",
      launchArgs: [],
      osCreationTime: "20260731120000.000000-420",
      osExecutablePath: "C:\\ARK\\ArkAscendedServer.exe",
      leftAt: "2026-07-31T12:05:00.000Z",
    };
    writeLeftRunningProcesses(settings, [record]);
    const repo = {
      get: vi.fn(() => null),
      addEvent: vi.fn(),
    } as unknown as ServerRepository;
    const manager = new ProcessManager();

    const outcomes = await reattachLeftRunningProcesses(settings, repo, manager, {
      queryOsIdentity: async () => null,
    });

    expect(outcomes[0]?.reattached).toBe(false);
    expect(settings.get(LEFT_RUNNING_PROCESSES_SETTING_KEY)).toBeNull();
  });
});
