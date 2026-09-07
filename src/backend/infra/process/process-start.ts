import { type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type {
  ServerProfile,
  ServerStatus,
  SessionPortSet,
  StartServerOptions,
} from "@shared/types";
import {
  resolveAsaApiInjectMode,
  syncAsaApiVersionDll,
} from "../../domains/asa-api/asa-api-inject";
import {
  buildLaunchArgs,
  buildWindowsCreateProcessCommandLine,
  resolveLaunchBinaryPath,
  serverBinaryPath,
} from "../../domains/instances/launch-args";
import {
  AsaSavedLogsTailer,
  captureAsaLogSessionAnchor,
  type AsaLogSessionAnchor,
} from "./asa-log-tail";
import { createAdoptedChildHandle } from "./adopted-child";
import { ensureLaunchLogFlags, type spawnAsaProcess } from "./process-spawn";
import type { RuntimeLogSource } from "./process-readiness";
import { findWindowsChildProcessByName } from "./windows-child-process";

const ASA_CHILD_ADOPT_ATTEMPTS = 60;
const ASA_CHILD_ADOPT_INTERVAL_MS = 500;

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
  /**
   * When Start used AsaApiLoader, the loader PID (for tree kill). After adopt,
   * `child` tracks ArkAscendedServer.exe (#243).
   */
  loaderPid?: number | null;
  /**
   * True until the first new ShooterGame.log line after an AsaApi Start
   * (UI: “Loading Ark Server API…”).
   */
  asaApiLoading: boolean;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * After spawning AsaApiLoader, adopt the ArkAscendedServer.exe child so stop /
 * crash / Leave track the game PID (docs/server-lifecycle.md).
 */
async function adoptAsaGameChild(
  host: ProcessStartHost,
  profile: ServerProfile,
  managed: ProcessStartManaged,
  loaderChild: ChildProcess,
): Promise<void> {
  const loaderPid = loaderChild.pid;
  if (loaderPid === undefined || loaderPid <= 0) {
    host.appendRuntimeLog(
      profile.id,
      "warning",
      "AsaApiLoader started without a PID; continuing with loader handle",
    );
    return;
  }
  managed.loaderPid = loaderPid;
  host.appendRuntimeLog(
    profile.id,
    "system",
    `AsaApiLoader pid ${loaderPid}; waiting for ArkAscendedServer.exe child`,
  );

  for (let attempt = 0; attempt < ASA_CHILD_ADOPT_ATTEMPTS; attempt += 1) {
    await sleep(ASA_CHILD_ADOPT_INTERVAL_MS);
    if (host.getManaged(profile.id) !== managed) return;

    const gamePid = await findWindowsChildProcessByName(
      loaderPid,
      "ArkAscendedServer.exe",
    );
    if (gamePid === null) continue;

    const gameBinary = serverBinaryPath(profile.installDir);
    const adopted = createAdoptedChildHandle(gamePid);
    managed.child = adopted;
    managed.executablePath = gameBinary;
    host.appendRuntimeLog(
      profile.id,
      "system",
      `Adopted ArkAscendedServer.exe pid ${gamePid} (loader ${loaderPid})`,
    );
    adopted.once("exit", (code) => {
      host.onManagedExit(profile.id, managed, code);
    });
    void host.writeProcessCheckpoint(profile.id, managed);
    host.emitStatus(profile.id);
    return;
  }

  host.appendRuntimeLog(
    profile.id,
    "warning",
    "Timed out waiting for ArkAscendedServer.exe under AsaApiLoader; tracking loader PID",
  );
}

/**
 * Spawn ASA (or AsaApiLoader), register the managed entry, wire stdio/log capture,
 * and kick off readiness (or skip when requested). ProcessManager keeps a thin facade.
 */
export function startManagedProcess(
  host: ProcessStartHost,
  profile: ServerProfile,
  options?: StartServerOptions,
): void {
  if (host.isActive(profile.id)) {
    throw new Error(`Server "${profile.name}" is already running`);
  }
  const injectMode = resolveAsaApiInjectMode(profile);
  const viaLoader = injectMode === "loader";
  syncAsaApiVersionDll(profile.installDir, injectMode);

  const binary = resolveLaunchBinaryPath(profile);
  const gameBinary = serverBinaryPath(profile.installDir);
  if (viaLoader) {
    if (!existsSync(binary)) {
      throw new Error(
        `AsaApiLoader.exe not found at: ${binary}. Install AsaApi from the AsaApi tab first.`,
      );
    }
    if (!existsSync(gameBinary)) {
      throw new Error(`Server executable not found at: ${gameBinary}`);
    }
  } else if (!existsSync(binary)) {
    throw new Error(`Server executable not found at: ${binary}`);
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

  const asaApiLoading = injectMode !== "off";
  host.appendRuntimeLog(profile.id, "system", `Starting process ${binary}`);
  if (injectMode === "versionDll") {
    host.appendRuntimeLog(
      profile.id,
      "system",
      "AsaApi Version.dll mode — starting ArkAscendedServer.exe directly",
    );
  } else if (viaLoader) {
    host.appendRuntimeLog(
      profile.id,
      "system",
      `AsaApiLoader mode — game binary ${gameBinary}`,
    );
  }
  if (asaApiLoading) {
    host.appendRuntimeLog(
      profile.id,
      "system",
      "Loading Ark Server API (Version.dll / plugins). The server window can take a minute before ShooterGame.log appears.",
    );
  }
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
    loaderPid: viaLoader ? (child.pid ?? null) : null,
    asaApiLoading,
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

    if (viaLoader && process.platform === "win32") {
      void adoptAsaGameChild(host, profile, managed, child);
    }

    if (options?.skipReadinessCheck === true) {
      managed.status = "running";
      managed.asaApiLoading = false;
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
    // After adopt, managed.child is the game handle — ignore loader exit.
    if (managed.child !== child) {
      return;
    }
    host.onManagedExit(profile.id, managed, code);
  });
}
