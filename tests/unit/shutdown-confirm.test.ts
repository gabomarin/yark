import type { ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ServerProfile } from "@shared/types";
import type { AsaLogSessionAnchor } from "@backend/infra/process/asa-log-tail";
import {
  beginGracefulStop,
  finishGracefulStop,
  type ProcessGracefulStopHost,
} from "@backend/infra/process/process-graceful-stop";
import type { ProcessStartManaged } from "@backend/infra/process/process-start";
import {
  assessShutdownLog,
  describeWorldSaveCheck,
  readPrimaryWorldSaveStamp,
  SHUTDOWN_EXIT_TIMEOUT_MS,
  waitForCleanShutdown,
  type WorldSaveStamp,
} from "@backend/infra/process/shutdown-confirm";

const MARK: AsaLogSessionAnchor = { identity: "log", size: 100, mtimeMs: 0 };

const CLOSING = "[2026.11.04-04.32.50:620][905]Closing by request";
const MUTEX = "[2026.11.04-04.32.50:620][905]DestroyASAClustersFolderMutex: mutex handle (owned) has been closed.";
const CLOSED = "[2026.11.03-21.00.35:989][ 87]Log file closed, 11/03/26 15:00:35";

describe("assessShutdownLog", () => {
  it("treats Closing by request as an unfinished shutdown", () => {
    expect(assessShutdownLog(`${CLOSING}\n${MUTEX}`)).toEqual({
      closingRequested: true,
      logFileClosed: false,
    });
  });

  it("treats Log file closed as a finished shutdown", () => {
    expect(assessShutdownLog(`${CLOSING}\n${MUTEX}\n${CLOSED}`)).toEqual({
      closingRequested: true,
      logFileClosed: true,
    });
  });
});

describe("waitForCleanShutdown", () => {
  it("returns when the log closes, without waiting out the cap", async () => {
    let slept = 0;
    const result = await waitForCleanShutdown({
      readLog: () => `${CLOSING}\n${CLOSED}`,
      hasExited: () => false,
      now: () => 0,
      sleep: async () => {
        slept += 1;
      },
    });
    expect(result).toBe("log-closed");
    expect(slept).toBe(0);
  });

  it("keeps waiting past 30s while the log is still on Closing by request", async () => {
    let t = 0;
    const result = await waitForCleanShutdown({
      readLog: () => `${CLOSING}\n${MUTEX}`,
      hasExited: () => false,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      timeoutMs: 60_000,
      pollMs: 500,
    });
    expect(result).toBe("timeout");
    expect(t).toBeGreaterThanOrEqual(60_000);
  });

  it("returns when the process exits during Closing by request", async () => {
    let t = 0;
    const result = await waitForCleanShutdown({
      readLog: () => `${CLOSING}\n${MUTEX}`,
      hasExited: () => t >= 45_000,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      timeoutMs: SHUTDOWN_EXIT_TIMEOUT_MS,
      pollMs: 500,
    });
    expect(result).toBe("exited");
    expect(t).toBeGreaterThanOrEqual(45_000);
    expect(t).toBeLessThan(60_000);
  });
});

function managedProcess(): ProcessStartManaged {
  return {
    child: { exitCode: null } as ChildProcess,
    identity: { pid: 42 },
    status: "running",
    startedAt: "2026-01-01T00:00:00.000Z",
    lastError: null,
    readinessGeneration: 0,
    logTailer: null,
    logSessionAnchor: MARK,
    executablePath: "ArkAscendedServer.exe",
    installDir: "C:\\ARK",
    launchArgs: [],
    expectedCommandLine: "",
    runtimePorts: { gamePort: 7777, queryPort: 27015, rconPort: 27020 },
    asaApiLoading: false,
  };
}

function stopHost(
  managed: ProcessStartManaged,
  readLogSince: () => string,
  extra?: Partial<ProcessGracefulStopHost>,
): ProcessGracefulStopHost & { logs: string[]; commands: string[] } {
  const logs: string[] = [];
  const commands: string[] = [];
  return {
    logs,
    commands,
    getManaged: () => managed,
    appendRuntimeLog: (_id, _source, message) => {
      logs.push(message);
    },
    emitStatus: vi.fn(),
    executeRcon: vi.fn(async (_profile, command: string) => {
      commands.push(command);
      return "";
    }),
    waitForExit: vi.fn(async () => true),
    stopManagedCapture: vi.fn(),
    deleteManaged: vi.fn(),
    clearProcessCheckpoint: vi.fn(),
    terminateManaged: vi.fn(async () => undefined),
    captureLogMark: () => MARK,
    readLogSince,
    readWorldSaveStamp: () => null,
    ...extra,
  };
}

function stopHandle(identity: object, worldSave: WorldSaveStamp | null = null) {
  return { serverId: "srv-1", identity, worldSave };
}

const profile = { id: "srv-1", installDir: "C:\\ARK" } as ServerProfile;

