import { type ChildProcess } from "node:child_process";
import type { ServerProfile } from "@shared/types";
import type { AsaLogSessionAnchor } from "./asa-log-tail";
import type { ProcessStartManaged } from "./process-start";
import { assessShutdownLog, delay, waitForCleanShutdown, type ShutdownWaitResult } from "./shutdown-confirm";

export interface GracefulStopHandle {
  readonly serverId: string;
  /** Opaque identity of the exact child that acknowledged SaveWorld. */
  readonly identity: object;
}

export type BeginGracefulStopResult =
  | { phase: "saved"; handle: GracefulStopHandle }
  | { phase: "killed"; handle: null }
  | { phase: "absent"; handle: null };

export type FinishGracefulStopResult = "stopped" | "already_exited" | "replaced";

export interface ProcessGracefulStopHost {
  getManaged(serverId: string): ProcessStartManaged | undefined;
  appendRuntimeLog(serverId: string, source: string, message: string): void;
  emitStatus(serverId: string): void;
  executeRcon(profile: ServerProfile, command: string): Promise<string>;
  waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean>;
  stopManagedCapture(serverId: string, managed: ProcessStartManaged): void;
  deleteManaged(serverId: string): void;
  clearProcessCheckpoint(serverId: string): void;
  terminateManaged(serverId: string, managed: ProcessStartManaged): Promise<void>;
  /** Byte offset of ShooterGame.log so a wait ignores older save lines. */
  captureLogMark(installDir: string): AsaLogSessionAnchor;
  /** ShooterGame.log bytes written after `mark`. */
  readLogSince(installDir: string, mark: AsaLogSessionAnchor): string;
  /** Test hook. Production uses real time. */
  sleep?(ms: number): Promise<void>;
  /** Test hook. Production uses `Date.now`. */
  now?(): number;
}

function clock(host: ProcessGracefulStopHost): { sleep: (ms: number) => Promise<void>; now: () => number } {
  return {
    sleep: host.sleep ?? delay,
    now: host.now ?? Date.now,
  };
}

function sameProcess(
  host: ProcessGracefulStopHost,
  profile: ServerProfile,
  managed: ProcessStartManaged,
): boolean {
  return host.getManaged(profile.id) === managed && managed.child.exitCode === null;
}

function releaseIfCurrent(
  host: ProcessGracefulStopHost,
  profile: ServerProfile,
  managed: ProcessStartManaged,
): void {
  if (host.getManaged(profile.id) !== managed) return;
  host.stopManagedCapture(profile.id, managed);
  host.deleteManaged(profile.id);
  host.clearProcessCheckpoint(profile.id);
  host.emitStatus(profile.id);
}

async function forceKill(
  host: ProcessGracefulStopHost,
  profile: ServerProfile,
  managed: ProcessStartManaged,
  message: string,
): Promise<"killed" | "stuck"> {
  host.appendRuntimeLog(profile.id, "warning", message);
  await host.terminateManaged(profile.id, managed);
  let exited = await host.waitForExit(managed.child, 5000);
  if (!exited && host.getManaged(profile.id) === managed) {
    await host.terminateManaged(profile.id, managed);
    exited = await host.waitForExit(managed.child, 5000);
  }
  return exited || host.getManaged(profile.id) !== managed ? "killed" : "stuck";
}

function stuck(host: ProcessGracefulStopHost, profile: ServerProfile, managed: ProcessStartManaged, message: string): never {
  managed.status = "error";
  managed.lastError = message;
  host.appendRuntimeLog(profile.id, "error", message);
  host.emitStatus(profile.id);
  throw new Error(message);
}

/**
 * DoExit saves and exits. `Closing by request` means shutdown started.
 * Force-kill only if the process is still alive after the shutdown cap
 * and ShooterGame.log never prints `Log file closed`.
 */
async function shutdownAfterDoExit(
  host: ProcessGracefulStopHost,
  profile: ServerProfile,
  managed: ProcessStartManaged,
): Promise<"exited" | "killed" | "stuck"> {
  const mark = host.captureLogMark(profile.installDir);
  try {
    await host.executeRcon(profile, "DoExit");
  } catch {
    return forceKill(host, profile, managed, "RCON DoExit failed; applying kill");
  }

  host.appendRuntimeLog(profile.id, "system", "Waiting for the server to finish closing");
  const readLog = (): string => host.readLogSince(profile.installDir, mark);
  const outcome: ShutdownWaitResult = await waitForCleanShutdown({
    ...clock(host),
    readLog,
    hasExited: () => !sameProcess(host, profile, managed),
  });
  if (outcome === "timeout") {
    return forceKill(host, profile, managed, "Server did not finish closing (no Log file closed); forcing shutdown");
  }
  if (assessShutdownLog(readLog()).logFileClosed) {
    host.appendRuntimeLog(profile.id, "system", "ShooterGame.log closed");
  }
  return "exited";
}

export async function beginGracefulStop(
  host: ProcessGracefulStopHost,
  profile: ServerProfile,
): Promise<BeginGracefulStopResult> {
  const managed = host.getManaged(profile.id);
  if (managed === undefined) return { phase: "absent", handle: null };
  managed.readinessGeneration += 1;
  managed.status = "stopping";
  host.appendRuntimeLog(profile.id, "system", "Attempting safe stop via RCON");
  host.emitStatus(profile.id);

  const handle: GracefulStopHandle = { serverId: profile.id, identity: managed.identity };
  try {
    await host.executeRcon(profile, "SaveWorld");
    host.appendRuntimeLog(profile.id, "system", "SaveWorld sent");
    return { phase: "saved", handle };
  } catch {
    // Prefer DoExit before force-kill when SaveWorld is unavailable (e.g. still
    // bootstrapping after a readiness wait timeout on quit Stop).
    host.appendRuntimeLog(profile.id, "warning", "RCON SaveWorld unavailable; attempting DoExit before kill");
    const outcome = await shutdownAfterDoExit(host, profile, managed);
    if (outcome === "stuck") {
      stuck(host, profile, managed, "Could not terminate process after RCON SaveWorld failed");
    }
    releaseIfCurrent(host, profile, managed);
    return { phase: "killed", handle: null };
  }
}

export async function finishGracefulStop(
  host: ProcessGracefulStopHost,
  profile: ServerProfile,
  handle: GracefulStopHandle,
): Promise<FinishGracefulStopResult> {
  const managed = host.getManaged(profile.id);
  if (managed === undefined) return "already_exited";
  if (managed.identity !== handle.identity || handle.serverId !== profile.id) {
    return "replaced";
  }

  const outcome = await shutdownAfterDoExit(host, profile, managed);
  if (outcome === "stuck") {
    stuck(host, profile, managed, "Could not terminate process after RCON DoExit");
  }
  releaseIfCurrent(host, profile, managed);
  return "stopped";
}
