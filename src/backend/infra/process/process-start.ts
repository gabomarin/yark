import { type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type {
  ServerProfile,
  ServerStatus,
  SessionPortSet,
  StartServerOptions,
} from "@shared/types";
import {
  buildLaunchArgs,
  buildWindowsCreateProcessCommandLine,
  serverBinaryPath,
} from "../../domains/instances/launch-args";
import {
  AsaSavedLogsTailer,
  captureAsaLogSessionAnchor,
  type AsaLogSessionAnchor,
} from "./asa-log-tail";
import { ensureLaunchLogFlags, type spawnAsaProcess } from "./process-spawn";
import type { RuntimeLogSource } from "./process-readiness";

/** Managed-process fields created and wired by {@link startManagedProcess}. */
export interface ProcessStartManaged {
  child: ChildProcess;
  identity: object;
  status: ServerStatus;
  startedAt: string;
  lastError: string | null;
  readinessGeneration: number;
  logTailer: AsaSavedLogsTailer | null;
  logSessionAnchor: AsaLogSessionAnchor;
  executablePath: string;
  installDir: string;
  launchArgs: string[];
  expectedCommandLine: string;
  runtimePorts: SessionPortSet;
}

export interface ProcessStartHost {
  isActive(serverId: string): boolean;
  clearRuntimeLog(serverId: string): void;
  spawnProcess: typeof spawnAsaProcess;
  appendRuntimeLog(serverId: string, source: string, message: string): void;
  registerManaged(serverId: string, managed: ProcessStartManaged): void;
  getManaged(serverId: string): ProcessStartManaged | undefined;
  captureRuntimeChunk(
    serverId: string,
    source: RuntimeLogSource,
    chunk: string,
  ): void;
  emitStatus(serverId: string): void;
  writeProcessCheckpoint(
    serverId: string,
    managed: ProcessStartManaged,
  ): Promise<void>;
  waitUntilReady(
    profile: ServerProfile,
    managed: ProcessStartManaged,
    generation: number,
  ): Promise<void>;
  flushRuntimePartials(serverId: string): void;
  clearProcessCheckpoint(serverId: string): void;
  onManagedExit(
    serverId: string,
    managed: ProcessStartManaged,
    code: number | null,
  ): void;
}

/**
 * Spawn ASA, register the managed entry, wire stdio/log capture, and kick off
 * readiness (or skip when requested). ProcessManager keeps a thin facade.
 */
export function startManagedProcess(
  host: ProcessStartHost,
  profile: ServerProfile,
  options?: StartServerOptions,
): void {
  if (host.isActive(profile.id)) {
    throw new Error(`Server "${profile.name}" is already running`);
  }
  const binary = serverBinaryPath(profile.installDir);
  if (!existsSync(binary)) {
    throw new Error(
      `Server executable not found at: ${binary}`,
    );
  }

  host.clearRuntimeLog(profile.id);
  const logSessionAnchor = captureAsaLogSessionAnchor(profile.installDir);
  const args = options?.launchArgsOverride ?? buildLaunchArgs(profile);
  const nativeConsole = options?.openNativeConsole === true;
  let spawnArgs = args;
  if (options?.launchArgsOverride === undefined) {
    spawnArgs = ensureLaunchLogFlags(spawnArgs, nativeConsole);
  }
  const expectedCommandLine =
    process.platform === "win32"
      ? buildWindowsCreateProcessCommandLine(binary, spawnArgs)
      : [binary, ...spawnArgs].join(" ");
  const child = host.spawnProcess(binary, spawnArgs, profile.installDir, {
    nativeConsole,
  });

  host.appendRuntimeLog(profile.id, "system", `Starting process ${binary}`);
  host.appendRuntimeLog(profile.id, "system", `Commandline: ${expectedCommandLine}`);
  host.appendRuntimeLog(
    profile.id,
    "system",
    nativeConsole
      ? "Native server console opened; Runtime follows ShooterGame.log"
      : "Piped mode: following ShooterGame/Saved/Logs for Runtime",
  );
  const managed: ProcessStartManaged = {
    child,
    identity: {},
    status: "starting",
    startedAt: new Date().toISOString(),
    lastError: null,
    readinessGeneration: 0,
    logTailer: null,
    logSessionAnchor,
    executablePath: binary,
    installDir: profile.installDir,
    launchArgs: [...spawnArgs],
    expectedCommandLine,
    runtimePorts: {
      gamePort: profile.gamePort,
      queryPort: profile.queryPort,
      rconPort: profile.rconPort,
    },
  };
  host.registerManaged(profile.id, managed);
  if (child.stdout !== null) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (host.getManaged(profile.id) !== managed) return;
      host.captureRuntimeChunk(profile.id, "stdout", chunk);
    });
  }
  if (child.stderr !== null) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (host.getManaged(profile.id) !== managed) return;
      host.captureRuntimeChunk(profile.id, "stderr", chunk);
    });
  }
  managed.logTailer = new AsaSavedLogsTailer(
    profile.installDir,
    (text) => {
      if (host.getManaged(profile.id) !== managed) return;
      host.captureRuntimeChunk(profile.id, "log", text);
    },
  );
  managed.logTailer.start(managed.logSessionAnchor);
  host.emitStatus(profile.id);

  child.once("spawn", () => {
    if (
      host.getManaged(profile.id) !== managed ||
      managed.status !== "starting"
    ) {
      return;
    }
    host.appendRuntimeLog(
      profile.id,
      "system",
      "Process created; waiting for server readiness (RCON / startup)",
    );
    void host.writeProcessCheckpoint(profile.id, managed);
    host.emitStatus(profile.id);

    if (options?.skipReadinessCheck === true) {
      managed.status = "running";
      host.appendRuntimeLog(
        profile.id,
        "system",
        "Readiness skipped (skipReadinessCheck); status running",
      );
      host.emitStatus(profile.id);
      return;
    }

    managed.readinessGeneration += 1;
    void host.waitUntilReady(profile, managed, managed.readinessGeneration);
  });

  child.once("error", (err) => {
    managed.readinessGeneration += 1;
    managed.logTailer?.stop();
    managed.logTailer = null;
    if (host.getManaged(profile.id) !== managed) return;
    host.flushRuntimePartials(profile.id);
    managed.status = "error";
    managed.lastError = err.message;
    host.appendRuntimeLog(profile.id, "error", `Process error: ${err.message}`);
    host.clearProcessCheckpoint(profile.id);
    host.emitStatus(profile.id);
  });

  child.once("exit", (code) => {
    host.onManagedExit(profile.id, managed, code);
  });
}
