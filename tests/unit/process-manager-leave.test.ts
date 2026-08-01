import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerProfile } from "@shared/types";
import { LEFT_RUNNING_SCHEMA_VERSION } from "@shared/left-running";

function fakeChild(pid = 5555): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.assign(child, {
    pid,
    exitCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
    unref: vi.fn(),
  });
  return child;
}

function makeProfile(installDir: string): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "leave-server",
    name: "Leave Server",
    map: "TheIsland_WP",
    installDir,
    sessionName: "Leave Session",
    gamePort: 7777,
    queryPort: 27015,
    rconPort: 27020,
    serverPassword: null,
    adminPassword: "admin-pass",
    clusterId: null,
    clusterDir: null,
    extraArgs: [],
    mods: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("ProcessManager.detachForLeave", () => {
  let cleanupRoot: string | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (cleanupRoot !== null) {
      await rm(cleanupRoot, { recursive: true, force: true });
      cleanupRoot = null;
    }
  });

  it("persists pid, exe, start time, and command line then detaches without kill", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-leave-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    const binary = join(binaryDir, "ArkAscendedServer.exe");
    await writeFile(binary, "");

    const child = fakeChild(9876);
    const manager = new ProcessManager({
      spawnProcess: () => child,
    });
    const profile = makeProfile(cleanupRoot);
    manager.start(profile, { skipReadinessCheck: true });
    child.emit("spawn");
    expect(manager.isActive(profile.id)).toBe(true);

    const records = manager.detachForLeave([profile], {
      leftAt: "2026-07-31T15:00:00.000Z",
      queryOsIdentity: (pid) => ({
        pid,
        executablePath: binary,
        commandLine: `${binary} -port=7777`,
        osCreationTime: "20260731150000.000000-420",
      }),
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
      serverId: profile.id,
      pid: 9876,
      executablePath: binary,
      installDir: cleanupRoot,
      osCreationTime: "20260731150000.000000-420",
      osExecutablePath: binary,
      leftAt: "2026-07-31T15:00:00.000Z",
    });
    expect(records[0]?.startedAt).toMatch(/^\d{4}-/);
    expect(records[0]?.expectedCommandLine.toLowerCase()).toContain("arkascendedserver.exe");
    expect(records[0]?.launchArgs.length).toBeGreaterThan(0);

    expect(child.kill).not.toHaveBeenCalled();
    expect(child.unref).toHaveBeenCalled();
    expect(child.stdout?.destroyed).toBe(true);
    expect(child.stderr?.destroyed).toBe(true);
    expect(manager.isActive(profile.id)).toBe(false);
    expect(manager.getStatus(profile.id).status).toBe("stopped");
  });

  it("fails Leave when pid is missing", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-leave-nopid-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    await writeFile(join(binaryDir, "ArkAscendedServer.exe"), "");

    const child = fakeChild();
    Object.assign(child, { pid: undefined });
    const manager = new ProcessManager({
      spawnProcess: () => child,
    });
    const profile = makeProfile(cleanupRoot);
    manager.start(profile, { skipReadinessCheck: true });
    child.emit("spawn");

    expect(() =>
      manager.collectLeaveIdentities([profile], {
        queryOsIdentity: () => null,
      }),
    ).toThrow(/process id is unavailable/i);
    expect(manager.isActive(profile.id)).toBe(true);
  });

  it("fails Leave when OS creation time is unavailable", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-leave-nocreate-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    await writeFile(join(binaryDir, "ArkAscendedServer.exe"), "");

    const child = fakeChild(1111);
    const manager = new ProcessManager({
      spawnProcess: () => child,
    });
    const profile = makeProfile(cleanupRoot);
    manager.start(profile, { skipReadinessCheck: true });
    child.emit("spawn");

    expect(() =>
      manager.collectLeaveIdentities([profile], {
        queryOsIdentity: (pid) => ({
          pid,
          executablePath: join(binaryDir, "ArkAscendedServer.exe"),
          commandLine: "x",
          osCreationTime: null,
        }),
      }),
    ).toThrow(/creation time/i);
    expect(manager.isActive(profile.id)).toBe(true);
  });

  it("collectLeaveIdentities does not detach until detachAfterLeavePersist", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-leave-atomic-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    const binary = join(binaryDir, "ArkAscendedServer.exe");
    await writeFile(binary, "");

    const child = fakeChild(2222);
    const manager = new ProcessManager({
      spawnProcess: () => child,
    });
    const profile = makeProfile(cleanupRoot);
    manager.start(profile, { skipReadinessCheck: true });
    child.emit("spawn");

    const records = manager.collectLeaveIdentities([profile], {
      queryOsIdentity: (pid) => ({
        pid,
        executablePath: binary,
        commandLine: `${binary} -port=7777`,
        osCreationTime: "20260731150000.000000-420",
      }),
    });
    expect(records).toHaveLength(1);
    expect(manager.isActive(profile.id)).toBe(true);
    expect(child.unref).not.toHaveBeenCalled();

    manager.detachAfterLeavePersist(records);
    expect(manager.isActive(profile.id)).toBe(false);
    expect(child.unref).toHaveBeenCalled();
  });
});

