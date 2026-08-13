import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessManager } from "@backend/infra/process/process-manager";
import { AsaSavedLogsTailer } from "@backend/infra/process/asa-log-tail";
import type { ServerProfile } from "@shared/types";

function fakeChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  let exitCode: number | null = null;
  let signalCode: NodeJS.Signals | null = null;
  child.on("exit", (code, signal) => {
    exitCode = code;
    signalCode = signal;
  });
  Object.assign(child, {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  Object.defineProperty(child, "exitCode", {
    configurable: true,
    get: () => exitCode,
    set: (value: number | null) => {
      exitCode = value;
    },
  });
  Object.defineProperty(child, "signalCode", {
    configurable: true,
    get: () => signalCode,
    set: (value: NodeJS.Signals | null) => {
      signalCode = value;
    },
  });
  Object.assign(child, {
    resetExitObservation: () => {
      exitCode = null;
      signalCode = null;
    },
  });
  return child;
}

function makeProfile(installDir: string): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "lifecycle-server",
    name: "Lifecycle Server",
    map: "TheIsland_WP",
    installDir,
    enabled: true,
    autoStart: false,
    sessionName: "Lifecycle Session",
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

describe("ProcessManager lifecycle ownership", () => {
  let cleanupRoot: string | null = null;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (cleanupRoot !== null) {
      await rm(cleanupRoot, { recursive: true, force: true });
      cleanupRoot = null;
    }
  });

  it("stops capture and ignores late events when a killed server restarts quickly", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-process-lifecycle-"));
    const binaryDir = join(
      cleanupRoot,
      "ShooterGame",
      "Binaries",
      "Win64",
    );
    await mkdir(binaryDir, { recursive: true });
    await writeFile(join(binaryDir, "ArkAscendedServer.exe"), "");

    const first = fakeChild();
    const second = fakeChild();
    const children = [first, second];
    const stopTailer = vi.spyOn(AsaSavedLogsTailer.prototype, "stop");
    const manager = new ProcessManager({
      spawnProcess: () => children.shift()!,
    });
    const profile = makeProfile(cleanupRoot);

    manager.start(profile, { skipReadinessCheck: true });
    first.emit("spawn");
    expect(manager.getStatus(profile.id).status).toBe("running");

    const stopsBeforeKill = stopTailer.mock.calls.length;
    await manager.kill(profile.id);
    expect(stopTailer).toHaveBeenCalledTimes(stopsBeforeKill + 1);

    manager.start(profile, { skipReadinessCheck: true });
    second.emit("spawn");
    expect(manager.getStatus(profile.id).status).toBe("running");

    first.stdout?.emit("data", "late output from old process\n");
    first.emit("exit", 0);

    expect(manager.getStatus(profile.id).status).toBe("running");
    expect(manager.getRuntimeLogSnapshot(profile.id)).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("late output from old process"),
      ]),
    );

    await manager.kill(profile.id);
  });

  it("tails ShooterGame.log with native console and keeps Runtime until the next start", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-process-lifecycle-"));
    const binaryDir = join(cleanupRoot, "ShooterGame", "Binaries", "Win64");
    await mkdir(binaryDir, { recursive: true });
    await writeFile(join(binaryDir, "ArkAscendedServer.exe"), "");
    const logsDir = join(cleanupRoot, "ShooterGame", "Saved", "Logs");
    await mkdir(logsDir, { recursive: true });
    await writeFile(
      join(logsDir, "ShooterGame.log"),
      [
        "ASAMods: Error: Not all mods were installed. Check the log for CFCore errors.",
        "If you have any Custom Cosmetics in the mod list please remove them.",
        "Attempting to install pc-only mods on a cross-platform server will also fail to install.",
        "Mods not installed: 1039450",
        "",
      ].join("\n"),
    );

    const first = fakeChild();
    const second = fakeChild();
    const children = [first, second];
    const startTailer = vi.spyOn(AsaSavedLogsTailer.prototype, "start");
    const manager = new ProcessManager({
      spawnProcess: () => children.shift()!,
    });
    const profile = makeProfile(cleanupRoot);

    manager.start(profile, { openNativeConsole: true });
    expect(startTailer).toHaveBeenCalled();
    first.emit("spawn");
    first.emit("exit", 0);

    expect(manager.getStatus(profile.id).status).toBe("error");
    expect(manager.getStatus(profile.id).lastError).toContain("1039450");
    expect(manager.getRuntimeLogSnapshot(profile.id).join("\n")).toContain(
      "Not all mods were installed",
    );

    manager.start(profile, { openNativeConsole: true });
    expect(
      manager.getRuntimeLogSnapshot(profile.id).join("\n"),
    ).not.toContain("Not all mods were installed");
    second.emit("spawn");
    await manager.kill(profile.id);
  });

  it("reports error with live child as active until exit is observed", async () => {
    cleanupRoot = await mkdtemp(join(tmpdir(), "yark-process-lifecycle-"));
    const binaryDir = join(cleanupRoot, "ShooterGame", "Binaries", "Win64");
    await mkdir(binaryDir, { recursive: true });
    await writeFile(join(binaryDir, "ArkAscendedServer.exe"), "");

    const child = fakeChild();
    const manager = new ProcessManager({
      spawnProcess: () => child,
    });
    const profile = makeProfile(cleanupRoot);

    manager.start(profile, { skipReadinessCheck: true });
    child.emit("spawn");
    expect(manager.isActive(profile.id)).toBe(true);

    child.emit("exit", 1);
    expect(manager.getStatus(profile.id).status).toBe("error");
    expect(manager.getStatus(profile.id).processLive).toBe(false);
    expect(manager.hasLiveProcess(profile.id)).toBe(false);
    expect(manager.isActive(profile.id)).toBe(false);

    (child as ChildProcess & { resetExitObservation: () => void }).resetExitObservation();
    expect(manager.hasLiveProcess(profile.id)).toBe(true);
    expect(manager.isActive(profile.id)).toBe(true);
  });
});
