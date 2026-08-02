/**
 * Durable identity for ASA processes left running across a YARK quit (#59).
 * Never trust PID alone — pair with creation time, executable, and command line.
 */

import { PORT_MAX, PORT_MIN, type SessionPortSet } from "./types";

export const LEFT_RUNNING_PROCESSES_SETTING_KEY = "leftRunningProcesses";

export const LEFT_RUNNING_SCHEMA_VERSION = 1 as const;

export interface LeftRunningProcessIdentity {
  schemaVersion: typeof LEFT_RUNNING_SCHEMA_VERSION;
  /** Profile id this process belonged to. */
  serverId: string;
  pid: number;
  /** Absolute path to ArkAscendedServer.exe as YARK spawned it. */
  executablePath: string;
  installDir: string;
  /** ISO timestamp when YARK started tracking the child. */
  startedAt: string;
  /** Full expected command line (exe + args) YARK launched. */
  expectedCommandLine: string;
  /** Argv used at spawn (excluding the executable). */
  launchArgs: string[];
  /**
   * Ports the live process is actually using (includes session-only overrides).
   * Optional for older leave/checkpoint rows; reattach falls back to the saved profile.
   */
  runtimePorts?: SessionPortSet;
  /**
   * OS process creation stamp (WMI CreationDate or ISO).
   * Rejects stale PID reuse when present on both sides.
   */
  osCreationTime: string | null;
  /** Executable path reported by the OS at leave time (best-effort). */
  osExecutablePath: string | null;
  /** ISO timestamp when Leave metadata was written. */
  leftAt: string;
}

export type LeaveIdentityMatch =
  | "match"
  | "missing"
  | "stale_pid"
  | "mismatched"
  | "inaccessible";

/** Live OS view used to validate a persisted leave record. */
export interface LiveProcessIdentity {
  pid: number;
  executablePath: string | null;
  commandLine: string | null;
  osCreationTime: string | null;
}

function normalizePath(value: string): string {
  return value.trim().replace(/\//g, "\\").toLowerCase();
}

function pathsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null || a.trim() === "" || b.trim() === "") {
    return false;
  }
  return normalizePath(a) === normalizePath(b);
}

/**
 * Classify a live process (or absence) against durable Leave metadata.
 * Prefer rejecting over claiming a reused PID is still our managed server.
 *
 * A match requires PID + matching OS creation time (and exe when the OS
 * reports one). Never accept PID+exe alone — that fails “never trust PID alone”.
 */
export function classifyLeaveCandidate(
  record: LeftRunningProcessIdentity,
  live: LiveProcessIdentity | null,
): LeaveIdentityMatch {
  if (live === null) {
    return "missing";
  }
  if (live.pid !== record.pid) {
    return "mismatched";
  }

  if (record.osCreationTime === null || record.osCreationTime.trim() === "") {
    return "inaccessible";
  }
  if (live.osCreationTime === null || live.osCreationTime.trim() === "") {
    return "inaccessible";
  }
  if (record.osCreationTime !== live.osCreationTime) {
    return "stale_pid";
  }

  const expectedExe = record.osExecutablePath ?? record.executablePath;
  if (live.executablePath !== null && !pathsEqual(live.executablePath, expectedExe)) {
    return "mismatched";
  }

  return "match";
}

/** Loose command-line compare: ignore quote/spacing differences; require exe + key tokens. */
export function commandLinesCompatible(expected: string, live: string): boolean {
  const normalize = (value: string): string =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .replace(/"/g, "")
      .toLowerCase();
  const a = normalize(expected);
  const b = normalize(live);
  if (a === b) {
    return true;
  }
  // Live WMI command lines sometimes omit outer quotes; require expected as substring.
  return b.includes(a) || a.includes(b);
}

export function parseLeftRunningProcesses(
  raw: string | null | undefined,
): LeftRunningProcessIdentity[] {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      const record = coerceLeaveIdentity(item);
      return record === null ? [] : [record];
    });
  } catch {
    return [];
  }
}

function coerceSessionPorts(value: unknown): SessionPortSet | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const row = value as Record<string, unknown>;
  const gamePort = row.gamePort;
  const queryPort = row.queryPort;
  const rconPort = row.rconPort;
  if (
    typeof gamePort !== "number" ||
    typeof queryPort !== "number" ||
    typeof rconPort !== "number" ||
    !Number.isInteger(gamePort) ||
    !Number.isInteger(queryPort) ||
    !Number.isInteger(rconPort) ||
    gamePort < PORT_MIN ||
    gamePort > PORT_MAX ||
    queryPort < PORT_MIN ||
    queryPort > PORT_MAX ||
    rconPort < PORT_MIN ||
    rconPort > PORT_MAX ||
    gamePort === queryPort ||
    gamePort === rconPort ||
    queryPort === rconPort
  ) {
    return undefined;
  }
  return { gamePort, queryPort, rconPort };
}

function coerceLeaveIdentity(value: unknown): LeftRunningProcessIdentity | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== LEFT_RUNNING_SCHEMA_VERSION) {
    return null;
  }
  if (typeof row.serverId !== "string" || row.serverId.trim() === "") {
    return null;
  }
  if (typeof row.pid !== "number" || !Number.isInteger(row.pid) || row.pid <= 0) {
    return null;
  }
  if (typeof row.executablePath !== "string" || row.executablePath.trim() === "") {
    return null;
  }
  if (typeof row.installDir !== "string" || row.installDir.trim() === "") {
    return null;
  }
  if (typeof row.startedAt !== "string" || row.startedAt.trim() === "") {
    return null;
  }
  if (typeof row.expectedCommandLine !== "string") {
    return null;
  }
  if (!Array.isArray(row.launchArgs) || !row.launchArgs.every((a) => typeof a === "string")) {
    return null;
  }
  if (typeof row.leftAt !== "string" || row.leftAt.trim() === "") {
    return null;
  }
  const osCreationTime =
    row.osCreationTime === null || typeof row.osCreationTime === "string"
      ? (row.osCreationTime as string | null)
      : null;
  const osExecutablePath =
    row.osExecutablePath === null || typeof row.osExecutablePath === "string"
      ? (row.osExecutablePath as string | null)
      : null;
  if (typeof row.osCreationTime !== "string" && row.osCreationTime !== null) {
    return null;
  }
  if (typeof row.osExecutablePath !== "string" && row.osExecutablePath !== null) {
    return null;
  }
  const runtimePorts = coerceSessionPorts(row.runtimePorts);
  return {
    schemaVersion: LEFT_RUNNING_SCHEMA_VERSION,
    serverId: row.serverId,
    pid: row.pid,
    executablePath: row.executablePath,
    installDir: row.installDir,
    startedAt: row.startedAt,
    expectedCommandLine: row.expectedCommandLine,
    launchArgs: row.launchArgs as string[],
    ...(runtimePorts !== undefined ? { runtimePorts } : {}),
    osCreationTime,
    osExecutablePath,
    leftAt: row.leftAt,
  };
}
