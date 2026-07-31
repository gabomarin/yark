import type { AppSettingsRepository } from "../db/app-settings-repository";
import type { ServerRepository } from "../db/server-repository";
import type { ProcessManager } from "./process-manager";
import {
  classifyLeaveCandidate,
  type LeaveIdentityMatch,
  type LeftRunningProcessIdentity,
  type LiveProcessIdentity,
} from "@shared/left-running";
import {
  clearLeftRunningProcesses,
  readLeftRunningProcesses,
} from "./left-running-store";
import { queryWindowsProcessIdentity } from "./windows-process-identity";

export interface LeaveReattachOutcome {
  serverId: string;
  classification: LeaveIdentityMatch;
  reattached: boolean;
}

export interface ReattachLeftRunningOptions {
  queryOsIdentity?: (pid: number) => LiveProcessIdentity | null;
}

/**
 * On startup: validate durable process checkpoints (crash / unexpected exit),
 * reattach matches, record outcomes. Clears the store before adopting so stale
 * records do not linger; successful reattach rewrites checkpoints via
 * ProcessManager hooks when configured.
 * Must run before any auto-start (#53) so we never spawn a duplicate.
 */
export function reattachLeftRunningProcesses(
  settings: AppSettingsRepository,
  repo: ServerRepository,
  processes: ProcessManager,
  options?: ReattachLeftRunningOptions,
): LeaveReattachOutcome[] {
  const records = readLeftRunningProcesses(settings);
  if (records.length === 0) {
    return [];
  }

  // Drop durable rows first; matches rewrite via onProcessCheckpoint after adopt.
  clearLeftRunningProcesses(settings);

  const queryOs =
    options?.queryOsIdentity ??
    ((pid: number) => queryWindowsProcessIdentity(pid));
  const outcomes: LeaveReattachOutcome[] = [];

  for (const record of records) {
    outcomes.push(processLeaveRecord(record, repo, processes, queryOs));
  }

  return outcomes;
}

function processLeaveRecord(
  record: LeftRunningProcessIdentity,
  repo: ServerRepository,
  processes: ProcessManager,
  queryOs: (pid: number) => LiveProcessIdentity | null,
): LeaveReattachOutcome {
  const profile = repo.get(record.serverId);
  if (profile === null) {
    repo.addEvent(
      null,
      "error",
      "warning",
      `Left-running process pid ${record.pid} ignored: profile ${record.serverId} no longer exists`,
    );
    return {
      serverId: record.serverId,
      classification: "mismatched",
      reattached: false,
    };
  }

  const live = queryOs(record.pid);
  const classification = classifyLeaveCandidate(record, live);

  if (classification !== "match") {
    const detail = leaveClassificationMessage(classification, record.pid);
    repo.addEvent(profile.id, "error", "warning", detail);
    return { serverId: profile.id, classification, reattached: false };
  }

  try {
    processes.reattach(profile, record, { queryOsIdentity: queryOs });
    repo.addEvent(
      profile.id,
      "server_started",
      "info",
      `Reattached to left-running server "${profile.name}" (pid ${record.pid})`,
    );
    return { serverId: profile.id, classification, reattached: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    repo.addEvent(
      profile.id,
      "error",
      "warning",
      `Could not reattach left-running pid ${record.pid}: ${message}`,
    );
    return { serverId: profile.id, classification: "inaccessible", reattached: false };
  }
}

function leaveClassificationMessage(
  classification: LeaveIdentityMatch,
  pid: number,
): string {
  switch (classification) {
    case "missing":
      return `Left-running process pid ${pid} is no longer running`;
    case "stale_pid":
      return `Left-running pid ${pid} was reused by another process (stale identity)`;
    case "mismatched":
      return `Left-running pid ${pid} did not match expected executable/command`;
    case "inaccessible":
      return `Left-running pid ${pid} could not be validated (insufficient OS identity)`;
    case "match":
      return `Left-running pid ${pid} matched`;
  }
}
