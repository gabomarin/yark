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
  Object.assign(child, {
    exitCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
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
    manager.kill(profile.id);
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

    manager.kill(profile.id);
  });
});