describe("beginGracefulStop", () => {
  it("sends SaveWorld and does not kill while the log has no save line", async () => {
    const managed = managedProcess();
    const host = stopHost(managed, () => `${CLOSING}\n${MUTEX}`);
    await expect(beginGracefulStop(host, profile)).resolves.toEqual({
      phase: "saved",
      handle: stopHandle(managed.identity),
    });
    expect(host.commands).toEqual(["SaveWorld"]);
    expect(host.logs).toContain("SaveWorld sent");
    expect(host.terminateManaged).not.toHaveBeenCalled();
  });
});

describe("finishGracefulStop", () => {
  it("does not force-kill when the log closes", async () => {
    const managed = managedProcess();
    const host = stopHost(managed, () => `${CLOSING}\n${MUTEX}\n${CLOSED}`);
    await expect(finishGracefulStop(host, profile, stopHandle(managed.identity))).resolves.toBe("stopped");
    expect(host.commands).toEqual(["DoExit"]);
    expect(host.terminateManaged).not.toHaveBeenCalled();
    expect(host.logs).toContain("ShooterGame.log closed");
  });

  it("does not force-kill at 30s while Closing by request is the last line", async () => {
    const managed = managedProcess();
    let release: () => void = () => undefined;
    const slept = new Promise<void>((resolve) => {
      release = resolve;
    });
    let gone = false;
    const host = stopHost(managed, () => `${CLOSING}\n${MUTEX}`, {
      sleep: () => slept,
      now: () => 0,
      getManaged: () => (gone ? undefined : managed),
    });
    const pending = finishGracefulStop(host, profile, stopHandle(managed.identity));
    await vi.waitFor(() => {
      expect(host.commands).toEqual(["DoExit"]);
    });
    expect(host.terminateManaged).not.toHaveBeenCalled();
    gone = true;
    release();
    await expect(pending).resolves.toBe("stopped");
    expect(host.terminateManaged).not.toHaveBeenCalled();
  });

  it("force-kills only after the shutdown cap when the log never closes", async () => {
    const managed = managedProcess();
    let t = 0;
    const host = stopHost(managed, () => `${CLOSING}\n${MUTEX}`, {
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });
    await expect(finishGracefulStop(host, profile, stopHandle(managed.identity))).resolves.toBe("stopped");
    expect(t).toBeGreaterThanOrEqual(SHUTDOWN_EXIT_TIMEOUT_MS);
    expect(host.terminateManaged).toHaveBeenCalledTimes(1);
    expect(host.logs).toContain("Server did not finish closing (no Log file closed); forcing shutdown");
  });

  it("reports when the map ark file is newer than the pre-save stamp", async () => {
    const managed = managedProcess();
    const before = { fileName: "LostColony_WP.ark", mtimeMs: Date.parse("2026-11-04T05:00:00.000Z") };
    const after = { fileName: "LostColony_WP.ark", mtimeMs: Date.parse("2026-11-04T05:13:50.000Z") };
    const host = stopHost(managed, () => `${CLOSING}\n${CLOSED}`, {
      readWorldSaveStamp: () => after,
    });
    await finishGracefulStop(host, profile, stopHandle(managed.identity, before));
    expect(host.logs).toContain("LostColony_WP.ark updated (2026-11-04T05:13:50.000Z)");
    expect(host.terminateManaged).not.toHaveBeenCalled();
  });

  it("warns when the map ark file still has the pre-save timestamp", async () => {
    const managed = managedProcess();
    const stamp = { fileName: "LostColony_WP.ark", mtimeMs: Date.parse("2026-11-04T05:00:00.000Z") };
    const host = stopHost(managed, () => `${CLOSING}\n${CLOSED}`, {
      readWorldSaveStamp: () => stamp,
    });
    await finishGracefulStop(host, profile, stopHandle(managed.identity, stamp));
    expect(host.logs).toContain("LostColony_WP.ark was not updated (still 2026-11-04T05:00:00.000Z)");
  });
});

describe("readPrimaryWorldSaveStamp", () => {
  it("reads LostColony_WP.ark from the launch-token folder", () => {
    const root = mkdtempSync(join(tmpdir(), "yark-ark-stamp-"));
    const file = join(root, "ShooterGame", "Saved", "SavedArks", "LostColony_WP", "LostColony_WP.ark");
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "world");
    const writtenAt = new Date("2026-11-04T05:13:50.000Z");
    utimesSync(file, writtenAt, writtenAt);
    const stamp = readPrimaryWorldSaveStamp({ installDir: root, map: "LostColony_WP" });
    expect(stamp?.fileName).toBe("LostColony_WP.ark");
    expect(stamp?.mtimeMs).toBeGreaterThan(writtenAt.getTime() - 2000);
  });

  it("finds the ark in the folder without the _WP suffix", () => {
    const root = mkdtempSync(join(tmpdir(), "yark-ark-stamp-"));
    const file = join(root, "ShooterGame", "Saved", "SavedArks", "LostColony", "LostColony_WP.ark");
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "world");
    expect(readPrimaryWorldSaveStamp({ installDir: root, map: "LostColony_WP" })?.fileName).toBe("LostColony_WP.ark");
  });
});

describe("describeWorldSaveCheck", () => {
  it("says the file was not checked when it was missing before the save", () => {
    expect(describeWorldSaveCheck(null, null).message).toBe(
      "World save file was not found; its timestamp was not checked",
    );
  });
});
