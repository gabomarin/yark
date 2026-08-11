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
    enabled: true,
    autoStart: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe("ProcessManager real start (Windows)", () => {
  let installDir: string | null = null;

  afterEach(async () => {
    if (installDir !== null) {
      const target = installDir;
      installDir = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          await rm(target, { recursive: true, force: true });
          return;
        } catch (error) {
          lastError = error;
          const code =
            error !== null && typeof error === "object" && "code" in error
              ? String((error as { code?: unknown }).code)
              : "";
          if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
      throw lastError;
    }
  });

  async function runStartProof(
    serverInstallDir: string,
    cleanupRoot: string,
  ): Promise<void> {
    const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows";
    const pingExe = join(systemRoot, "System32", "PING.EXE");

    await access(pingExe, fsConstants.F_OK);

    installDir = cleanupRoot;
    const binaryDir = join(serverInstallDir, "ShooterGame", "Binaries", "Win64");
    await mkdir(binaryDir, { recursive: true });

    const fakeAsaBinary = join(binaryDir, "ArkAscendedServer.exe");
    await cp(pingExe, fakeAsaBinary);

    const manager = new ProcessManager();
    const profile = makeProfile(serverInstallDir);

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

    const pid = manager.getStatus(profile.id).pid;
    expect(pid).not.toBeNull();
    // Direct spawn: tracked pid must be the fake ASA binary, not cmd.exe.
    const tasklist = spawnSync(
      "tasklist",
      ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
      { encoding: "utf8", windowsHide: true },
    );
    expect(String(tasklist.stdout)).toMatch(/ArkAscendedServer\.exe/i);
    expect(String(tasklist.stdout)).not.toMatch(/cmd\.exe/i);

    await manager.kill(profile.id);

    const reachedStopped = await waitFor(
      () => manager.getStatus(profile.id).status === "stopped",
      5_000,
      200,
    );
    expect(reachedStopped).toBe(true);
  }

  it.skipIf(!IS_WINDOWS)("starts a real process using ASA binary path and reaches running status", async () => {
    const root = await mkdtemp(join(tmpdir(), "ark-start-proof-"));
    await runStartProof(root, root);
  }, 40_000);

  it.skipIf(!IS_WINDOWS)("starts when install path contains spaces (no cmd wrapper)", async () => {
    const parent = await mkdtemp(join(tmpdir(), "ark-start-spaced-"));
    const spaced = join(parent, "path with spaces");
    await mkdir(spaced, { recursive: true });
    await runStartProof(spaced, parent);
  }, 40_000);
});
