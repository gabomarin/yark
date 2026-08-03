import { createSocket } from "node:dgram";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  formatHostPortBusyError,
  formatHostPortInconclusiveError,
  type SessionPortSet,
} from "@shared/host-port-probe-errors";
import { PORT_MAX, PORT_MIN, type ServerProfile } from "@shared/types";

const execFileAsync = promisify(execFile);

export type PortKind = "game" | "query" | "rcon";
export type PortProtocol = "udp" | "tcp";
export type ProbeStatus = "free" | "busy" | "inconclusive";

export interface EndpointProbeResult {
  kind: PortKind;
  port: number;
  protocol: PortProtocol;
  status: ProbeStatus;
  pid?: number;
  processName?: string;
  detail?: string;
}

export interface PortOwnerInfo {
  pid: number;
  processName: string | null;
}

export interface HostPortProbeDeps {
  bindUdp?: (port: number) => Promise<ProbeStatus>;
  bindTcp?: (port: number) => Promise<ProbeStatus>;
  lookupOwner?: (
    protocol: PortProtocol,
    port: number,
  ) => Promise<PortOwnerInfo | null>;
}

export interface AssertHostPortsOptions {
  /**
   * When true, inconclusive probe results do not block start.
   * Busy endpoints still always block.
   */
  allowInconclusive?: boolean;
  deps?: HostPortProbeDeps;
}

const BIND_TIMEOUT_MS = 2_000;
const OWNER_QUERY_TIMEOUT_MS = 5_000;
const SUGGEST_OFFSET_STEP = 10;
const SUGGEST_MAX_OFFSET = 1_000;

type ProfilePorts = Pick<
  ServerProfile,
  "id" | "name" | "gamePort" | "queryPort" | "rconPort"
>;

function defaultBindUdp(port: number): Promise<ProbeStatus> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    let settled = false;
    const finish = (status: ProbeStatus): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      try {
        socket.close(() => resolve(status));
      } catch {
        resolve(status);
      }
    };
    const timer = setTimeout(() => finish("inconclusive"), BIND_TIMEOUT_MS);
    socket.once("error", (err: NodeJS.ErrnoException) => {
      finish(err.code === "EADDRINUSE" ? "busy" : "inconclusive");
    });
    try {
      socket.bind({ port, exclusive: true }, () => finish("free"));
    } catch (err: unknown) {
      const code =
        err instanceof Error
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      finish(code === "EADDRINUSE" ? "busy" : "inconclusive");
    }
  });
}

function defaultBindTcp(port: number): Promise<ProbeStatus> {
  return new Promise((resolve) => {
    const server = createServer();
    let settled = false;
    const finish = (status: ProbeStatus): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.removeAllListeners();
      server.close(() => resolve(status));
    };
    const timer = setTimeout(() => finish("inconclusive"), BIND_TIMEOUT_MS);
    server.once("error", (err: NodeJS.ErrnoException) => {
      finish(err.code === "EADDRINUSE" ? "busy" : "inconclusive");
    });
    try {
      server.listen({ port, host: "0.0.0.0", exclusive: true }, () =>
        finish("free"),
      );
    } catch (err: unknown) {
      const code =
        err instanceof Error
          ? (err as NodeJS.ErrnoException).code
          : undefined;
      finish(code === "EADDRINUSE" ? "busy" : "inconclusive");
    }
  });
}

interface NetEndpointRow {
  OwningProcess?: number;
  ProcessName?: string | null;
}

/**
 * Parses ConvertTo-Json output from the Windows owner lookup script.
 * Exported for unit tests — never treat free text as a port.
 */
export function parseOwnerLookupJson(raw: string): PortOwnerInfo | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  let parsed: NetEndpointRow;
  try {
    parsed = JSON.parse(trimmed) as NetEndpointRow;
  } catch {
    return null;
  }
  if (
    typeof parsed.OwningProcess !== "number" ||
    !Number.isInteger(parsed.OwningProcess) ||
    parsed.OwningProcess <= 0
  ) {
    return null;
  }
  return {
    pid: parsed.OwningProcess,
    processName:
      typeof parsed.ProcessName === "string" &&
      parsed.ProcessName.trim() !== ""
        ? parsed.ProcessName
        : null,
  };
}

/**
 * Best-effort Windows owner lookup. Numeric port only — never interpolate free text.
 * Uses async execFile so the Electron main process is not blocked.
 */
export async function defaultLookupOwner(
  protocol: PortProtocol,
  port: number,
): Promise<PortOwnerInfo | null> {
  if (
    process.platform !== "win32" ||
    !Number.isInteger(port) ||
    port < PORT_MIN ||
    port > PORT_MAX
  ) {
    return null;
  }
  const safePort = port;
  const endpointCmd =
    protocol === "tcp"
      ? `Get-NetTCPConnection -LocalPort ${safePort} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 OwningProcess`
      : `Get-NetUDPEndpoint -LocalPort ${safePort} -ErrorAction SilentlyContinue | Select-Object -First 1 OwningProcess`;
  const script = [
    `$row = ${endpointCmd}`,
    `if ($null -eq $row -or $null -eq $row.OwningProcess) { '' } else {`,
    `  $procId = [int]$row.OwningProcess`,
    `  $name = $null`,
    `  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}`,
    `  @{ OwningProcess = $procId; ProcessName = $name } | ConvertTo-Json -Compress`,
    `}`,
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        timeout: OWNER_QUERY_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
    return parseOwnerLookupJson(stdout);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(
      `[yark] host port owner lookup failed for ${protocol}/${safePort}: ${detail}`,
    );
    return null;
  }
}

