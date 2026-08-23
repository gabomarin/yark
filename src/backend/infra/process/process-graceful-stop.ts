import { type ChildProcess } from "node:child_process";
import type { ServerProfile } from "@shared/types";
import type { ProcessStartManaged } from "./process-start";
import { EXIT_WAIT_MS, SAVE_WAIT_MS } from "./process-stop";

export interface GracefulStopHandle {
  readonly serverId: string;
  /** Opaque identity of the exact child that acknowledged SaveWorld. */
  readonly identity: object;
}

export type BeginGracefulStopResult =
  | { phase: "saved"; handle: GracefulStopHandle }
  | { phase: "killed"; handle: null }
  | { phase: "absent"; handle: null };

export type FinishGracefulStopResult =
  | "stopped"
  | "already_exited"
  | "replaced";

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
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  try {
    await host.executeRcon(profile, "SaveWorld");
    await delay(SAVE_WAIT_MS);
    return {
      phase: "saved",
      handle: { serverId: profile.id, identity: managed.identity },
    };
  } catch {
    // Prefer DoExit before force-kill when SaveWorld is unavailable (e.g. still
    // bootstrapping after a readiness wait timeout on quit Stop).
    host.appendRuntimeLog(
      profile.id,
      "warning",
      "RCON SaveWorld unavailable; attempting DoExit before kill",
    );
    try {
      await host.executeRcon(profile, "DoExit");
      const exitedAfterDoExit = await host.waitForExit(managed.child, EXIT_WAIT_MS);
      if (exitedAfterDoExit) {
        if (host.getManaged(profile.id) === managed) {
          host.stopManagedCapture(profile.id, managed);
          host.deleteManaged(profile.id);
          host.clearProcessCheckpoint(profile.id);
          host.emitStatus(profile.id);
        }
        return { phase: "killed", handle: null };
      }
    } catch {
      host.appendRuntimeLog(
        profile.id,
        "warning",
        "RCON DoExit unavailable; applying kill",
      );
    }

    await host.terminateManaged(profile.id, managed);
    let exited = await host.waitForExit(managed.child, EXIT_WAIT_MS);
    if (!exited && host.getManaged(profile.id) === managed) {
      await host.terminateManaged(profile.id, managed);
      exited = await host.waitForExit(managed.child, 5000);
    }
    if (!exited && host.getManaged(profile.id) === managed) {
      managed.status = "error";
      managed.lastError = "Could not terminate process after RCON SaveWorld failed";
      host.appendRuntimeLog(profile.id, "error", managed.lastError);
      host.emitStatus(profile.id);
      throw new Error(managed.lastError);
    }
    if (host.getManaged(profile.id) === managed) {
      host.stopManagedCapture(profile.id, managed);
      host.deleteManaged(profile.id);
      host.clearProcessCheckpoint(profile.id);
      host.emitStatus(profile.id);
    }
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

  try {
    await host.executeRcon(profile, "DoExit");
  } catch {
    host.appendRuntimeLog(profile.id, "warning", "RCON DoExit failed; applying kill");
    await host.terminateManaged(profile.id, managed);
  }

  const exited = await host.waitForExit(managed.child, EXIT_WAIT_MS);
  if (!exited) {
    await host.terminateManaged(profile.id, managed);
    const forcedExit = await host.waitForExit(managed.child, 5000);
    if (!forcedExit && host.getManaged(profile.id) === managed) {
      managed.status = "error";
      managed.lastError = "Could not terminate process after RCON DoExit";
      host.appendRuntimeLog(profile.id, "error", managed.lastError);
      host.emitStatus(profile.id);
      throw new Error(managed.lastError);
    }
  }
  if (host.getManaged(profile.id) === managed) {
    host.stopManagedCapture(profile.id, managed);
    host.deleteManaged(profile.id);
    host.clearProcessCheckpoint(profile.id);
    host.emitStatus(profile.id);
  }
  return "stopped";
}
