import { type ChildProcess } from "node:child_process";
import type { ServerProfile } from "@shared/types";
import {
  LEFT_RUNNING_SCHEMA_VERSION,
  classifyLeaveCandidate,
  type LeftRunningProcessIdentity,
  type LiveProcessIdentity,
} from "@shared/left-running";
import {
  AsaSavedLogsTailer,
  captureAsaLogSessionAnchor,
} from "./asa-log-tail";
import { disconnectChildStdio } from "./process-spawn";
import type { ProcessStartManaged } from "./process-start";

type LeaveManagedProcess = ProcessStartManaged;

export interface ProcessLeaveHost {
  isActive(serverId: string): boolean;
  getManaged(serverId: string): LeaveManagedProcess | undefined;
  queryOsIdentity(pid: number): Promise<LiveProcessIdentity | null>;
  appendRuntimeLog(serverId: string, source: string, message: string): void;
  stopManagedCapture(serverId: string, managed: LeaveManagedProcess): void;
  deleteManaged(serverId: string): void;
  emitStatus(serverId: string): void;
  createAdoptedChild(pid: number): ChildProcess;
  setManaged(serverId: string, managed: LeaveManagedProcess): void;
  writeProcessCheckpoint(
    serverId: string,
    managed: LeaveManagedProcess,
    live?: LiveProcessIdentity | null,
  ): Promise<void>;
  captureRuntimeChunk(serverId: string, source: "log", text: string): void;
  onManagedExit(
    serverId: string,
    managed: LeaveManagedProcess,
    code: number | null,
  ): void;
  waitUntilReady(
    profile: ServerProfile,
    managed: LeaveManagedProcess,
    generation: number,
    options?: { terminateOnTimeout?: boolean },
  ): Promise<void>;
}

/**
 * Snapshot process identities for durable recovery metadata.
 * Requires OS creation time so the next launch can reject PID reuse.
 */
export async function collectLeaveIdentities(
  host: ProcessLeaveHost,
  profiles: ServerProfile[],
  options?: {
    queryOsIdentity?: (pid: number) => Promise<LiveProcessIdentity | null>;
    leftAt?: string;
  },
): Promise<LeftRunningProcessIdentity[]> {
  const queryOs =
    options?.queryOsIdentity ??
    ((pid: number) => host.queryOsIdentity(pid));
  const leftAt = options?.leftAt ?? new Date().toISOString();
  const records: LeftRunningProcessIdentity[] = [];

  for (const profile of profiles) {
    const managed = host.getManaged(profile.id);
    if (managed === undefined || !host.isActive(profile.id)) {
      continue;
    }
    const pid = managed.child.pid;
    if (pid === undefined || !Number.isInteger(pid) || pid <= 0) {
      throw new Error(
        `Cannot leave "${profile.name}" running: process id is unavailable`,
      );
    }

    const live = await queryOs(pid);
    const osCreationTime = live?.osCreationTime?.trim() || null;
    if (osCreationTime === null) {
      throw new Error(
        `Cannot leave "${profile.name}" running: OS process creation time is unavailable (needed to reject PID reuse)`,
      );
    }

    records.push({
      schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
      serverId: profile.id,
      pid,
      executablePath: managed.executablePath,
      installDir: managed.installDir,
      startedAt: managed.startedAt,
      expectedCommandLine: managed.expectedCommandLine,
      launchArgs: [...managed.launchArgs],
      runtimePorts: { ...managed.runtimePorts },
      osCreationTime,
      osExecutablePath: live?.executablePath ?? null,
      leftAt,
    });
  }

  return records;
}

/**
 * Detach previously snapshotted Leave processes (after durable metadata write).
 */
export function detachAfterLeavePersist(
  host: ProcessLeaveHost,
  records: LeftRunningProcessIdentity[],
): void {
  for (const record of records) {
    const managed = host.getManaged(record.serverId);
    if (managed === undefined || !host.isActive(record.serverId)) {
      continue;
    }
    if (managed.child.pid !== record.pid) {
      throw new Error(
        `Cannot detach "${record.serverId}": process id changed since Leave snapshot`,
      );
    }

    host.appendRuntimeLog(
      record.serverId,
      "system",
      `Detaching for Leave running (pid ${record.pid}); process stays alive`,
    );
    host.stopManagedCapture(record.serverId, managed);
    managed.readinessGeneration += 1;
    disconnectChildStdio(managed.child);
    try {
      managed.child.unref();
    } catch {
      // Ignore: some test fakes omit unref.
    }
    if (host.getManaged(record.serverId) === managed) {
      host.deleteManaged(record.serverId);
      host.emitStatus(record.serverId);
    }
  }
}