function resolveDeps(deps?: HostPortProbeDeps): Required<HostPortProbeDeps> {
  return {
    bindUdp: deps?.bindUdp ?? defaultBindUdp,
    bindTcp: deps?.bindTcp ?? defaultBindTcp,
    lookupOwner: deps?.lookupOwner ?? defaultLookupOwner,
  };
}

export async function probeEndpoint(
  kind: PortKind,
  port: number,
  deps?: HostPortProbeDeps,
): Promise<EndpointProbeResult> {
  const resolved = resolveDeps(deps);
  const protocol: PortProtocol = kind === "rcon" ? "tcp" : "udp";
  const status =
    protocol === "tcp"
      ? await resolved.bindTcp(port)
      : await resolved.bindUdp(port);

  if (status !== "busy") {
    return { kind, port, protocol, status };
  }

  const owner = await resolved.lookupOwner(protocol, port);
  return {
    kind,
    port,
    protocol,
    status: "busy",
    pid: owner?.pid,
    processName: owner?.processName ?? undefined,
  };
}

export async function probeProfilePorts(
  ports: SessionPortSet,
  deps?: HostPortProbeDeps,
): Promise<EndpointProbeResult[]> {
  return Promise.all([
    probeEndpoint("game", ports.gamePort, deps),
    probeEndpoint("query", ports.queryPort, deps),
    probeEndpoint("rcon", ports.rconPort, deps),
  ]);
}

export function collectReservedPorts(
  profiles: ReadonlyArray<
    Pick<ServerProfile, "gamePort" | "queryPort" | "rconPort">
  >,
): Set<number> {
  const reserved = new Set<number>();
  for (const profile of profiles) {
    reserved.add(profile.gamePort);
    reserved.add(profile.queryPort);
    reserved.add(profile.rconPort);
  }
  return reserved;
}

function inRange(port: number): boolean {
  return (
    Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX
  );
}

function isDistinctSet(ports: SessionPortSet): boolean {
  return (
    ports.gamePort !== ports.queryPort &&
    ports.gamePort !== ports.rconPort &&
    ports.queryPort !== ports.rconPort
  );
}

export async function suggestSessionPortSet(
  base: SessionPortSet,
  reserved: ReadonlySet<number>,
  deps?: HostPortProbeDeps,
): Promise<SessionPortSet | null> {
  const resolved = resolveDeps(deps);
  for (
    let offset = SUGGEST_OFFSET_STEP;
    offset <= SUGGEST_MAX_OFFSET;
    offset += SUGGEST_OFFSET_STEP
  ) {
    const candidate: SessionPortSet = {
      gamePort: base.gamePort + offset,
      queryPort: base.queryPort + offset,
      rconPort: base.rconPort + offset,
    };
    if (
      !inRange(candidate.gamePort) ||
      !inRange(candidate.queryPort) ||
      !inRange(candidate.rconPort) ||
      !isDistinctSet(candidate)
    ) {
      continue;
    }
    if (
      reserved.has(candidate.gamePort) ||
      reserved.has(candidate.queryPort) ||
      reserved.has(candidate.rconPort)
    ) {
      continue;
    }

    const [game, query, rcon] = await Promise.all([
      resolved.bindUdp(candidate.gamePort),
      resolved.bindUdp(candidate.queryPort),
      resolved.bindTcp(candidate.rconPort),
    ]);
    if (game === "free" && query === "free" && rcon === "free") {
      return candidate;
    }
  }
  return null;
}

function describeEndpoint(result: EndpointProbeResult): string {
  const proto = result.protocol.toUpperCase();
  const base = `${proto} ${result.kind} port ${result.port}`;
  if (result.status === "busy") {
    if (result.pid != null) {
      const name =
        result.processName != null && result.processName.length > 0
          ? ` (${result.processName})`
          : "";
      return `${base} is already in use by pid ${result.pid}${name}`;
    }
    return `${base} is already in use`;
  }
  if (result.status === "inconclusive") {
    return `Could not confirm whether ${base} is free`;
  }
  return `${base} is free`;
}

/**
 * Probes game (UDP), query (UDP), and RCON (TCP). Throws a parseable error when
 * any endpoint is busy, or when inconclusive and `allowInconclusive` is false.
 * Suggestions are bind-confirmed free only.
 */
export async function assertHostPortsAvailable(
  profile: ProfilePorts,
  otherProfiles: ReadonlyArray<
    Pick<ServerProfile, "gamePort" | "queryPort" | "rconPort">
  >,
  options?: AssertHostPortsOptions,
): Promise<void> {
  const ports: SessionPortSet = {
    gamePort: profile.gamePort,
    queryPort: profile.queryPort,
    rconPort: profile.rconPort,
  };
  const results = await probeProfilePorts(ports, options?.deps);
  const busy = results.filter((item) => item.status === "busy");
  const inconclusive = results.filter((item) => item.status === "inconclusive");
  if (busy.length === 0 && inconclusive.length === 0) {
    return;
  }

  if (
    busy.length === 0 &&
    inconclusive.length > 0 &&
    options?.allowInconclusive === true
  ) {
    return;
  }

  const reserved = collectReservedPorts([ports, ...otherProfiles]);
  const suggested = await suggestSessionPortSet(ports, reserved, options?.deps);
  const primary = busy[0] ?? inconclusive[0]!;
  const detail =
    busy.length > 0
      ? `${describeEndpoint(primary)}. Change ports permanently in Server settings, or start this session on a free suggested set when offered.`
      : `${describeEndpoint(primary)}. You can start anyway (ports may still fail at bind), use a suggested free set for this session, or edit saved ports.`;

  if (busy.length > 0) {
    throw new Error(formatHostPortBusyError(detail, suggested));
  }
  throw new Error(formatHostPortInconclusiveError(detail, suggested));
}
