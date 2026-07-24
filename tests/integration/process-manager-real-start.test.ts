import { access, cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ProcessManager } from "@backend/infra/process/process-manager";
import type { ServerProfile } from "@shared/types";

const IS_WINDOWS = process.platform === "win32";

async function waitFor(
  condition: () => boolean,
  timeoutMs: number,
  stepMs = 250,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return condition();
}

function makeProfile(installDir: string): ServerProfile {
  const now = new Date().toISOString();
  return {
    id: "probe-server-id",
    name: "Probe Server",
    map: "TheIsland_WP",
    installDir,
    sessionName: "Probe Session",
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

describe("ProcessManager real start (Windows)", () => {
  let installDir: string | null = null;

  afterEach(async () => {
    if (installDir !== null) {
      await rm(installDir, { recursive: true, force: true });
      installDir = null;
    }
  });

  it.skipIf(!IS_WINDOWS)("starts a real process using ASA binary path and reaches running status", async () => {
    const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows";
    const pingExe = join(systemRoot, "System32", "PING.EXE");

    await access(pingExe, fsConstants.F_OK);

    installDir = await mkdtemp(join(tmpdir(), "ark-start-proof-"));
    const binaryDir = join(installDir, "ShooterGame", "Binaries", "Win64");
    await mkdir(binaryDir, { recursive: true });

    const fakeAsaBinary = join(binaryDir, "ArkAscendedServer.exe");
    await cp(pingExe, fakeAsaBinary);

    const manager = new ProcessManager();
    const profile = makeProfile(installDir);

    manager.start(profile, {
      launchArgsOverride: ["-t", "127.0.0.1"],
      skipReadinessCheck: true,
    });

    const reachedRunning = await waitFor(
      () => manager.getStatus(profile.id).status === "running",
      25_000,
      500,
    );
    expect(reachedRunning).toBe(true);

    manager.kill(profile.id);

    const reachedStopped = await waitFor(
      () => manager.getStatus(profile.id).status === "stopped",
      5_000,
      200,
    );
    expect(reachedStopped).toBe(true);
  }, 40_000);
});