describe("ProcessManager crash-recovery checkpoints", () => {
  let cleanupRoot: string | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (cleanupRoot !== null) {
      await rm(cleanupRoot, { recursive: true, force: true });
      cleanupRoot = null;
    }
  });

  it("writes a checkpoint on spawn and clears it on exit", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-checkpoint-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    const binary = join(binaryDir, "ArkAscendedServer.exe");
    await writeFile(binary, "");

    const checkpoints: unknown[] = [];
    const cleared: string[] = [];
    const child = fakeChild(4242);
    const manager = new ProcessManager({
      spawnProcess: () => child,
      queryOsIdentity: (pid) => ({
        pid,
        executablePath: binary,
        commandLine: `${binary} -port=7777`,
        osCreationTime: "20260731150000.000000-420",
      }),
      onProcessCheckpoint: (record) => {
        checkpoints.push(record);
      },
      onProcessCheckpointCleared: (serverId) => {
        cleared.push(serverId);
      },
    });
    const profile = makeProfile(cleanupRoot);
    manager.start(profile, { skipReadinessCheck: true });
    child.emit("spawn");

    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({
      schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
      serverId: profile.id,
      pid: 4242,
      osCreationTime: "20260731150000.000000-420",
    });

    child.emit("exit", 0);
    expect(cleared).toEqual([profile.id]);
    expect(manager.isActive(profile.id)).toBe(false);
  });

  it("clears the checkpoint on process error", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-checkpoint-err-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    const binary = join(binaryDir, "ArkAscendedServer.exe");
    await writeFile(binary, "");

    const cleared: string[] = [];
    const child = fakeChild(4243);
    const manager = new ProcessManager({
      spawnProcess: () => child,
      queryOsIdentity: (pid) => ({
        pid,
        executablePath: binary,
        commandLine: `${binary} -port=7777`,
        osCreationTime: "20260731150000.000000-420",
      }),
      onProcessCheckpoint: () => undefined,
      onProcessCheckpointCleared: (serverId) => {
        cleared.push(serverId);
      },
    });
    const profile = makeProfile(cleanupRoot);
    manager.start(profile, { skipReadinessCheck: true });
    child.emit("spawn");
    child.emit("error", new Error("spawn failed"));
    expect(cleared).toEqual([profile.id]);
  });

  it("clears the checkpoint when readiness times out and terminates", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-checkpoint-timeout-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    const binary = join(binaryDir, "ArkAscendedServer.exe");
    await writeFile(binary, "");

    const cleared: string[] = [];
    const child = fakeChild(4244);
    const manager = new ProcessManager({
      readyTimeoutMs: 30,
      readyPollMs: 10,
      spawnProcess: () => child,
      queryOsIdentity: (pid) => ({
        pid,
        executablePath: binary,
        commandLine: `${binary} -port=7777`,
        osCreationTime: "20260731150000.000000-420",
      }),
      onProcessCheckpoint: () => undefined,
      onProcessCheckpointCleared: (serverId) => {
        cleared.push(serverId);
      },
    });
    const profile = makeProfile(cleanupRoot);
    manager.start(profile);
    child.emit("spawn");
    await new Promise((r) => setTimeout(r, 80));
    expect(cleared).toContain(profile.id);
  });

  it("clears the checkpoint on kill even if the clear hook throws once", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-checkpoint-kill-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    const binary = join(binaryDir, "ArkAscendedServer.exe");
    await writeFile(binary, "");

    const cleared: string[] = [];
    let clearCalls = 0;
    const child = fakeChild(4245);
    const manager = new ProcessManager({
      spawnProcess: () => child,
      queryOsIdentity: (pid) => ({
        pid,
        executablePath: binary,
        commandLine: `${binary} -port=7777`,
        osCreationTime: "20260731150000.000000-420",
      }),
      onProcessCheckpoint: () => {
        throw new Error("checkpoint write boom");
      },
      onProcessCheckpointCleared: (serverId) => {
        clearCalls += 1;
        if (clearCalls === 1) {
          throw new Error("clear boom");
        }
        cleared.push(serverId);
      },
    });
    const profile = makeProfile(cleanupRoot);
    manager.start(profile, { skipReadinessCheck: true });
    child.emit("spawn");
    // Write hook threw — process still managed.
    expect(manager.isActive(profile.id)).toBe(true);
    manager.kill(profile.id);
    // First clear threw; kill still removed the process. Exit may clear again.
    child.emit("exit", 1);
    expect(clearCalls).toBeGreaterThanOrEqual(1);
    expect(manager.isActive(profile.id)).toBe(false);
  });
});