/**
 * @deprecated Prefer {@link collectLeaveIdentities} + {@link detachAfterLeavePersist}.
 */
export async function detachForLeave(
  host: ProcessLeaveHost,
  profiles: ServerProfile[],
  options?: {
    queryOsIdentity?: (pid: number) => Promise<LiveProcessIdentity | null>;
    leftAt?: string;
  },
): Promise<LeftRunningProcessIdentity[]> {
  const records = await collectLeaveIdentities(host, profiles, options);
  detachAfterLeavePersist(host, records);
  return records;
}

/**
 * Reattach to a validated crash-recovery process (same profile + OS identity).
 */
export async function reattachManagedProcess(
  host: ProcessLeaveHost,
  profile: ServerProfile,
  record: LeftRunningProcessIdentity,
  options?: {
    skipReadinessCheck?: boolean;
    queryOsIdentity?: (pid: number) => Promise<LiveProcessIdentity | null>;
  },
): Promise<void> {
  if (host.isActive(profile.id)) {
    throw new Error(`Server "${profile.name}" is already running`);
  }
  if (record.serverId !== profile.id) {
    throw new Error("Leave identity serverId does not match profile");
  }
  if (!Number.isInteger(record.pid) || record.pid <= 0) {
    throw new Error("Leave identity has an invalid process id");
  }

  const queryOs = options?.queryOsIdentity ?? ((pid: number) => host.queryOsIdentity(pid));
  const live = await queryOs(record.pid);
  const classification = classifyLeaveCandidate(record, live);
  if (classification !== "match") {
    throw new Error(
      `Leave identity for "${profile.name}" failed re-validation (${classification})`,
    );
  }

  const child = host.createAdoptedChild(record.pid);
  const runtimePorts = record.runtimePorts ?? {
    gamePort: profile.gamePort,
    queryPort: profile.queryPort,
    rconPort: profile.rconPort,
  };
  const managed: LeaveManagedProcess = {
    child,
    identity: {},
    status: "starting",
    startedAt: record.startedAt,
    lastError: null,
    readinessGeneration: 0,
    logTailer: null,
    logSessionAnchor: captureAsaLogSessionAnchor(record.installDir),
    executablePath: record.executablePath,
    installDir: record.installDir,
    launchArgs: [...record.launchArgs],
    expectedCommandLine: record.expectedCommandLine,
    runtimePorts: { ...runtimePorts },
  };
  host.setManaged(profile.id, managed);
  host.appendRuntimeLog(
    profile.id,
    "system",
    `Reattached to left-running process (pid ${record.pid})`,
  );
  void host.writeProcessCheckpoint(profile.id, managed, live);

  managed.logTailer = new AsaSavedLogsTailer(profile.installDir, (text) => {
    if (host.getManaged(profile.id) !== managed) return;
    host.captureRuntimeChunk(profile.id, "log", text);
  });
  managed.logTailer.start(managed.logSessionAnchor);
  host.appendRuntimeLog(
    profile.id,
    "system",
    "Waiting for RCON readiness after crash-recovery reattach…",
  );
  host.emitStatus(profile.id);

  child.once("exit", (code) => {
    host.onManagedExit(profile.id, managed, code);
  });

  if (options?.skipReadinessCheck === true) {
    managed.status = "running";
    host.appendRuntimeLog(
      profile.id,
      "system",
      "Readiness skipped after reattach; status running",
    );
    host.emitStatus(profile.id);
    return;
  }

  managed.readinessGeneration += 1;
  void host.waitUntilReady(
    {
      ...profile,
      gamePort: managed.runtimePorts.gamePort,
      queryPort: managed.runtimePorts.queryPort,
      rconPort: managed.runtimePorts.rconPort,
    },
    managed,
    managed.readinessGeneration,
    {
      terminateOnTimeout: false,
    },
  );
}
